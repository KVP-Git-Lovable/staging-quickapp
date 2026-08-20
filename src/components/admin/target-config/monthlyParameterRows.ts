import { fyMonthsInRange, formatFYMonth } from '@/lib/fyMonths';

/**
 * The Monthly parameter's rows, derived from the plan's Target Duration.
 *
 * The Monthly parameter is not a list of its own — it is the Target Duration,
 * written out one month at a time. Keeping the derivation here rather than
 * inside the component keeps the two from drifting apart, and makes the
 * add/drop behaviour testable on its own.
 */

/** The shape a month row shares with every other parameter breakdown row. */
export interface MonthlyParameterRow {
  id: string;
  name: string;
  metrics: Record<string, number>;
}

/** Stable id for a month row, so a month keeps its figures across a rebuild. */
export const monthlyRowId = (fyMonth: number) => `month-${fyMonth - 1}`;

/**
 * The month rows for a given duration.
 *
 * Months inside the window are listed in FY order and labelled with the year
 * they fall in; months outside it are gone. A month present in both the old
 * window and the new one carries its entered figures across, so narrowing the
 * duration and widening it again does not cost the months that never left.
 * Metrics added since the last build appear on every row at zero.
 */
export const buildMonthlyRows = (
  current: MonthlyParameterRow[] | undefined,
  startMonth: number,
  endMonth: number,
  fyYear: number,
  emptyMetrics: Record<string, number>,
): MonthlyParameterRow[] => {
  const kept = new Map((current ?? []).map(item => [item.id, item]));
  return fyMonthsInRange(startMonth, endMonth).map(fyMonth => {
    const id = monthlyRowId(fyMonth);
    const existing = kept.get(id);
    return {
      id,
      name: formatFYMonth(fyMonth, fyYear),
      metrics: existing ? { ...emptyMetrics, ...existing.metrics } : { ...emptyMetrics },
    };
  });
};

/**
 * Whether a rebuilt month list is the one already on screen.
 *
 * The list is rebuilt on every run of the effect that watches the duration, so
 * without this an unchanged window would replace its own rows with equal ones
 * and re-render for nothing.
 */
export const monthlyRowsMatch = (
  current: MonthlyParameterRow[] | undefined,
  next: MonthlyParameterRow[],
): boolean => {
  if (!current || current.length !== next.length) return false;
  return current.every((row, i) => {
    const candidate = next[i];
    if (row.id !== candidate.id || row.name !== candidate.name) return false;
    const keys = Object.keys(candidate.metrics);
    if (Object.keys(row.metrics).length !== keys.length) return false;
    return keys.every(key => row.metrics[key] === candidate.metrics[key]);
  });
};
