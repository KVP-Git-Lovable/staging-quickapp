import { differenceInCalendarDays, format, parseISO } from "date-fns";

/** Generate dates between start and end (inclusive), filtered by allowed weekdays.
 *  weekdays: array of JS day numbers (0 = Sun .. 6 = Sat). Default Mon–Sat.
 */
export function generateDateRange(
  start: string,
  end: string,
  weekdays: number[] = [1, 2, 3, 4, 5, 6],
): string[] {
  if (!start || !end || end < start) return start ? [start] : [];
  const out: string[] = [];
  const d = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  while (d <= e) {
    if (weekdays.includes(d.getDay())) {
      out.push(format(d, "yyyy-MM-dd"));
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Pretty "last served" label. */
export function formatLastServed(dateStr: string | null | undefined): {
  label: string;
  tone: "ok" | "warn" | "bad" | "muted";
} {
  if (!dateStr) return { label: "Never", tone: "bad" };
  const d = parseISO(dateStr);
  const days = differenceInCalendarDays(new Date(), d);
  if (days <= 0) return { label: "Today", tone: "ok" };
  if (days === 1) return { label: "Yesterday", tone: "ok" };
  if (days <= 7) return { label: `${days} days ago`, tone: "ok" };
  if (days <= 14) return { label: `${days} days ago`, tone: "warn" };
  return { label: `${days} days ago`, tone: "bad" };
}

/** Find the first date strictly after `fromDate` where the rep is not on leave
 *  and the beat is not already planned. Searches up to `lookahead` days.
 */
export function findNextAvailableDate(
  fromDate: string,
  beatId: string,
  plannedDates: Set<string>, // dates already planned for this beat
  leaveDates: Set<string>,
  lookahead = 30,
): string | null {
  const d = new Date(fromDate + "T00:00:00");
  for (let i = 1; i <= lookahead; i++) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) continue; // skip Sundays
    const key = format(d, "yyyy-MM-dd");
    if (!plannedDates.has(key) && !leaveDates.has(key)) return key;
  }
  return null;
}
