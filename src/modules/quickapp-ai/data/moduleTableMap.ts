import type { Database } from "@/integrations/supabase/types";

/**
 * UI mapping for the "Create AI Agent" builder: which database tables a
 * permission module primarily works with.
 *
 * This is a DISPLAY mapping only — it is not authoritative schema metadata
 * and grants nothing. Keys are the `name` values of HIERARCHICAL_MODULES
 * (src/components/security/hierarchicalPermissions.ts), i.e. the same
 * module list the Security & Access Control → Role Permissions → Module
 * Permission subtab renders. Table names are typed against the generated
 * Supabase schema so a rename breaks the build instead of the UI.
 * Modules whose data surface is composite or admin-wide are left empty on
 * purpose; the builder shows "No tables mapped yet" for them.
 */
export type PublicTableName = keyof Database["public"]["Tables"];

export const MODULE_TABLE_MAP: Record<string, readonly PublicTableName[]> = {
  attendance: ["attendance", "attendance_daily_admin_summary", "attendance_user_monthly_summary"],
  my_visit: ["visits", "retailers", "retailer_visit_logs", "visit_ai_insights"],
  all_retailers: ["retailers", "retailer_beat_assignments", "retailer_feedback", "retailer_credit_scores", "retailer_payment_collections"],
  my_beats: ["beats", "beat_plans", "daily_beat_plans", "beat_allowances", "retailers"],
  my_target: ["hierarchy_targets", "user_period_targets", "fy_period_targets", "target_plans", "target_actual_logs"],
  analytics: ["orders", "order_items", "visits", "retailers"],
  gps_track: ["gps_tracking", "gps_tracking_stops", "daily_gps_distance"],
  performance: ["user_performance_scores", "performance_comments", "performance_module_config"],
  primary_orders: ["primary_orders", "primary_order_items", "primary_invoices", "primary_order_schemes"],
  my_expenses: ["additional_expenses", "expense_categories", "expense_groups", "user_expense_config"],
  gamification: ["gamification_points", "gamification_games", "gamification_daily_tracking", "gamification_redemptions", "leaderboard_snapshots"],
  distributor_master: ["distributors", "distributor_contacts", "distributor_users", "distributor_inventory", "distributor_payments"],
  territories: ["territories", "territory_assignment_history"],
  competition_master: ["competition_master", "competition_data", "competition_insights", "competition_skus"],
  check_schemes: ["product_schemes", "scheme_applicability", "ai_scheme_suggestions"],
  packing_list: ["packing_lists", "packing_list_items", "packing_list_orders", "packing_list_assignments"],
  my_deliveries: ["delivery_runs", "delivery_challans", "delivery_challan_items", "delivery_exceptions"],
  recycle_bin: ["recycle_bin", "recycle_bin_config"],
  competency: ["competencies", "employee_competencies", "user_competency_monthly_scores", "competency_templates"],
  homepage: [],
  admin_control: [],
  beat_coordinator: ["daily_beat_plans", "beat_coverage_assignments", "van_beat_assignments"],
  quickapp_ai: ["ai_agents", "ai_workflows", "workflow_executions", "ai_insights"],
  operations: ["stock", "van_stock", "opening_stock_entries", "product_availability"],
};

/** Tables for one module; [] when nothing is mapped yet. */
export function tablesForModule(moduleName: string): readonly PublicTableName[] {
  return MODULE_TABLE_MAP[moduleName] ?? [];
}
