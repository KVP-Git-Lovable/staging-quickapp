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
 * Always renders every month in the plan's window, whether or not the employee
 * already has a saved plan. Where nothing is stored yet the row is derived from
 * the employee's allocated annual target (spread evenly) and the working days
 * for that calendar month, so a manager can see and edit the breakdown before
 * any plan exists. Saving a derived row creates the plan and the month row.
 *
 * Monthly Target and Working Days are editable. Daily Average is always
 * target ÷ working days — derived at render, never stored, never typed.
 *
 * Touches only `user_business_plans` and `user_business_plan_months`. No schema
 * change, and no effect on allocation maths or the Targets tab.
 */

/**
 * What actually went wrong, in the toast.
 *
 * Supabase rejects a write with a plain `{ message, details, hint, code }`
 * object rather than an Error, so testing `instanceof Error` threw the real
 * reason away and left every failure reading "Unknown error".
 */
const describeError = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const { message, details, hint, code } = error as Record<string, unknown>;
    const parts = [message, details, hint].filter(
      (part): part is string => typeof part === 'string' && part.length > 0,
    );
    if (parts.length) {
      return typeof code === 'string' && code ? `${parts.join(' — ')} (${code})` : parts.join(' — ');
    }
  }
  return 'Unknown error';
};

/**
 * Spread a total across months so the parts add up to it exactly.
 *
 * Rounding each month on its own throws the remainder away: 1,667 across nine
 * months rounds to 185 apiece and totals 1,665, two short. The first few months
 * carry the leftover units instead, which is the same largest-remainder rule the
 * hierarchy split uses, so a target never quietly shrinks on its way to a month.
 */
const spreadEvenly = (total: number, count: number): number[] => {
  if (count <= 0) return [];
  const safe = Math.max(0, Math.round(total || 0));
  const base = Math.floor(safe / count);
  const leftover = safe - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < leftover ? 1 : 0));
};

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

/**
 * Calendar position of an FY month. fy_year 2027 means FY 2026-27, so FY month
 * 1 (April) falls in 2026 and FY month 10 (January) falls in 2027.
 */
const calendarFor = (fyMonth: number, fyYear: number) =>
  fyMonth <= 9
    ? { monthIndex: fyMonth + 2, year: fyYear - 1 }
    : { monthIndex: fyMonth - 10, year: fyYear };

/**
 * Fallback used only when Attendance has no working_days_config row for the
 * month. Mirrors the Attendance module's own formula (total days − week offs −
 * holidays), with Sunday as the week off, which is what week_off_config
 * defaults to today.
 */
const fallbackWorkingDays = (
  fyMonth: number,
  fyYear: number,
  holidayDates: Set<string>,
): number => {
  const { monthIndex, year } = calendarFor(fyMonth, fyYear);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  let workingDays = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, monthIndex, day);
    if (date.getDay() === 0) continue; // Sunday week off
    const iso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (holidayDates.has(iso)) continue; // declared holiday
    workingDays++;
  }
  return workingDays;
};

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

interface StoredMonth {
  month_number: number;
  month_name: string | null;
  quantity_target: number;
  revenue_target: number;
  working_days: number;
}

interface GridRow {
  monthNumber: number;
  monthName: string;
  quantityTarget: number;
  revenueTarget: number;
  /** Sourced from Attendance — read-only in this grid. */
  workingDays: number;
  /** True when working days came from Attendance's working_days_config. */
  daysFromAttendance: boolean;
  /** False when the row is derived on the fly because nothing is saved yet. */
  isStored: boolean;
}

interface DraftRow {
  quantityTarget: number;
  revenueTarget: number;
  /**
   * Raw text while the Daily Average field is being typed in. Null means the
   * daily average is showing its derived value from the monthly target.
   */
  dailyInput: string | null;
}

interface MonthlyTargetGridProps {
  userId: string;
  userName: string;
  fyYear: number;
  quantityUnit: string;
  enabledMetrics: { quantity: boolean; revenue: boolean; visits: boolean };
  /** The employee's allocated annual quantity, used to seed unsaved months. */
  annualQuantity?: number;
  /** The employee's allocated annual revenue, used to seed unsaved months. */
  annualRevenue?: number;
  targetStartMonth?: number;
  targetEndMonth?: number;
}

