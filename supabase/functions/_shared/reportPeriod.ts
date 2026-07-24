// Utilities to compute the reporting period label + date range for a subscription cadence.

export interface Period {
  key: string;
  label: string;
  date_from: string;
  date_to: string;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoWeek(d: Date): { year: number; week: number } {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  const week = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return { year: target.getUTCFullYear(), week };
}

/**
 * Compute reporting period for a cadence and basis.
 * - basis='current' (default): current period-to-date (today / this week / this month so far)
 * - basis='previous': the last COMPLETED period (yesterday / last ISO week / previous calendar month)
 */
export function computePeriod(
  cadence: string,
  now: Date = new Date(),
  basis: 'current' | 'previous' = 'current',
): Period {
  const today = new Date(now);
  const todayStr = fmt(today);

  if (cadence === 'daily' || cadence === 'weekday' || cadence === 'today') {
    if (basis === 'previous') {
      const y = new Date(today.valueOf() - 86400000);
      const s = fmt(y);
      return { key: s, label: s, date_from: s, date_to: s };
    }
    return { key: todayStr, label: todayStr, date_from: todayStr, date_to: todayStr };
  }

  if (cadence === 'weekly') {
    const w = new Date(now);
    const dayNr = (w.getUTCDay() + 6) % 7;
    w.setUTCDate(w.getUTCDate() - dayNr); // Monday of current week
    if (basis === 'previous') {
      const monPrev = new Date(w.valueOf() - 7 * 86400000);
      const sunPrev = new Date(monPrev.valueOf() + 6 * 86400000);
      const iw = isoWeek(monPrev);
      return {
        key: `${iw.year}-W${String(iw.week).padStart(2, '0')}`,
        label: `Week ${iw.week}, ${iw.year}`,
        date_from: fmt(monPrev),
        date_to: fmt(sunPrev),
      };
    }
    const iw = isoWeek(w);
    return {
      key: `${iw.year}-W${String(iw.week).padStart(2, '0')}`,
      label: `Week ${iw.week}, ${iw.year} (to date)`,
      date_from: fmt(w),
      date_to: todayStr,
    };
  }

  // monthly
  if (basis === 'current') {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const key = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    return {
      key,
      label: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }) + ' (to date)',
      date_from: fmt(first),
      date_to: todayStr,
    };
  }
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prevLast = new Date(first.valueOf() - 86400000);
  const prevFirst = new Date(Date.UTC(prevLast.getUTCFullYear(), prevLast.getUTCMonth(), 1));
  const key = `${prevLast.getUTCFullYear()}-${String(prevLast.getUTCMonth() + 1).padStart(2, '0')}`;
  return {
    key,
    label: prevLast.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    date_from: fmt(prevFirst),
    date_to: fmt(prevLast),
  };
}

/**
 * Compute the current scheduled occurrence for a subscription and whether it
 * is due right now (catch-up semantics).
 *
 * The occurrence key identifies the scheduled slot — local calendar date plus
 * fire_time (HH:MM). It is intentionally derived from the schedule, NOT from
 * the reporting period, so that:
 *   - changing fire_time yields a new key (allowing another fire the same day)
 *   - period_basis (current/previous) never affects idempotency
 *
 * `due` is true when: today matches the cadence's day rule AND the current
 * local time is at or past today's fire time. Occurrences from previous days
 * are never revived — only today's slot is considered.
 */
export interface Occurrence {
  key: string;       // e.g. "2026-07-24T17:05"
  dueAt: string;     // same as key; kept for clarity
  due: boolean;      // catch-up: now >= scheduled time today, and cadence matches today
  matchesToday: boolean;
}

export function computeOccurrence(
  cadence: string,
  fireDay: string | null,
  fireTime: string,
  tz: string,
  now: Date = new Date(),
): Occurrence {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const y = get('year'), mo = get('month'), d = get('day');
  const hh = parseInt(get('hour'), 10);
  const mm = parseInt(get('minute'), 10);
  const weekday = get('weekday');
  const day = parseInt(d, 10);

  const [fh, fm] = fireTime.split(':').map(n => parseInt(n, 10));
  const nowMin = hh * 60 + mm;
  const fireMin = fh * 60 + fm;

  let matchesToday = false;
  if (cadence === 'daily' || cadence === 'today') matchesToday = true;
  else if (cadence === 'weekday') matchesToday = !['Sat', 'Sun'].includes(weekday);
  else if (cadence === 'weekly') matchesToday = weekday.toLowerCase().startsWith((fireDay ?? 'mon').slice(0, 3).toLowerCase());
  else if (cadence === 'monthly') matchesToday = day === parseInt(fireDay ?? '1', 10);

  const hhmm = `${String(fh).padStart(2, '0')}:${String(fm).padStart(2, '0')}`;
  const key = `${y}-${mo}-${d}T${hhmm}`;

  return {
    key,
    dueAt: key,
    matchesToday,
    due: matchesToday && nowMin >= fireMin,
  };
}

/**
 * @deprecated Kept for backwards compatibility. Prefer computeOccurrence().
 * Returns true only in the exact 15-minute window after fire_time — this is
 * the OLD behaviour and does not support catch-up.
 */
export function isDue(
  cadence: string,
  fireDay: string | null,
  fireTime: string,
  tz: string,
  now: Date = new Date(),
): boolean {
  const occ = computeOccurrence(cadence, fireDay, fireTime, tz, now);
  return occ.due;
}
