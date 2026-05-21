/**
 * Centralized tier mapping for external retailer match scores (0–100).
 * Single source of truth — used by lists, detail views, charts, filters.
 *
 * Tiers:
 *   Excellent ≥ 70  — Strong product + channel fit
 *   Good      50–69 — Solid match
 *   Fair      30–49 — Partial match
 *   Low       < 30  — Weak match
 *   Unscored  null  — Not yet scored
 */

export type MatchTierLabel = 'Excellent' | 'Good' | 'Fair' | 'Low' | 'Unscored';
export type MatchTierKey = 'excellent' | 'good' | 'fair' | 'low' | 'unscored';

export interface MatchTier {
  key: MatchTierKey;
  label: MatchTierLabel;
  /** Tailwind background class (light + dark) */
  bg: string;
  /** Tailwind text class (light + dark) */
  text: string;
  /** HSL chart color (uses semantic tokens) */
  chartColor: string;
  /** Range label, e.g. "≥70" */
  range: string;
}

export function getMatchTier(score: number | null | undefined): MatchTier {
  if (score === null || score === undefined) {
    return {
      key: 'unscored',
      label: 'Unscored',
      bg: 'bg-muted',
      text: 'text-muted-foreground',
      chartColor: 'hsl(var(--muted-foreground))',
      range: '—',
    };
  }
  if (score >= 70) {
    return {
      key: 'excellent',
      label: 'Excellent',
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-700 dark:text-green-400',
      chartColor: 'hsl(var(--success))',
      range: '≥70',
    };
  }
  if (score >= 50) {
    return {
      key: 'good',
      label: 'Good',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-700 dark:text-blue-400',
      chartColor: 'hsl(var(--primary))',
      range: '50–69',
    };
  }
  if (score >= 30) {
    return {
      key: 'fair',
      label: 'Fair',
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      text: 'text-yellow-700 dark:text-yellow-400',
      chartColor: 'hsl(var(--warning))',
      range: '30–49',
    };
  }
  return {
    key: 'low',
    label: 'Low',
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-400',
    chartColor: 'hsl(var(--destructive))',
    range: '<30',
  };
}

export function matchesTierFilter(score: number | null | undefined, filter: string): boolean {
  if (filter === 'all') return true;
  return getMatchTier(score).key === filter;
}
