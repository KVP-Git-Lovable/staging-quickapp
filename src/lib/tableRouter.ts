import type { Database } from '@/integrations/supabase/types';

type ProdTableName = keyof Database['public']['Tables'];

const tablePrefix = import.meta.env.VITE_TABLE_PREFIX ?? '';

/**
 * Returns the correct Supabase table name for the current build.
 *
 * QA build (npm run sync:qa):
 *   table('orders')    → 'qa_orders'
 *   table('retailers') → 'qa_retailers'
 *
 * Production build (npm run sync:prod):
 *   table('orders')    → 'orders'
 *   table('retailers') → 'retailers'
 *
 * Value is resolved at compile time, not at APK runtime.
 *
 * USAGE: supabase.from(table('orders') as any).select(...)
 *
 * Use `as any` at call sites until QA tables are added to the
 * generated types file after the migration runs and types are
 * regenerated.
 */
export function table(name: ProdTableName): string {
  return tablePrefix ? `${tablePrefix}${name}` : name;
}

export const isQAMode = (): boolean =>
  import.meta.env.VITE_APP_MODE === 'qa';
