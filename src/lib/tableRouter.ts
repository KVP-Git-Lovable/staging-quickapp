import type { Database } from '@/integrations/supabase/types';

type ProdTableName = keyof Database['public']['Tables'];

const tablePrefix = import.meta.env.VITE_TABLE_PREFIX ?? '';

/**
 * Tables that have a `qa_<name>` mirror in the database.
 * In QA builds, `supabase.from(<name>)` is transparently rewritten
 * to `qa_<name>` for these. All other tables pass through unchanged
 * (used as read-only reference data in QA).
 *
 * Keep this in sync with the qa_* tables that actually exist in Postgres.
 */
export const QA_MIRRORED_TABLES: ReadonlySet<string> = new Set([
  'retailers',
  'visits',
  'orders',
  'order_items',
  'attendance',
  'gps_tracking',
  'retailer_visit_logs',
  'products',
  'inst_leads',
  // QA-only logging tables (already physically prefixed in the schema)
  'test_runs',
  'test_logs',
  'sync_audit_log',
]);

/**
 * RPCs that are safe to call from a QA build because they are either
 * read-only or already QA-aware. Anything not on this list is blocked
 * in QA mode to prevent accidental writes against production tables.
 */
export const QA_SAFE_RPCS: ReadonlySet<string> = new Set([
  // add read-only / QA-aware RPCs here as they get audited
]);

/**
 * Returns the correct Supabase table name for the current build.
 * Most code does NOT need to call this — the wrapped supabase client
 * in `@/integrations/supabase/client` rewrites mirrored table names
 * automatically in QA mode.
 */
export function table(name: ProdTableName): string {
  if (!tablePrefix) return name;
  return QA_MIRRORED_TABLES.has(name) ? `${tablePrefix}${name}` : name;
}

export const isQAMode = (): boolean =>
  import.meta.env.VITE_APP_MODE === 'qa';

export const qaTablePrefix = (): string => tablePrefix;