export function MonthlyTargetGrid({
  userId,
  userName,
  fyYear,
  quantityUnit,
  enabledMetrics,
  annualQuantity = 0,
  annualRevenue = 0,
  targetStartMonth = 1,
  targetEndMonth = 12,
}: MonthlyTargetGridProps) {
  const queryClient = useQueryClient();
  const [editingMonth, setEditingMonth] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftRow | null>(null);

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

  const { data: storedMonths = [], isLoading: monthsLoading } = useQuery({
    queryKey: ['ubp-months', plan?.id],
    queryFn: async (): Promise<StoredMonth[]> => {
      if (!plan?.id) return [];
      const { data, error } = await supabase
        .from('user_business_plan_months')
        .select('month_number, month_name, quantity_target, revenue_target, working_days')
        .eq('business_plan_id', plan.id)
        .eq('is_active', true)
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

  /**
   * Working days come from the Attendance module. `working_days_config` is the
   * configured source; `holidays` only feeds the fallback for months Attendance
   * has not configured yet.
   */
  const { data: attendance } = useQuery({
    queryKey: ['attendance-working-days', fyYear],
    queryFn: async () => {
      const years = [fyYear - 1, fyYear];
      const [configRes, holidayRes] = await Promise.all([
        supabase
          .from('working_days_config')
          .select('year, month, working_days')
          .in('year', years),
        supabase.from('holidays').select('date').in('year', years),
      ]);
      if (configRes.error) throw configRes.error;
      if (holidayRes.error) throw holidayRes.error;

      const configured = new Map<string, number>();
      (configRes.data || []).forEach(row => {
        configured.set(`${row.year}-${row.month}`, Number(row.working_days) || 0);
      });
      const holidayDates = new Set<string>(
        (holidayRes.data || []).map(h => String(h.date).slice(0, 10)),
      );
      return { configured, holidayDates };
    },
  });

  /** Resolve working days for an FY month: Attendance config first, else fallback. */
  const resolveWorkingDays = useMemo(() => {
    const configured = attendance?.configured ?? new Map<string, number>();
    const holidayDates = attendance?.holidayDates ?? new Set<string>();
    return (fyMonth: number): { days: number; fromAttendance: boolean } => {
      const { monthIndex, year } = calendarFor(fyMonth, fyYear);
      const key = `${year}-${monthIndex + 1}`;
      const configuredDays = configured.get(key);
      if (configuredDays !== undefined && configuredDays > 0) {
        return { days: configuredDays, fromAttendance: true };
      }
      return { days: fallbackWorkingDays(fyMonth, fyYear, holidayDates), fromAttendance: false };
    };
  }, [attendance, fyYear]);

  const activeMonths = useMemo(
    () => FY_MONTHS.filter(m => m.number >= targetStartMonth && m.number <= targetEndMonth),
    [targetStartMonth, targetEndMonth],
  );

  /**
   * Every month in the window, stored values where they exist and an even split
   * of the allocated annual target where they do not.
   */
  const rows: GridRow[] = useMemo(() => {
    const stored = new Map(storedMonths.map(m => [m.month_number, m]));
    const count = activeMonths.length || 1;
    const quantitySeeds = spreadEvenly(annualQuantity, count);
    const revenueSeeds = spreadEvenly(annualRevenue, count);

    return activeMonths.map((month, index) => {
      // Working days always come from Attendance, never from the saved plan.
      const { days, fromAttendance } = resolveWorkingDays(month.number);
      const existing = stored.get(month.number);
      if (existing) {
        return {
          monthNumber: month.number,
          monthName: existing.month_name || month.name,
          quantityTarget: existing.quantity_target,
          revenueTarget: existing.revenue_target,
          workingDays: days,
          daysFromAttendance: fromAttendance,
          isStored: true,
        };
      }
      return {
        monthNumber: month.number,
        monthName: month.name,
        quantityTarget: enabledMetrics.quantity ? quantitySeeds[index] : 0,
        revenueTarget: enabledMetrics.revenue ? revenueSeeds[index] : 0,
        workingDays: days,
        daysFromAttendance: fromAttendance,
        isStored: false,
      };
    });
  }, [storedMonths, activeMonths, annualQuantity, annualRevenue, enabledMetrics, resolveWorkingDays]);

  const totals = useMemo(() => ({
    quantity: rows.reduce((sum, r) => sum + r.quantityTarget, 0),
    revenue: rows.reduce((sum, r) => sum + r.revenueTarget, 0),
    workingDays: rows.reduce((sum, r) => sum + r.workingDays, 0),
  }), [rows]);

  const unsavedCount = rows.filter(r => !r.isStored).length;
  const attendanceConfiguredCount = rows.filter(r => r.daysFromAttendance).length;

  const saveMutation = useMutation({
    mutationFn: async ({ row, values }: { row: GridRow; values: DraftRow }) => {
      // Create the plan the first time a month is saved for this employee.
      let planId = plan?.id;
      if (!planId) {
        const { data: created, error: planError } = await supabase
          .from('user_business_plans')
          .insert({
            user_id: userId,
            year: fyYear,
            quantity_target: annualQuantity,
            revenue_target: annualRevenue,
            quantity_unit: quantityUnit,
            source: 'manual',
          })
          .select('id')
          .single();
        if (planError) throw planError;
        planId = created.id;
      }

      // working_days is written through from Attendance so the stored plan stays
      // consistent with what the grid shows. It is not editable here.
      const payload: Record<string, number> = { working_days: row.workingDays };
      if (enabledMetrics.quantity) payload.quantity_target = values.quantityTarget;
      if (enabledMetrics.revenue) payload.revenue_target = values.revenueTarget;

      // Deactivate the current active row (if any) rather than updating it in
      // place, so the previous target stays queryable as history instead of
      // being silently overwritten — same rule as every other target save.
      const { error: deactivateError } = await supabase
        .from('user_business_plan_months')
        .update({ is_active: false, deactivated_at: new Date().toISOString() })
        .eq('business_plan_id', planId)
        .eq('month_number', row.monthNumber)
        .eq('is_active', true);
      if (deactivateError) throw deactivateError;

      const { error: insertError } = await supabase
        .from('user_business_plan_months')
        .insert({
          business_plan_id: planId,
          month_number: row.monthNumber,
          month_name: row.monthName,
          ...payload,
        });
      if (insertError) throw insertError;

      return { row, values };
    },
    onSuccess: ({ row, values }) => {
      queryClient.invalidateQueries({ queryKey: ['ubp-plan', userId, fyYear] });
      queryClient.invalidateQueries({ queryKey: ['ubp-months', plan?.id] });
      const primary = enabledMetrics.quantity ? values.quantityTarget : values.revenueTarget;
      toast.success(`${userName} — ${row.monthName} saved`, {
        description: `${formatNumber(primary)} ÷ ${row.workingDays} days = ${formatDaily(primary, row.workingDays)} per day`,
      });
      setEditingMonth(null);
      setDraft(null);
    },
    onError: (error: unknown) => {
      toast.error('Could not save this month', { description: describeError(error) });
    },
  });

  const startEdit = (row: GridRow) => {
    setEditingMonth(row.monthNumber);
    setDraft({
      quantityTarget: row.quantityTarget,
      revenueTarget: row.revenueTarget,
      dailyInput: null,
    });
  };

  const cancelEdit = () => {
    setEditingMonth(null);
    setDraft(null);
  };

  /** Editing the monthly target: daily average goes back to being derived. */
  const onTargetEdited = (field: 'quantityTarget' | 'revenueTarget', value: number) =>
    setDraft(d => d && { ...d, [field]: value, dailyInput: null });

  /**
   * Editing the daily average: back-calculate the monthly target so that
   * target ÷ working days still equals the average shown.
   */
  const onDailyEdited = (raw: string, workingDays: number) =>
    setDraft(d => {
      if (!d) return d;
      const perDay = parseNum(raw);
      const derivedTarget = Math.round(perDay * workingDays);
      return enabledMetrics.quantity
        ? { ...d, dailyInput: raw, quantityTarget: derivedTarget }
        : { ...d, dailyInput: raw, revenueTarget: derivedTarget };
    });

  const draftInvalid =
    !draft ||
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

  // The figure being distributed right now, which is what the rows were seeded
  // from. The saved plan can hold an older annual target from a previous
  // distribution, and checking against that made the panel disagree with
  // itself — months adding up to one number, the total flagging another.
  const annual = enabledMetrics.quantity ? annualQuantity : annualRevenue;
  const summed = enabledMetrics.quantity ? totals.quantity : totals.revenue;
  const drifted = Math.round(annual) !== Math.round(summed);

  return (
    <div className="ml-8 mb-3 rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 bg-muted/40 border-b">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {userName} · FY {fyYear} monthly breakdown
        </span>
        <span className="flex items-center gap-2">
          {unsavedCount > 0 && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {unsavedCount === rows.length ? 'Not saved yet' : `${unsavedCount} unsaved`}
            </Badge>
          )}
          <span className="text-[11px] font-mono text-muted-foreground">
            {totals.workingDays} working days
            {totals.workingDays > 0 && (
              <> · {formatDaily(annual, totals.workingDays)} {enabledMetrics.quantity ? quantityUnit : '₹'}/day avg</>
            )}
          </span>
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
              <TableHead className="text-xs text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  <Lock className="h-3 w-3 opacity-60" aria-hidden="true" />
                  Working Days
                </span>
              </TableHead>
              <TableHead className="text-xs text-right">Daily Average</TableHead>
              <TableHead className="text-xs text-center w-[130px]">Action</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map(row => {
              const isEditing = editingMonth === row.monthNumber;
              const shownQuantity = isEditing && draft ? draft.quantityTarget : row.quantityTarget;
              const shownRevenue = isEditing && draft ? draft.revenueTarget : row.revenueTarget;
              const shownDays = row.workingDays; // always from Attendance
              const dailyBasis = enabledMetrics.quantity ? shownQuantity : shownRevenue;
              // While typing in the daily field, show the raw text; otherwise derive it.
              const shownDaily = isEditing && draft?.dailyInput !== null && draft?.dailyInput !== undefined
                ? draft.dailyInput
                : formatDaily(dailyBasis, shownDays);

              return (
                <TableRow key={row.monthNumber} className={cn(isEditing && 'bg-muted/50')}>
                  <TableCell className="text-sm font-medium">
                    <span className="flex items-center gap-1.5">
                      {row.monthName}
                      {!row.isStored && (
                        <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-normal">
                          draft
                        </span>
                      )}
                    </span>
                  </TableCell>

                  {enabledMetrics.quantity && (
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={shownQuantity > 0 ? formatNumber(shownQuantity) : ''}
                          onChange={e => onTargetEdited('quantityTarget', parseNum(e.target.value))}
                          placeholder="0"
                          className="h-8 w-24 text-right text-sm ml-auto"
                          aria-label={`Monthly target for ${row.monthName}`}
                          autoFocus
                        />
                      ) : (
                        <span className={cn('text-sm font-mono', !row.isStored && 'text-muted-foreground')}>
                          {formatNumber(row.quantityTarget)}
                        </span>
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
                          onChange={e => onTargetEdited('revenueTarget', parseNum(e.target.value))}
                          placeholder="0"
                          className="h-8 w-28 text-right text-sm ml-auto"
                          aria-label={`Monthly revenue target for ${row.monthName}`}
                        />
                      ) : (
                        <span className={cn('text-sm font-mono', !row.isStored && 'text-muted-foreground')}>
                          {formatNumber(row.revenueTarget)}
                        </span>
                      )}
                    </TableCell>
                  )}

                  {/* Working days — read-only, sourced from the Attendance module */}
                  <TableCell className="text-right">
                    <span
                      className="inline-flex items-center gap-1 text-sm font-mono text-muted-foreground justify-end"
                      title={row.daysFromAttendance
                        ? 'From Attendance › Working Days configuration'
                        : 'Not configured in Attendance yet — calculated from the calendar (excludes Sundays and declared holidays)'}
                    >
                      <Lock className="h-3 w-3 opacity-50" aria-hidden="true" />
                      {row.workingDays}
                    </span>
                  </TableCell>

                  {/* Editable — keeps target ÷ working days in step */}
                  <TableCell className="text-right">
                    {isEditing ? (
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={shownDaily}
                        onChange={e => onDailyEdited(e.target.value, shownDays)}
                        placeholder="0"
                        className="h-8 w-24 text-right text-sm ml-auto"
                        aria-label={`Daily average for ${row.monthName}`}
                        disabled={shownDays <= 0}
                      />
                    ) : (
                      <span className="text-sm font-mono font-semibold">
                        {formatDaily(dailyBasis, shownDays)}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-center">
                    {isEditing ? (
                      <div className="flex items-center gap-1 justify-center">
                        <Button
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          disabled={draftInvalid || saveMutation.isPending}
                          onClick={() => draft && saveMutation.mutate({ row, values: draft })}
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
                        aria-label={`Edit ${row.monthName}`}
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}

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

      <div className="flex items-start gap-1.5 text-[11px] px-3 py-2 text-muted-foreground bg-muted/30 border-t">
        <Lock className="h-3 w-3 shrink-0 mt-0.5 opacity-60" />
        <span>
          Working days come from Attendance and cannot be edited here
          {attendanceConfiguredCount === 0
            ? ' — no months are configured in Attendance › Working Days yet, so they are calculated from the calendar (excluding Sundays and declared holidays).'
            : attendanceConfiguredCount < rows.length
              ? ` — ${attendanceConfiguredCount} of ${rows.length} months are configured there; the rest are calculated from the calendar.`
              : '.'}
          {' '}Editing Daily Average adjusts the Monthly Target for that month, and vice versa.
        </span>
      </div>

      {unsavedCount > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] px-3 py-2 text-muted-foreground bg-muted/30 border-t">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
          <span>
            Draft months are an even split of the allocated annual target. Save a month to store it.
          </span>
        </div>
      )}

      {drifted && unsavedCount === 0 && (
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
