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
  'beats',
  'beat_plans',
  'daily_beat_plans',
  'retailer_beat_assignments',
  // Tier 3 — mobile field-app flows (Activities/Events, Beats, Attendance/GPS,
  // Leave, Petty Cash, Social/Profile, Order Entry, My Operations).
  'activity_events',
  'activity_attachments',
  'joint_sales_sessions',
  'joint_sales_feedback',
  'gps_tracking_stops',
  'beat_allowances',
  'beat_audit_log',
  'leave_applications',
  'leave_balance',
  'regularization_requests',
  'petty_cash_transactions',
  'ai_feature_feedback',
  'retailer_verification_audit',
  'distributor_payments',
  'stock',
  'stock_cycle_data',
  'social_posts',
  'social_comments',
  'social_likes',
  'social_reactions',
  'social_post_attachments',
  'employee_connections',
  'employee_recommendations',
  'education_history',
  'emergency_contacts',
  'work_experiences',
  'user_onboarding_progress',
  'user_page_views',
  'user_data_usage',
  'support_requests',
  // Tier 4 — DMS (Distributor Management System) admin module.
  'distributors',
  'distributor_contacts',
  'distributor_attachments',
  'distributor_evaluation_tasks',
  'distributor_business_plans',
  'distributor_business_plan_products',
  'distributor_business_plan_retailers',
  'distributor_business_plan_months',
  'distributor_business_plan_month_products',
  'distributor_users',
  'distributor_price_books',
  'distributor_payment_config',
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
