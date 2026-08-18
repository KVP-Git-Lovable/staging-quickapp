import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Lock, Pencil, Save, X, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * Month-wise target grid for a single employee.
 *
 * Shows Monthly Target, Working Days and an auto-calculated Daily Average for
 * every month of the FY plan. Monthly Target and Working Days are editable one
 * row at a time; Daily Average is always derived (target ÷ working days) and is
 * never stored or typed.
 *
 * Reads and writes only `user_business_plan_months` — no schema change, and no
 * effect on allocation maths, achievement calculations or the Targets tab.
 */

const FY_MONTHS = [
  { number: 1, name: 'April' },
  { number: 2, name: 'May' },
  { number: 3, name: 'June' },
  { number: 4, name: 'July' },
  { number: 5, name: 'August' },
  { number: 6, name: 'September' },
  { number: 7, name: 'October' },
  { number: 8, name: 'November' },
  { number: 9, name: 'December' },
  { number: 10, name: 'January' },
  { number: 11, name: 'February' },
  { number: 12, name: 'March' },
];

const formatNumber = (num: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(num);

const parseNum = (value: string) => {
  const num = parseFloat(value.replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
};

/** Daily average = monthly target ÷ working days. Null when it cannot be computed. */
const dailyAverage = (target: number, workingDays: number): number | null =>
  workingDays > 0 ? target / workingDays : null;

const formatDaily = (target: number, workingDays: number) => {
  const value = dailyAverage(target, workingDays);
  return value === null ? '—' : value.toFixed(2);
};

interface MonthRow {
  month_number: number;
  month_name: string | null;
  quantity_target: number;
  revenue_target: number;
  working_days: number;
}

interface DraftRow {
  quantityTarget: number;
  revenueTarget: number;
  workingDays: number;
}

interface MonthlyTargetGridProps {
  userId: string;
  userName: string;
  fyYear: number;
  quantityUnit: string;
  enabledMetrics: { quantity: boolean; revenue: boolean; visits: boolean };
  targetStartMonth?: number;
  targetEndMonth?: number;
}

export function MonthlyTargetGrid({
  userId,
  userName,
  fyYear,
  quantityUnit,
  enabledMetrics,
  targetStartMonth = 1,
  targetEndMonth = 12,
}: MonthlyTargetGridProps) {
  const queryClient = useQueryClient();
  const [editingMonth, setEditingMonth] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftRow | null>(null);

  // The plan row this employee's months hang off.
  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['ubp-plan', userId, fyYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_business_plans')
        .select('id, quantity_target, revenue_target')
        .eq('user_id', userId)
        .eq('year', fyYear)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: months = [], isLoading: monthsLoading } = useQuery({
    queryKey: ['ubp-months', plan?.id],
    queryFn: async (): Promise<MonthRow[]> => {
      if (!plan?.id) return [];
      const { data, error } = await supabase
        .from('user_business_plan_months')
        .select('month_number, month_name, quantity_target, revenue_target, working_days')
        .eq('business_plan_id', plan.id)
        .order('month_number');
      if (error) throw error;
      return (data || []).map(m => ({
        month_number: m.month_number,
        month_name: m.month_name,
        quantity_target: Number(m.quantity_target) || 0,
        revenue_target: Number(m.revenue_target) || 0,
        working_days: Number(m.working_days) || 0,
      }));
    },
    enabled: !!plan?.id,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ monthNumber, values }: { monthNumber: number; values: DraftRow }) => {
      if (!plan?.id) throw new Error('No business plan for this user');
      const payload: Record<string, number> = { working_days: values.workingDays };
      if (enabledMetrics.quantity) payload.quantity_target = values.quantityTarget;
      if (enabledMetrics.revenue) payload.revenue_target = values.revenueTarget;

      const { error } = await supabase
        .from('user_business_plan_months')
        .update(payload)
        .eq('business_plan_id', plan.id)
        .eq('month_number', monthNumber);
      if (error) throw error;
      return { monthNumber, values };
    },
    onSuccess: ({ monthNumber, values }) => {
      queryClient.invalidateQueries({ queryKey: ['ubp-months', plan?.id] });
      const label = FY_MONTHS.find(m => m.number === monthNumber)?.name ?? `Month ${monthNumber}`;
      const primary = enabledMetrics.quantity ? values.quantityTarget : values.revenueTarget;
      toast.success(
        `${userName} — ${label} saved`,
        { description: `${formatNumber(primary)} ÷ ${values.workingDays} days = ${formatDaily(primary, values.workingDays)} per day` },
      );
      setEditingMonth(null);
      setDraft(null);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Could not save this month', { description: message });
    },
  });

  // Only months inside the plan's configured window.
  const visibleMonths = useMemo(
    () => months.filter(m => m.month_number >= targetStartMonth && m.month_number <= targetEndMonth),
    [months, targetStartMonth, targetEndMonth],
  );

  const totals = useMemo(() => {
    const quantity = visibleMonths.reduce((sum, m) => sum + m.quantity_target, 0);
    const revenue = visibleMonths.reduce((sum, m) => sum + m.revenue_target, 0);
    const workingDays = visibleMonths.reduce((sum, m) => sum + m.working_days, 0);
    return { quantity, revenue, workingDays };
  }, [visibleMonths]);

  const startEdit = (row: MonthRow) => {
    setEditingMonth(row.month_number);
    setDraft({
      quantityTarget: row.quantity_target,
      revenueTarget: row.revenue_target,
      workingDays: row.working_days,
    });
  };

  const cancelEdit = () => {
    setEditingMonth(null);
    setDraft(null);
  };

  const draftInvalid =
    !draft ||
    !(draft.workingDays >= 1 && draft.workingDays <= 31) ||
    (enabledMetrics.quantity && draft.quantityTarget < 0) ||
    (enabledMetrics.revenue && draft.revenueTarget < 0);

  if (planLoading || monthsLoading) {
    return (
      <div className="ml-8 mb-2 space-y-1.5">
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-full" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="ml-8 mb-2 text-xs text-muted-foreground italic px-3 py-2 rounded-md border border-dashed">
        No monthly plan for {userName} in FY {fyYear}.
      </div>
    );
  }

  if (!visibleMonths.length) {
    return (
      <div className="ml-8 mb-2 text-xs text-muted-foreground italic px-3 py-2 rounded-md border border-dashed">
        No months configured for this plan.
      </div>
    );
  }

  // Sum of months vs the annual figure stored on the plan — surfaced, never auto-corrected.
  const annual = enabledMetrics.quantity
    ? Number(plan.quantity_target) || 0
    : Number(plan.revenue_target) || 0;
  const summed = enabledMetrics.quantity ? totals.quantity : totals.revenue;
  const drifted = Math.round(annual) !== Math.round(summed);

  return (
    <div className="ml-8 mb-3 rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 bg-muted/40 border-b">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {userName} · FY {fyYear} monthly breakdown
        </span>
        <span className="text-[11px] font-mono text-muted-foreground">
          {totals.workingDays} working days
          {totals.workingDays > 0 && (
            <> · {formatDaily(annual, totals.workingDays)} {enabledMetrics.quantity ? quantityUnit : '₹'}/day avg</>
          )}
        </span>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Month</TableHead>
              {enabledMetrics.quantity && (
                <TableHead className="text-xs text-right">Monthly Target ({quantityUnit})</TableHead>
              )}
              {enabledMetrics.revenue && (
                <TableHead className="text-xs text-right">Monthly Revenue (₹)</TableHead>
              )}
              <TableHead className="text-xs text-right">Working Days</TableHead>
              <TableHead className="text-xs text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  <Lock className="h-3 w-3 opacity-60" aria-hidden="true" />
                  Daily Average
                </span>
              </TableHead>
              <TableHead className="text-xs text-center w-[130px]">Action</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {visibleMonths.map(row => {
              const isEditing = editingMonth === row.month_number;
              const label = row.month_name
                || FY_MONTHS.find(m => m.number === row.month_number)?.name
                || `Month ${row.month_number}`;

              const shownQuantity = isEditing && draft ? draft.quantityTarget : row.quantity_target;
              const shownRevenue = isEditing && draft ? draft.revenueTarget : row.revenue_target;
              const shownDays = isEditing && draft ? draft.workingDays : row.working_days;
              const dailyBasis = enabledMetrics.quantity ? shownQuantity : shownRevenue;
              const daysInvalid = isEditing && !(shownDays >= 1 && shownDays <= 31);

              return (
                <TableRow key={row.month_number} className={cn(isEditing && 'bg-muted/50')}>
                  <TableCell className="text-sm font-medium">{label}</TableCell>

                  {enabledMetrics.quantity && (
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={shownQuantity > 0 ? formatNumber(shownQuantity) : ''}
                          onChange={e => setDraft(d => d && { ...d, quantityTarget: parseNum(e.target.value) })}
                          placeholder="0"
                          className="h-8 w-24 text-right text-sm ml-auto"
                          aria-label={`Monthly target for ${label}`}
                          autoFocus
                        />
                      ) : (
                        <span className="text-sm font-mono">{formatNumber(row.quantity_target)}</span>
                      )}
                    </TableCell>
                  )}

                  {enabledMetrics.revenue && (
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={shownRevenue > 0 ? formatNumber(shownRevenue) : ''}
                          onChange={e => setDraft(d => d && { ...d, revenueTarget: parseNum(e.target.value) })}
                          placeholder="0"
                          className="h-8 w-28 text-right text-sm ml-auto"
                          aria-label={`Monthly revenue target for ${label}`}
                        />
                      ) : (
                        <span className="text-sm font-mono">{formatNumber(row.revenue_target)}</span>
                      )}
                    </TableCell>
                  )}

                  <TableCell className="text-right">
                    {isEditing ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={shownDays > 0 ? String(shownDays) : ''}
                          onChange={e => setDraft(d => d && { ...d, workingDays: Math.round(parseNum(e.target.value)) })}
                          placeholder="0"
                          className={cn('h-8 w-16 text-right text-sm', daysInvalid && 'border-destructive')}
                          aria-label={`Working days in ${label}`}
                        />
                        {daysInvalid && (
                          <span className="text-[10px] text-destructive font-medium">1–31 required</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm font-mono text-muted-foreground">{row.working_days}</span>
                    )}
                  </TableCell>

                  {/* Auto-calculated — never editable */}
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-sm font-mono font-semibold justify-end',
                        isEditing && 'px-2 py-1 rounded-md border border-dashed bg-background',
                      )}
                      title="Calculated automatically as Monthly Target ÷ Working Days"
                    >
                      {isEditing && <Lock className="h-3 w-3 opacity-60" aria-hidden="true" />}
                      {formatDaily(dailyBasis, shownDays)}
                    </span>
                  </TableCell>

                  <TableCell className="text-center">
                    {isEditing ? (
                      <div className="flex items-center gap-1 justify-center">
                        <Button
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          disabled={draftInvalid || saveMutation.isPending}
                          onClick={() => draft && saveMutation.mutate({ monthNumber: row.month_number, values: draft })}
                        >
                          {saveMutation.isPending
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Save className="h-3 w-3" />}
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs gap-1"
                          disabled={saveMutation.isPending}
                          onClick={cancelEdit}
                        >
                          <X className="h-3 w-3" /> Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                        disabled={editingMonth !== null}
                        onClick={() => startEdit(row)}
                        aria-label={`Edit ${label}`}
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}

            {/* Totals — recomputed from the rows, annual taken from the plan */}
            <TableRow className="bg-muted/40 hover:bg-muted/40 font-semibold">
              <TableCell className="text-sm">Total</TableCell>
              {enabledMetrics.quantity && (
                <TableCell className="text-right text-sm font-mono">{formatNumber(totals.quantity)}</TableCell>
              )}
              {enabledMetrics.revenue && (
                <TableCell className="text-right text-sm font-mono">{formatNumber(totals.revenue)}</TableCell>
              )}
              <TableCell className="text-right text-sm font-mono">{totals.workingDays}</TableCell>
              <TableCell className="text-right text-sm font-mono">
                {formatDaily(annual, totals.workingDays)}
              </TableCell>
              <TableCell className="text-center">
                {drifted ? (
                  <Badge variant="outline" className="text-[10px] gap-1 text-destructive border-destructive/40">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    ≠ {formatNumber(annual)}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">matches annual</Badge>
                )}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {drifted && (
        <div className="flex items-start gap-1.5 text-[11px] px-3 py-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-t">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
          <span>
            Months total {formatNumber(summed)} but the annual target on this plan is{' '}
            {formatNumber(annual)}. The annual figure is left unchanged — adjust it in the
            employee's plan if the months are correct.
          </span>
        </div>
      )}
    </div>
  );
}
