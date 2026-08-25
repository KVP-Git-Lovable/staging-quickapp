/**
 * Financial-year months, in FY order.
 *
 * An Indian financial year runs April to March, so FY month 1 is April and FY
 * month 12 is March. `fy_year` names the year the FY ends in: fy_year 2027 is
 * FY 2026-27, whose April falls in calendar 2026 and whose March falls in
 * calendar 2027.
 *
 * Every Targets surface that shows a month should label it through here, so a
 * month reads the same wherever it appears and the year is never left to the
 * reader to infer — "January" alone is ambiguous in a window that starts in
 * April.
 */

export const FY_MONTH_NAMES = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March',
] as const;

export const FY_MONTH_SHORT_NAMES = [
  'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
  'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar',
] as const;

/** FY month numbers are 1 (April) through 12 (March). */
export const FY_MONTH_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const isFYMonth = (value: number): boolean =>
  Number.isInteger(value) && value >= 1 && value <= 12;

export interface FYMonthFormat {
  /** 'Apr 26' rather than 'April 26'. */
  short?: boolean;
  /** '2026' rather than '26'. */
  fullYear?: boolean;
}

/**
 * Where an FY month sits on the calendar.
 *
 * April to December (FY months 1-9) belong to the year before the FY ends;
 * January to March (FY months 10-12) belong to the year it ends in.
 */
export const fyMonthCalendar = (
  fyMonth: number,
  fyYear: number,
): { monthIndex: number; year: number } =>
  fyMonth <= 9
    ? { monthIndex: fyMonth + 2, year: fyYear - 1 }
    : { monthIndex: fyMonth - 10, year: fyYear };

/** Calendar year an FY month falls in. */
export const fyMonthCalendarYear = (fyMonth: number, fyYear: number): number =>
  fyMonthCalendar(fyMonth, fyYear).year;

/** Month name on its own, no year. Stored and compared, not displayed. */
export const fyMonthName = (fyMonth: number, options: FYMonthFormat = {}): string => {
  if (!isFYMonth(fyMonth)) return '';
  const names = options.short ? FY_MONTH_SHORT_NAMES : FY_MONTH_NAMES;
  return names[fyMonth - 1];
};

/**
 * A month as it should be shown: 'April 26', or 'Apr 26' shortened.
 *
 * FY 2026-27 reads April 26, May 26 … December 26, January 27 … March 27.
 */
export const formatFYMonth = (
  fyMonth: number,
  fyYear: number,
  options: FYMonthFormat = {},
): string => {
  const name = fyMonthName(fyMonth, options);
  if (!name) return '';
  const year = fyMonthCalendarYear(fyMonth, fyYear);
  return `${name} ${options.fullYear ? String(year) : String(year).slice(-2)}`;
};

/** The FY month numbers between two bounds, inclusive and in FY order. */
export const fyMonthsInRange = (startMonth: number, endMonth: number): number[] => {
  const start = isFYMonth(startMonth) ? startMonth : 1;
  const end = isFYMonth(endMonth) ? endMonth : 12;
  if (end < start) return [start];
  return FY_MONTH_NUMBERS.filter(m => m >= start && m <= end);
};

/** Select options for a month picker, labelled with the year. */
export const fyMonthOptions = (
  fyYear: number,
  options: FYMonthFormat = {},
): { value: number; label: string }[] =>
  FY_MONTH_NUMBERS.map(value => ({ value, label: formatFYMonth(value, fyYear, options) }));

/** 'April 26 – March 27', collapsing to a single month where the window is one. */
export const formatFYMonthRange = (
  startMonth: number,
  endMonth: number,
  fyYear: number,
  options: FYMonthFormat = {},
): string => {
  const start = formatFYMonth(startMonth, fyYear, options);
  const end = formatFYMonth(endMonth, fyYear, options);
  if (!start || !end) return start || end;
  return startMonth === endMonth ? start : `${start} – ${end}`;
};
