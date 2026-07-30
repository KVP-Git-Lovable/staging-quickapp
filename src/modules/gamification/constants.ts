export type ProgramCategory =
  | "orders"
  | "visits"
  | "retailers"
  | "attendance"
  | "products"
  | "beats"
  | "targets"
  | "captures";

export interface CategoryMeta {
  value: ProgramCategory;
  label: string;
  color: string;
  tint: string;
  border: string;
  text: string;
  dot: string;
  /** gradient start / end fills from the approved light palette */
  fill: string;
  f2: string;
  /** accent + text hex from the approved light palette */
  ac: string;
  tx: string;
  icon: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { value: "orders", label: "Orders", color: "blue", tint: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-400", fill: "#eaf2ff", f2: "#dbeafe", ac: "#3b82f6", tx: "#1d4ed8", icon: "shopping-cart" },
  { value: "visits", label: "Visits", color: "teal", tint: "bg-teal-50", border: "border-teal-200", text: "text-teal-700", dot: "bg-teal-400", fill: "#e7f7f1", f2: "#d3f0e6", ac: "#14b8a6", tx: "#0f766e", icon: "map-pin" },
  { value: "retailers", label: "Retailers", color: "green", tint: "bg-green-50", border: "border-green-200", text: "text-green-700", dot: "bg-green-400", fill: "#eef7e4", f2: "#e2f0d0", ac: "#84cc16", tx: "#4d7c0f", icon: "store" },
  { value: "attendance", label: "Attendance", color: "amber", tint: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-400", fill: "#fdf3e3", f2: "#fbe8ca", ac: "#f59e0b", tx: "#b45309", icon: "user-check" },
  { value: "products", label: "Products", color: "purple", tint: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", dot: "bg-purple-400", fill: "#f0edfd", f2: "#e6e0fb", ac: "#8b5cf6", tx: "#6d28d9", icon: "package" },
  { value: "beats", label: "Beats", color: "coral", tint: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", dot: "bg-orange-400", fill: "#fdeceb", f2: "#fbdcd9", ac: "#f2603c", tx: "#be3d2e", icon: "route" },
  { value: "targets", label: "Targets", color: "indigo", tint: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700", dot: "bg-indigo-400", fill: "#ebedfd", f2: "#dde1fb", ac: "#6366f1", tx: "#4338ca", icon: "target" },
  { value: "captures", label: "Captures", color: "pink", tint: "bg-pink-50", border: "border-pink-200", text: "text-pink-700", dot: "bg-pink-400", fill: "#fdeaf2", f2: "#fbd8e6", ac: "#ec4899", tx: "#be185d", icon: "clipboard" },
];

export const categoryMeta = (value?: string | null) =>
  CATEGORIES.find((c) => c.value === value) ?? CATEGORIES[0];


export const LINKED_MODULE_NOTE: Partial<Record<ProgramCategory, string>> = {
  products: "Linked to Product Management — activities award when an order contains a product flagged Focused, read live.",
  beats: "Linked to the Beats module — growth is measured against the beat owner's own history, read live.",
  targets: "Linked to the Targets module — each activity rewards a % of the rep's own target, read live.",
  captures: "Linked to the capture forms — activities award on form submission, read live.",
};

export const TRIGGERS: Record<ProgramCategory, { value: string; label: string }[]> = {
  orders: [
    { value: "order_placed", label: "Order placed" },
    { value: "order_confirmed", label: "Order confirmed" },
    { value: "order_frequency", label: "Consecutive orders" },
  ],
  visits: [
    { value: "visit_completed", label: "Visit completed" },
    { value: "productive_visit", label: "Productive visit (visit with order)" },
    { value: "total_visits", label: "Visit count reached" },
  ],
  retailers: [
    { value: "retailer_created", label: "New retailer added" },
    { value: "retailer_verified", label: "Retailer verified" },
    { value: "first_order_new_retailer", label: "First order from a new retailer" },
    { value: "retailer_active_streak", label: "Retailer stays active (streak)" },
  ],
  attendance: [
    { value: "attendance_check_in", label: "Day started (check-in)" },
    { value: "attendance_full_day", label: "Full day completed" },
    { value: "attendance_on_time", label: "On-time check-in" },
    { value: "attendance_streak", label: "Attendance streak" },
  ],
  products: [
    { value: "focused_product_sales", label: "Order contains a focused product" },
    { value: "new_product_introduction", label: "First focus-product order for a retailer" },
  ],
  beats: [
    { value: "beat_growth", label: "Beat growth achieved" },
    { value: "beat_new_retailers", label: "New retailers added in a beat" },
  ],
  targets: [{ value: "target_achievement", label: "Target achievement (period close)" }],
  captures: [
    { value: "competition_insight", label: "Competition intelligence submitted" },
    { value: "retailer_feedback", label: "Retailer feedback submitted" },
    { value: "branding_request", label: "Branding request submitted" },
  ],
};

export const CONDITION_FIELDS: Record<string, { value: string; label: string }[]> = {
  order_placed: [
    { value: "order_value", label: "Order value" },
    { value: "line_count", label: "Number of line items" },
    { value: "payment_mode", label: "Payment mode" },
  ],
  order_confirmed: [
    { value: "order_value", label: "Order value" },
    { value: "line_count", label: "Number of line items" },
  ],
  order_frequency: [{ value: "consecutive_orders", label: "Consecutive orders" }],
  visit_completed: [
    { value: "duration_minutes", label: "Visit duration (minutes)" },
    { value: "has_photo", label: "Photo captured" },
  ],
  productive_visit: [{ value: "order_value", label: "Order value" }],
  total_visits: [{ value: "visit_count", label: "Visits in the day" }],
  retailer_created: [{ value: "has_gps", label: "GPS captured" }],
  retailer_verified: [{ value: "verification_score", label: "Verification score" }],
  first_order_new_retailer: [{ value: "order_value", label: "Order value" }],
  attendance_check_in: [{ value: "check_in_hour", label: "Check-in hour" }],
  attendance_full_day: [{ value: "worked_hours", label: "Hours worked" }],
  attendance_on_time: [{ value: "check_in_hour", label: "Check-in hour" }],
  attendance_streak: [
    { value: "streak_days", label: "Consecutive days present" },
    { value: "no_leave_this_month", label: "No leave taken this month" },
    { value: "leave_days_this_month", label: "Leave days taken this month" },
    { value: "is_month_end", label: "Is last working day of the month" },
  ],
};

export const OPERATORS = [
  { value: ">=", label: "is at least" },
  { value: ">", label: "is more than" },
  { value: "<=", label: "is at most" },
  { value: "<", label: "is less than" },
  { value: "=", label: "equals" },
  { value: "!=", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "is_true", label: "is yes" },
  { value: "is_false", label: "is no" },
];

export const EXPIRY_OPTIONS = [
  { value: "days:180", label: "180 days" },
  { value: "days:90", label: "90 days" },
  { value: "days:365", label: "365 days" },
  { value: "never", label: "Never" },
  { value: "fy_end", label: "Financial year end" },
];

export const CAP_SCOPES = [
  { value: "none", label: "No cap" },
  { value: "user_day", label: "Per user, per day" },
  { value: "user_month", label: "Per user, per month" },
  { value: "retailer", label: "Per retailer" },
];

export const AWARD_MODES = [
  { value: "auto", label: "Automatic" },
  { value: "approval", label: "Needs approval" },
];

export const TARGET_PERIODS = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export const GROWTH_METRICS = [
  { value: "avg_order_value", label: "Average order value" },
  { value: "total_sales", label: "Total sales" },
  { value: "new_retailers", label: "New retailers" },
  { value: "visits", label: "Visits" },
];

export const GROWTH_COMPARE = [
  { value: "previous_month", label: "Previous month" },
  { value: "previous_quarter", label: "Previous quarter" },
  { value: "same_period_last_year", label: "Same period last year" },
];
