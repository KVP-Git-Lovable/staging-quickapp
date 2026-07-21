// Utilities to compute the reporting period label + date range for a subscription cadence.

export interface Period {
  key: string; // stable ID used for idempotency & storage paths (e.g. "2026-07-20", "2026-W29", "2026-06")
  label: string;
  date_from: string; // yyyy-mm-dd
  date_to: string; // yyyy-mm-dd
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
 * Compute reporting period for a cadence.
 *
 * Same-day cadences (daily / weekday / weekly) are CURRENT-DAY-TO-DATE — e.g. the
 * 11:00 attendance summary or the 19:00 EOD run should report today up to `now`,
 * NOT yesterday. This matches the real-world use of "morning attendance" and
 * "end-of-day" digests. Only Monthly looks back a full completed period.
 */
export function computePeriod(cadence: string, now: Date = new Date()): Period {
  const today = new Date(now);
  const todayStr = fmt(today);

  if (cadence === 'daily' || cadence === 'weekday' || cadence === 'today') {
    return {
      key: todayStr,
      label: todayStr,
      date_from: todayStr,
      date_to: todayStr,
    };
  }

  if (cadence === 'weekly') {
    // Current ISO week — Monday..today (week-to-date)
    const w = new Date(now);
    const dayNr = (w.getUTCDay() + 6) % 7;
    w.setUTCDate(w.getUTCDate() - dayNr); // Monday of current week
    const from = new Date(w);
    const iw = isoWeek(from);
    return {
      key: `${iw.year}-W${String(iw.week).padStart(2, '0')}`,
      label: `Week ${iw.week}, ${iw.year} (to date)`,
      date_from: fmt(from),
      date_to: todayStr,
    };
  }

  // monthly: previous calendar month (only cadence that looks back a full period)
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
 * Returns true when `now` in `tz` matches the subscription's fire slot (within a 15-min tick window).
 */
export function isDue(
  cadence: string,
  fireDay: string | null,
  fireTime: string, // "HH:MM" or "HH:MM:SS"
  tz: string,
  now: Date = new Date(),
): boolean {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const hh = parseInt(get('hour'), 10);
  const mm = parseInt(get('minute'), 10);
  const weekday = get('weekday'); // Mon, Tue, ...
  const day = parseInt(get('day'), 10);

  const [fh, fm] = fireTime.split(':').map(n => parseInt(n, 10));
  const nowMin = hh * 60 + mm;
  const fireMin = fh * 60 + fm;
  // 15-min tick window: fire if we're within [fire, fire + 14min]
  if (nowMin < fireMin || nowMin >= fireMin + 15) return false;

  if (cadence === 'daily') return true;
  if (cadence === 'weekday') return !['Sat', 'Sun'].includes(weekday);
  if (cadence === 'weekly') return weekday.toLowerCase().startsWith((fireDay ?? 'mon').slice(0, 3).toLowerCase());
  if (cadence === 'monthly') {
    const d = parseInt(fireDay ?? '1', 10);
    return day === d;
  }
  return false;
}
