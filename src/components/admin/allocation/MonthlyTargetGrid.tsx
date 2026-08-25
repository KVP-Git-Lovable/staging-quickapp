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
import { fyMonthCalendar, fyMonthName, fyMonthsInRange, formatFYMonth, formatFYMonthRange } from '@/lib/fyMonths';

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
 * Comparisons on money and quantity, below anything the grid displays.
 *
 * An even share is rarely a whole number, so the monthly figures are kept as
 * they fall and never rounded. Adding a dozen of them back up leaves the last
 * few binary digits astray, which is not drift — this is the threshold that
 * tells the two apart.
 */
const AMOUNT_EPSILON = 0.005;

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
  const { monthIndex, year } = fyMonthCalendar(fyMonth, fyYear);
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

/** The three target metrics a plan can track, each distributed on its own. */
type MetricKey = 'quantity' | 'revenue' | 'visits';

const METRIC_KEYS: MetricKey[] = ['quantity', 'revenue', 'visits'];

/** Column on `user_business_plan_months` holding this metric's monthly figure. */
const MONTH_COLUMN: Record<MetricKey, 'quantity_target' | 'revenue_target' | 'visits_target'> = {
  quantity: 'quantity_target',
  revenue: 'revenue_target',
  visits: 'visits_target',
};

/** Column on `user_business_plans` holding this metric's annual figure. */
const PLAN_COLUMN: Record<MetricKey, 'quantity_target' | 'revenue_target' | 'visits_target'> = {
  quantity: 'quantity_target',
  revenue: 'revenue_target',
  visits: 'visits_target',
};

type MetricAmounts = Record<MetricKey, number>;

const zeroAmounts = (): MetricAmounts => ({ quantity: 0, revenue: 0, visits: 0 });

interface StoredMonth {
  month_number: number;
  month_name: string | null;
  amounts: MetricAmounts;
  working_days: number;
}

interface GridRow {
  monthNumber: number;
  /** Plain FY month name — what is written to and read from the database. */
  monthName: string;
  /**
   * Month and year as shown on screen: 'April 26'. Derived from the plan's
   * financial year at render, never stored, so an existing row picks up the
   * year without a migration.
   */
  monthLabel: string;
  /** One figure per metric — each is a share of that metric's own annual target. */
  amounts: MetricAmounts;
  /** Sourced from Attendance — read-only in this grid. */
  workingDays: number;
  /** True when working days came from Attendance's working_days_config. */
  daysFromAttendance: boolean;
  /** False when the row is derived on the fly because nothing is saved yet. */
  isStored: boolean;
}

interface DraftRow {
  amounts: MetricAmounts;
  /**
   * Raw text for whichever field is being typed in, so a half-written decimal
   * such as "145." survives the keystroke. Reformatting the number on every
   * change swallowed the point and made decimals impossible to enter.
   */
  typing: Partial<Record<string, string>>;
}

/** The field key used for a metric's monthly input, and for its daily average. */
const monthlyField = (metric: MetricKey) => `monthly:${metric}`;
const dailyField = (metric: MetricKey) => `daily:${metric}`;

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
  /** The employee's allocated annual visits, used to seed unsaved months. */
  annualVisits?: number;
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
  annualVisits = 0,
  targetStartMonth = 1,
  targetEndMonth = 12,
}: MonthlyTargetGridProps) {
  const queryClient = useQueryClient();
  const [editingMonth, setEditingMonth] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftRow | null>(null);

  /**
   * The metrics this plan tracks, each with its own annual target, its own even
   * split across the months, and its own daily average. They are independent:
   * quantity reconciling says nothing about revenue.
   */
  const metrics = useMemo(
    () =>
      METRIC_KEYS.filter(key => enabledMetrics[key]).map(key => ({
        key,
        annual: key === 'quantity' ? annualQuantity : key === 'revenue' ? annualRevenue : annualVisits,
        unit: key === 'quantity' ? quantityUnit : key === 'revenue' ? '₹' : 'visits',
        monthlyLabel:
          key === 'quantity'
            ? `Monthly Target (${quantityUnit})`
            : key === 'revenue'
              ? 'Monthly Revenue (₹)'
              : 'Monthly Visits',
        dailyLabel:
          key === 'quantity'
            ? `Daily Average Target (${quantityUnit})`
            : key === 'revenue'
              ? 'Daily Average Target (₹)'
              : 'Daily Average Visits',
      })),
    [enabledMetrics, annualQuantity, annualRevenue, annualVisits, quantityUnit],
  );

  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['ubp-plan', userId, fyYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_business_plans')
        .select('id, quantity_target, revenue_target, visits_target')
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
        .select('month_number, month_name, quantity_target, revenue_target, visits_target, working_days')
        .eq('business_plan_id', plan.id)
        .eq('is_active', true)
        .order('month_number');
      if (error) throw error;
      return (data || []).map(m => ({
        month_number: m.month_number,
        month_name: m.month_name,
        amounts: {
          quantity: Number(m.quantity_target) || 0,
          revenue: Number(m.revenue_target) || 0,
          visits: Number((m as { visits_target?: number }).visits_target) || 0,
        },
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
      const { monthIndex, year } = fyMonthCalendar(fyMonth, fyYear);
      const key = `${year}-${monthIndex + 1}`;
      const configuredDays = configured.get(key);
      if (configuredDays !== undefined && configuredDays > 0) {
        return { days: configuredDays, fromAttendance: true };
      }
      return { days: fallbackWorkingDays(fyMonth, fyYear, holidayDates), fromAttendance: false };
    };
  }, [attendance, fyYear]);

  /**
   * The plan's month window, in FY order and labelled with the year each month
   * falls in — the same window, and the same labels, the Targets tab shows
   * against Target Duration and the Monthly parameter.
   */
  const activeMonths = useMemo(
    () =>
      fyMonthsInRange(targetStartMonth, targetEndMonth).map(number => ({
        number,
        name: fyMonthName(number),
        label: formatFYMonth(number, fyYear),
      })),
    [targetStartMonth, targetEndMonth, fyYear],
  );

  /**
   * The annual figure the saved months were last spread over.
   *
   * Every month is a share of an annual target, so a share saved against one
   * target says nothing once that target moves. Comparing the plan's own
   * recorded figure against the one being distributed now is what tells the
   * two apart — the months either belong to the current target or they are
   * left over from a previous one.
   */
  /**
   * Whether the saved months still describe the targets being distributed.
   *
   * Only a change to an annual target sets them aside, and a change to any one
   * metric's target restacks the whole grid, since a month row carries every
   * metric together. Nothing else rewrites a figure entered by hand — where the
   * months no longer add up, the shortfall is reported and the entered values
   * are left exactly as they are.
   */
  const savedMonthsAreStale = useMemo(() => {
    if (!plan) return false;
    // `visits_target` post-dates the checked-in Supabase types, so the row is
    // read through an index signature rather than the generated shape.
    const planRow = plan as Record<string, unknown>;
    return metrics.some(metric => {
      const savedAgainst = Number(planRow[PLAN_COLUMN[metric.key]]) || 0;
      return Math.abs(savedAgainst - metric.annual) > AMOUNT_EPSILON;
    });
  }, [plan, metrics]);

  /**
   * Every month in the window, stored values where they exist and an even split
   * of the allocated annual target where they do not.
   *
   * A month edited by hand keeps its figure only while the annual target it was
   * a share of still stands. Once that changes the whole window is rebuilt from
   * the new target, hand-edited months included, so the distribution always adds
   * back up to the target it belongs to rather than freezing a stale month in
   * place and leaving the total short.
   */
  const rows: GridRow[] = useMemo(() => {
    const stored = new Map(storedMonths.map(m => [m.month_number, m]));
    const count = activeMonths.length || 1;

    // Every metric is split over the same months but entirely on its own, so
    // each one's shares add back up to its own annual target. Shares are taken
    // exactly as they fall — rounding to whole units would leave a metric's
    // months totalling something other than the target they came from.
    const seeds = zeroAmounts();
    metrics.forEach(metric => {
      seeds[metric.key] = metric.annual / count;
    });

    return activeMonths.map(month => {
      // Working days always come from Attendance, never from the saved plan.
      const { days, fromAttendance } = resolveWorkingDays(month.number);
      const existing = savedMonthsAreStale ? undefined : stored.get(month.number);
      if (existing) {
        return {
          monthNumber: month.number,
          monthName: existing.month_name || month.name,
          monthLabel: month.label,
          amounts: { ...existing.amounts },
          workingDays: days,
          daysFromAttendance: fromAttendance,
          isStored: true,
        };
      }
      return {
        monthNumber: month.number,
        monthName: month.name,
        monthLabel: month.label,
        amounts: { ...seeds },
        workingDays: days,
        daysFromAttendance: fromAttendance,
        isStored: false,
      };
    });
  }, [storedMonths, activeMonths, metrics, resolveWorkingDays, savedMonthsAreStale]);

  const totals = useMemo(() => {
    const amounts = zeroAmounts();
    METRIC_KEYS.forEach(key => {
      amounts[key] = rows.reduce((sum, r) => sum + r.amounts[key], 0);
    });
    return { amounts, workingDays: rows.reduce((sum, r) => sum + r.workingDays, 0) };
  }, [rows]);

  /**
   * How far each metric's months are from its annual target, and in which
   * direction. Reported only — no figure is adjusted to close a gap.
   */
  const reconciliation = useMemo(
    () =>
      metrics.map(metric => {
        const summed = totals.amounts[metric.key];
        const difference = summed - metric.annual;
        return {
          ...metric,
          summed,
          difference,
          drifted: Math.abs(difference) > AMOUNT_EPSILON,
          over: difference > 0,
        };
      }),
    [metrics, totals],
  );

  const anyDrift = reconciliation.some(m => m.drifted);

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
            visits_target: annualVisits,
            quantity_unit: quantityUnit,
            source: 'manual',
          })
          .select('id')
          .single();
        if (planError) throw planError;
        planId = created.id;
      } else if (savedMonthsAreStale) {
        // Record which annual targets these months are a share of. Without this
        // the plan keeps pointing at the figures it was last saved against, the
        // months read as stale on every render, and a save could never stick.
        const anchor: Record<string, number> = {};
        metrics.forEach(metric => { anchor[PLAN_COLUMN[metric.key]] = metric.annual; });
        const { error: anchorError } = await supabase
          .from('user_business_plans')
          .update(anchor)
          .eq('id', planId);
        if (anchorError) throw anchorError;
      }

      /**
       * Normally one month is written. When the stored months are left over
       * from a previous annual target the whole window goes down with it, at
       * the figures already on screen, so what is saved is the distribution the
       * user is looking at rather than one current month beside stale ones.
       */
      const writes = savedMonthsAreStale
        ? rows.map(candidate =>
            candidate.monthNumber === row.monthNumber
              ? { row: candidate, values }
              : { row: candidate, values: { amounts: candidate.amounts, typing: {} } as DraftRow },
          )
        : [{ row, values }];

      for (const write of writes) {
        // working_days is written through from Attendance so the stored plan
        // stays consistent with what the grid shows. It is not editable here.
        const payload: Record<string, number> = { working_days: write.row.workingDays };
        metrics.forEach(metric => {
          payload[MONTH_COLUMN[metric.key]] = write.values.amounts[metric.key];
        });

        // Deactivate the current active row (if any) rather than updating it in
        // place, so the previous target stays queryable as history instead of
        // being silently overwritten — same rule as every other target save.
        const { error: deactivateError } = await supabase
          .from('user_business_plan_months')
          .update({ is_active: false, deactivated_at: new Date().toISOString() })
          .eq('business_plan_id', planId)
          .eq('month_number', write.row.monthNumber)
          .eq('is_active', true);
        if (deactivateError) throw deactivateError;

        const { error: insertError } = await supabase
          .from('user_business_plan_months')
          .insert({
            business_plan_id: planId,
            month_number: write.row.monthNumber,
            month_name: write.row.monthName,
            ...payload,
          });
        if (insertError) throw insertError;
      }

      return { row, values, rewroteWindow: writes.length > 1 };
    },
    onSuccess: ({ row, values, rewroteWindow }) => {
      queryClient.invalidateQueries({ queryKey: ['ubp-plan', userId, fyYear] });
      queryClient.invalidateQueries({ queryKey: ['ubp-months', plan?.id] });
      const lead = metrics[0];
      const primary = lead ? values.amounts[lead.key] : 0;
      toast.success(
        rewroteWindow ? `${userName} — all months saved` : `${userName} — ${row.monthLabel} saved`,
        {
          description: rewroteWindow
            ? 'Rebuilt against the current annual targets'
            : `${formatNumber(primary)} ÷ ${row.workingDays} days = ${formatDaily(primary, row.workingDays)} per day`,
        },
      );
      setEditingMonth(null);
      setDraft(null);
    },
    onError: (error: unknown) => {
      toast.error('Could not save this month', { description: describeError(error) });
    },
  });

  const startEdit = (row: GridRow) => {
    setEditingMonth(row.monthNumber);
    setDraft({ amounts: { ...row.amounts }, typing: {} });
  };

  const cancelEdit = () => {
    setEditingMonth(null);
    setDraft(null);
  };

  /**
   * Editing a monthly target.
   *
   * The raw text is kept alongside the parsed number so a decimal can actually
   * be typed — reformatting "145." back to "145" on every keystroke made the
   * point impossible to enter. That metric's daily average goes back to being
   * derived; the other metrics are untouched.
   */
  const onMonthlyEdited = (metric: MetricKey, raw: string) =>
    setDraft(d =>
      d && {
        ...d,
        amounts: { ...d.amounts, [metric]: parseNum(raw) },
        typing: { ...d.typing, [monthlyField(metric)]: raw, [dailyField(metric)]: undefined },
      },
    );

  /**
   * Editing a daily average: back-calculate that metric's monthly target so
   * target ÷ working days still equals the average shown. Left unrounded, so
   * reading the average back returns what was typed.
   */
  const onDailyEdited = (metric: MetricKey, raw: string, workingDays: number) =>
    setDraft(d =>
      d && {
        ...d,
        amounts: { ...d.amounts, [metric]: parseNum(raw) * workingDays },
        typing: { ...d.typing, [dailyField(metric)]: raw, [monthlyField(metric)]: undefined },
      },
    );

  const draftInvalid = !draft || metrics.some(metric => draft.amounts[metric.key] < 0);

  if (planLoading || monthsLoading) {
    return (
      <div className="ml-8 mb-2 space-y-1.5">
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-full" />
      </div>
    );
  }

  return (
    <div className="ml-8 mb-3 rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 bg-muted/40 border-b">
        {/* Named the same way as the Targets tab: the financial year, then the
            duration the months were built from. */}
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {userName} · FY {fyYear - 1}-{String(fyYear).slice(-2)}
          {activeMonths.length > 0 && ` · ${formatFYMonthRange(targetStartMonth, targetEndMonth, fyYear)}`}
        </span>
        <span className="flex items-center gap-2">
          {unsavedCount > 0 && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {unsavedCount === rows.length ? 'Not saved yet' : `${unsavedCount} unsaved`}
            </Badge>
          )}
          <span className="text-[11px] font-mono text-muted-foreground">
            {totals.workingDays} working days
            {totals.workingDays > 0 &&
              reconciliation.map(metric => (
                <span key={metric.key}>
                  {' · '}
                  {formatDaily(metric.summed, totals.workingDays)} {metric.unit}/day avg
                </span>
              ))}
          </span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Month</TableHead>
              <TableHead className="text-xs text-right">
                <span className="inline-flex items-center justify-end gap-1">
                  <Lock className="h-3 w-3 opacity-60" aria-hidden="true" />
                  Working Days
                </span>
              </TableHead>
              {/* Each metric gets its own monthly figure and its own daily
                  average, side by side, so the pair reads as one unit. */}
              {metrics.map(metric => (
                <React.Fragment key={metric.key}>
                  <TableHead className="text-xs text-right">{metric.monthlyLabel}</TableHead>
                  <TableHead className="text-xs text-right">{metric.dailyLabel}</TableHead>
                </React.Fragment>
              ))}
              <TableHead className="text-xs text-center w-[130px]">Action</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map(row => {
              const isEditing = editingMonth === row.monthNumber;
              const shownDays = row.workingDays; // always from Attendance

              return (
                <TableRow key={row.monthNumber} className={cn(isEditing && 'bg-muted/50')}>
                  <TableCell className="text-sm font-medium">
                    <span className="flex items-center gap-1.5">
                      {row.monthLabel}
                      {!row.isStored && (
                        <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-normal">
                          draft
                        </span>
                      )}
                    </span>
                  </TableCell>

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

                  {metrics.map((metric, index) => {
                    const amount = isEditing && draft ? draft.amounts[metric.key] : row.amounts[metric.key];
                    // While a field is being typed in, show the raw text so a
                    // part-typed decimal is not reformatted out from under the
                    // cursor. Otherwise show the formatted figure.
                    const monthlyTyping = isEditing ? draft?.typing[monthlyField(metric.key)] : undefined;
                    const dailyTyping = isEditing ? draft?.typing[dailyField(metric.key)] : undefined;

                    return (
                      <React.Fragment key={metric.key}>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={monthlyTyping ?? (amount > 0 ? formatNumber(amount) : '')}
                              onChange={e => onMonthlyEdited(metric.key, e.target.value)}
                              placeholder="0"
                              className="ml-auto h-8 w-28 text-right text-sm"
                              aria-label={`${metric.monthlyLabel} for ${row.monthLabel}`}
                              autoFocus={index === 0}
                            />
                          ) : (
                            <span className={cn('text-sm font-mono', !row.isStored && 'text-muted-foreground')}>
                              {formatNumber(amount)}
                            </span>
                          )}
                        </TableCell>

                        {/* Editable — keeps target ÷ working days in step */}
                        <TableCell className="text-right">
                          {isEditing ? (
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={dailyTyping ?? formatDaily(amount, shownDays)}
                              onChange={e => onDailyEdited(metric.key, e.target.value, shownDays)}
                              placeholder="0"
                              className="ml-auto h-8 w-24 text-right text-sm"
                              aria-label={`${metric.dailyLabel} for ${row.monthLabel}`}
                              disabled={shownDays <= 0}
                            />
                          ) : (
                            <span className="text-sm font-mono font-semibold">
                              {formatDaily(amount, shownDays)}
                            </span>
                          )}
                        </TableCell>
                      </React.Fragment>
                    );
                  })}

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
                        aria-label={`Edit ${row.monthLabel}`}
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
              <TableCell className="text-right text-sm font-mono">{totals.workingDays}</TableCell>
              {reconciliation.map(metric => (
                <React.Fragment key={metric.key}>
                  <TableCell className="text-right text-sm font-mono">
                    <span className="flex flex-col items-end gap-0.5">
                      {formatNumber(metric.summed)}
                      {metric.drifted ? (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold',
                            metric.over ? 'text-destructive' : 'text-amber-600 dark:text-amber-400',
                          )}
                        >
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {metric.over ? 'Over by' : 'Short by'} {formatNumber(Math.abs(metric.difference))}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          matches annual
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono">
                    {formatDaily(metric.summed, totals.workingDays)}
                  </TableCell>
                </React.Fragment>
              ))}
              <TableCell />
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

      {/* What it would take to reconcile. Shown whenever the months do not add
          up, saved or not, and never acted on — the figures entered stay put
          and this only states the gap. */}
      {reconciliation
        .filter(metric => metric.drifted)
        .map(metric => (
          <div
            key={metric.key}
            className={cn(
              'flex items-start gap-2 border-t px-3 py-2 text-[11px]',
              metric.over
                ? 'bg-destructive/10 text-destructive'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
            )}
          >
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              <strong className="font-semibold">
                {metric.monthlyLabel.replace('Monthly ', '')}:{' '}
                {metric.over ? 'over the annual target by' : 'below the annual target by'}{' '}
                {formatNumber(Math.abs(metric.difference))}
              </strong>
              {' — '}
              months total {formatNumber(metric.summed)} against an annual target of{' '}
              {formatNumber(metric.annual)}.
              {metric.over
                ? ` Remove ${formatNumber(Math.abs(metric.difference))} across the months to reconcile.`
                : ` Add ${formatNumber(Math.abs(metric.difference))} across the months to reconcile.`}
              {' '}Nothing has been changed for you.
            </span>
          </div>
        ))}
    </div>
  );
}
