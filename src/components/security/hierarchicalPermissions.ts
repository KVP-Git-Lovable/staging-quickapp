export interface PermissionItem {
  name: string;
  label: string;
}

export interface HierarchicalModule {
  name: string;
  label: string;
  fields: PermissionItem[];
  actions: PermissionItem[];
  widgets: PermissionItem[];
}

export const HIERARCHICAL_MODULES: HierarchicalModule[] = [
  {
    name: 'attendance',
    label: 'Attendance',
    fields: [
      { name: 'field_attendance_pct_this_month', label: 'Attendance % (This Month)' },
      { name: 'field_attendance_present_days', label: 'Present Days' },
      { name: 'field_attendance_absent_days', label: 'Absent Days' },
      { name: 'field_attendance_working_hours', label: 'Working Hours' },
      { name: 'field_attendance_market_hours', label: 'Market Hours' },
      { name: 'field_attendance_first_checkin', label: 'First Check-in' },
      { name: 'field_attendance_last_checkout', label: 'Last Check-out' },
      { name: 'field_attendance_location', label: 'Location' },
    ],
    actions: [
      { name: 'action_attendance_check_in', label: 'Check In' },
      { name: 'action_attendance_check_out', label: 'Check Out' },
      { name: 'action_attendance_apply_leave', label: 'Apply Leave' },
      { name: 'action_attendance_regularize', label: 'Regularize' },
      { name: 'action_attendance_start_market_hours', label: 'Start Market Hours' },
      { name: 'action_attendance_stop_market_hours', label: 'Stop Market Hours' },
      { name: 'action_attendance_face_verification', label: 'Face Verification' },
      { name: 'action_attendance_photo_capture', label: 'Photo Capture' },
    ],
    widgets: [
      { name: 'widget_attendance_my_attendance_tab', label: 'My Attendance Tab' },
      { name: 'widget_attendance_my_team_tab', label: 'My Team Tab' },
      { name: 'widget_attendance_records_table', label: 'Attendance Records Table' },
      { name: 'widget_attendance_leave_tab', label: 'Leave Tab' },
      { name: 'widget_attendance_holiday_tab', label: 'Holiday Tab' },
      { name: 'widget_attendance_journey_map', label: 'Journey Map' },
      { name: 'widget_attendance_timeline_view', label: 'Timeline View' },
      { name: 'widget_attendance_monthly_summary', label: 'Monthly Summary Cards' },
    ],
  },
  {
    name: 'my_visit',
    label: 'My Visit',
    fields: [
      { name: 'field_visit_date', label: 'Visit Date' },
      { name: 'field_visit_retailer_name', label: 'Retailer Name' },
      { name: 'field_visit_beat_name', label: 'Beat Name' },
      { name: 'field_visit_checkin_time', label: 'Check-in Time' },
      { name: 'field_visit_duration', label: 'Visit Duration' },
      { name: 'field_visit_order_value', label: 'Order Value' },
      { name: 'field_visit_status', label: 'Status' },
      { name: 'field_visit_distributor', label: 'Distributor' },
    ],
    actions: [
      { name: 'action_visit_create', label: 'Create Visit' },
      { name: 'action_visit_edit', label: 'Edit Visit' },
      { name: 'action_visit_auto_plan', label: 'Auto Plan' },
      { name: 'action_visit_all_beat', label: 'All Beat' },
      { name: 'action_visit_retailers', label: 'Retailers' },
      { name: 'action_visit_summary', label: 'Summary' },
      { name: 'action_visit_timeline', label: 'Timeline' },
      { name: 'action_visit_gps_track', label: 'GPS Track' },
      { name: 'action_visit_van_stock', label: 'Van Stock' },
      { name: 'action_visit_activity', label: 'Activity' },
    ],
    widgets: [
      { name: 'widget_visit_todays_progress', label: "Today's Progress" },
      { name: 'widget_visit_points_earned', label: 'Points Earned' },
      { name: 'widget_visit_week_calendar', label: 'Week Calendar' },
      { name: 'widget_visit_retailer_card_list', label: 'Retailer Card List' },
      { name: 'widget_visit_orders_dialog', label: 'Orders Dialog' },
      { name: 'widget_visit_filters', label: 'Visit Filters' },
      { name: 'widget_visit_ai_recommendations', label: 'AI Recommendations / Insights' },
      { name: 'widget_visit_sync_data_modal', label: 'Sync Data Modal' },
    ],
  },
  {
    name: 'all_retailers',
    label: 'All Retailers',
    fields: [
      { name: 'field_retailer_name', label: 'Retailer Name' },
      { name: 'field_retailer_address', label: 'Address' },
      { name: 'field_retailer_phone', label: 'Phone' },
      { name: 'field_retailer_category', label: 'Category' },
      { name: 'field_retailer_priority', label: 'Priority' },
      { name: 'field_retailer_beat_name', label: 'Beat Name' },
      { name: 'field_retailer_last_visit_date', label: 'Last Visit Date' },
      { name: 'field_retailer_credit_score', label: 'Credit Score' },
      { name: 'field_retailer_pending_amount', label: 'Pending Amount' },
      { name: 'field_retailer_gst_number', label: 'GST Number' },
      { name: 'field_retailer_location_tag', label: 'Location Tag' },
      { name: 'field_retailer_retail_type', label: 'Retail Type' },
      { name: 'field_retailer_potential', label: 'Potential' },
    ],
    actions: [
      { name: 'action_retailer_create', label: 'Add / Create Retailer' },
      { name: 'action_retailer_edit', label: 'Edit Retailer' },
      { name: 'action_retailer_delete', label: 'Delete Retailer' },
      { name: 'action_retailer_bulk_import', label: 'Bulk Import' },
      { name: 'action_retailer_mass_edit_beats', label: 'Mass Edit Beats' },
      { name: 'action_retailer_add_to_visit', label: 'Add to Visit' },
      { name: 'action_retailer_view_analytics', label: 'View Analytics' },
      { name: 'action_retailer_export', label: 'Export' },
    ],
    widgets: [
      { name: 'widget_retailer_list_table', label: 'Retailer List / Table' },
      { name: 'widget_retailer_detail_modal', label: 'Retailer Detail Modal' },
      { name: 'widget_retailer_analytics_panel', label: 'Analytics Panel' },
      { name: 'widget_retailer_credit_score_display', label: 'Credit Score Display' },
      { name: 'widget_retailer_pagination', label: 'Pagination Controls' },
      { name: 'widget_retailer_search_filter', label: 'Search / Filter Bar' },
    ],
  },
  {
    name: 'my_beats',
    label: 'My Beats',
    fields: [
      { name: 'field_beat_name', label: 'Beat Name' },
      { name: 'field_beat_schedule', label: 'Schedule' },
      { name: 'field_beat_retailer_count', label: 'Retailer Count' },
      { name: 'field_beat_territory', label: 'Territory' },
      { name: 'field_beat_travel_allowance', label: 'Travel Allowance' },
    ],
    actions: [
      { name: 'action_beat_create', label: 'Create Beat' },
      { name: 'action_beat_edit', label: 'Edit Beat' },
      { name: 'action_beat_delete', label: 'Delete / Deactivate Beat' },
      { name: 'action_beat_assign_retailers', label: 'Assign Retailers' },
      { name: 'action_beat_share', label: 'Share Beat (Co-owner / Operational / View Only)' },
      { name: 'action_beat_coverage', label: 'Assign Leave Coverage' },
      { name: 'action_beat_transfer', label: 'Transfer Beat Ownership' },
      { name: 'action_beat_reactivate', label: 'Reactivate Inactive Beat' },
      { name: 'action_beat_clone', label: 'Clone Beat' },
    ],
    widgets: [
      { name: 'widget_beat_list', label: 'Beat List' },
      { name: 'widget_beat_detail', label: 'Beat Detail' },
      { name: 'widget_beat_analytics', label: 'Beat Analytics' },
      { name: 'widget_beat_calendar', label: 'Beat Calendar' },
    ],
  },
  {
    name: 'my_target',
    label: 'My Target',
    fields: [
      { name: 'field_target_value', label: 'Target Value' },
      { name: 'field_target_achievement_pct', label: 'Achievement %' },
      { name: 'field_target_period', label: 'Period' },
      { name: 'field_target_shortfall', label: 'Shortfall' },
    ],
    actions: [
      { name: 'action_target_view_details', label: 'View Details' },
      { name: 'action_target_export', label: 'Export' },
      { name: 'action_target_compare_periods', label: 'Compare Periods' },
    ],
    widgets: [
      { name: 'widget_target_overview', label: 'Target Overview' },
      { name: 'widget_target_territory_performance', label: 'Territory Performance' },
      { name: 'widget_target_beat_performance', label: 'Beat Performance' },
      { name: 'widget_target_retailer_performance', label: 'Retailer Performance' },
      { name: 'widget_target_ai_recommendations', label: 'AI Recommendations' },
      { name: 'widget_target_shortfall_analysis', label: 'Shortfall Analysis' },
    ],
  },
  {
    name: 'analytics',
    label: 'Analytics',
    fields: [
      { name: 'field_analytics_revenue', label: 'Revenue' },
      { name: 'field_analytics_orders_count', label: 'Orders Count' },
      { name: 'field_analytics_coverage_pct', label: 'Coverage %' },
      { name: 'field_analytics_pending_payments', label: 'Pending Payments' },
    ],
    actions: [
      { name: 'action_analytics_export', label: 'Export' },
      { name: 'action_analytics_filter', label: 'Filter' },
      { name: 'action_analytics_date_range', label: 'Date Range Selection' },
      { name: 'action_analytics_user_filter', label: 'User Filter' },
    ],
    widgets: [
      { name: 'widget_analytics_business_summary', label: 'Business Summary' },
      { name: 'widget_analytics_beat_details', label: 'Beat Details' },
      { name: 'widget_analytics_retailer_details', label: 'Retailer Details' },
      { name: 'widget_analytics_order_details', label: 'Order Details' },
      { name: 'widget_analytics_product_breakdown', label: 'Product Breakdown' },
      { name: 'widget_analytics_pending_payments', label: 'Pending Payments' },
      { name: 'widget_analytics_performance_calendar', label: 'Performance Calendar' },
      { name: 'widget_analytics_leaderboard', label: 'Leaderboard' },
    ],
  },
  {
    name: 'gps_track',
    label: 'GPS Track',
    fields: [
      { name: 'field_gps_location', label: 'Location' },
      { name: 'field_gps_distance_traveled', label: 'Distance Traveled' },
      { name: 'field_gps_duration', label: 'Duration' },
      { name: 'field_gps_visit_count', label: 'Visit Count' },
    ],
    actions: [
      { name: 'action_gps_start_tracking', label: 'Start Tracking' },
      { name: 'action_gps_journey_playback', label: 'Journey Playback' },
      { name: 'action_gps_export', label: 'Export' },
    ],
    widgets: [
      { name: 'widget_gps_live_map', label: 'Live Map' },
      { name: 'widget_gps_timeline', label: 'Timeline' },
      { name: 'widget_gps_visit_statistics', label: 'Visit Statistics' },
      { name: 'widget_gps_time_analytics', label: 'Time Analytics' },
      { name: 'widget_gps_team_status', label: 'Team Status' },
    ],
  },
  {
    name: 'performance',
    label: 'Performance',
    fields: [
      { name: 'field_performance_overall_score', label: 'Overall Score' },
      { name: 'field_performance_rank', label: 'Rank' },
      { name: 'field_performance_trend', label: 'Trend' },
    ],
    actions: [
      { name: 'action_performance_export', label: 'Export' },
      { name: 'action_performance_compare_periods', label: 'Compare Periods' },
    ],
    widgets: [
      { name: 'widget_performance_overall', label: 'Overall Performance' },
      { name: 'widget_performance_territory_breakdown', label: 'Territory Breakdown' },
      { name: 'widget_performance_beat_breakdown', label: 'Beat Breakdown' },
      { name: 'widget_performance_retailer_breakdown', label: 'Retailer Breakdown' },
      { name: 'widget_performance_period_comparison', label: 'Period Comparison' },
      { name: 'widget_performance_trend_analysis', label: 'Trend Analysis' },
      { name: 'widget_performance_leaderboard', label: 'Leaderboard' },
    ],
  },
  {
    name: 'primary_orders',
    label: 'Primary Orders',
    fields: [
      { name: 'field_order_number', label: 'Order Number' },
      { name: 'field_order_amount', label: 'Amount' },
      { name: 'field_order_status', label: 'Status' },
      { name: 'field_order_date', label: 'Date' },
      { name: 'field_order_transporter_info', label: 'Transporter Info' },
      { name: 'field_order_dispatch_date', label: 'Dispatch Date' },
    ],
    actions: [
      { name: 'action_order_create', label: 'Create Order' },
      { name: 'action_order_edit', label: 'Edit Order' },
      { name: 'action_order_view_details', label: 'View Details' },
      { name: 'action_order_inventory_sync', label: 'Inventory Sync' },
    ],
    widgets: [
      { name: 'widget_order_list', label: 'Order List' },
      { name: 'widget_order_status_board', label: 'Order Status Board' },
      { name: 'widget_order_details', label: 'Order Details' },
    ],
  },
  {
    name: 'my_expenses',
    label: 'My Expenses',
    fields: [
      { name: 'field_expense_amount', label: 'Amount' },
      { name: 'field_expense_category', label: 'Category' },
      { name: 'field_expense_date', label: 'Date' },
      { name: 'field_expense_status', label: 'Status' },
      { name: 'field_expense_distance', label: 'Distance' },
    ],
    actions: [
      { name: 'action_expense_submit_claim', label: 'Submit Claim' },
      { name: 'action_expense_edit_claim', label: 'Edit Claim' },
      { name: 'action_expense_export', label: 'Export' },
    ],
    widgets: [
      { name: 'widget_expense_beat_allowance', label: 'Beat Allowance' },
      { name: 'widget_expense_claims', label: 'Expense Claims' },
      { name: 'widget_expense_claim_history', label: 'Claim History' },
      { name: 'widget_expense_approval_status', label: 'Approval Status' },
    ],
  },
  {
    name: 'gamification',
    label: 'Gamification / Leaderboard',
    fields: [
      { name: 'field_gamification_points', label: 'Points' },
      { name: 'field_gamification_rank', label: 'Rank' },
      { name: 'field_gamification_badges', label: 'Badges' },
    ],
    actions: [
      { name: 'action_gamification_redeem', label: 'Redeem' },
      { name: 'action_gamification_view_details', label: 'View Details' },
    ],
    widgets: [
      { name: 'widget_gamification_leaderboard', label: 'Leaderboard' },
      { name: 'widget_gamification_badges', label: 'Badges' },
      { name: 'widget_gamification_rewards', label: 'Rewards' },
      { name: 'widget_gamification_redemption', label: 'Redemption' },
    ],
  },
  {
    name: 'distributor_master',
    label: 'Distributor Master',
    fields: [
      { name: 'field_dist_name', label: 'Distributor Name' },
      { name: 'field_dist_territory', label: 'Territory' },
      { name: 'field_dist_contact', label: 'Contact' },
      { name: 'field_dist_credit_limit', label: 'Credit Limit' },
      { name: 'field_dist_outstanding', label: 'Outstanding Amount' },
    ],
    actions: [
      { name: 'action_dist_add', label: 'Add Distributor' },
      { name: 'action_dist_edit', label: 'Edit Distributor' },
      { name: 'action_dist_view_ledger', label: 'View Ledger' },
    ],
    widgets: [
      { name: 'widget_dist_list', label: 'Distributor List' },
      { name: 'widget_dist_detail', label: 'Distributor Detail' },
      { name: 'widget_dist_ledger', label: 'Ledger' },
    ],
  },
  {
    name: 'territories',
    label: 'Territories',
    fields: [
      { name: 'field_territory_name', label: 'Territory Name' },
      { name: 'field_territory_region', label: 'Region' },
      { name: 'field_territory_assigned_user', label: 'Assigned User' },
      { name: 'field_territory_pincode_ranges', label: 'Pincode Ranges' },
    ],
    actions: [
      { name: 'action_territory_create', label: 'Create Territory' },
      { name: 'action_territory_edit', label: 'Edit Territory' },
      { name: 'action_territory_assign', label: 'Assign User' },
    ],
    widgets: [
      { name: 'widget_territory_list', label: 'Territory List' },
      { name: 'widget_territory_map', label: 'Territory Map' },
      { name: 'widget_territory_performance', label: 'Performance Summary' },
    ],
  },
  {
    name: 'competition_master',
    label: 'Competition Master',
    fields: [
      { name: 'field_comp_competitor_name', label: 'Competitor Name' },
      { name: 'field_comp_product', label: 'Product' },
      { name: 'field_comp_price', label: 'Price' },
      { name: 'field_comp_market_share', label: 'Market Share' },
    ],
    actions: [
      { name: 'action_comp_add_insight', label: 'Add Insight' },
      { name: 'action_comp_edit_insight', label: 'Edit Insight' },
      { name: 'action_comp_export', label: 'Export' },
    ],
    widgets: [
      { name: 'widget_comp_insights_list', label: 'Insights List' },
      { name: 'widget_comp_comparison_chart', label: 'Comparison Chart' },
    ],
  },
  {
    name: 'check_schemes',
    label: 'Check Schemes',
    fields: [
      { name: 'field_scheme_name', label: 'Scheme Name' },
      { name: 'field_scheme_type', label: 'Scheme Type' },
      { name: 'field_scheme_validity', label: 'Validity' },
      { name: 'field_scheme_discount', label: 'Discount / Benefit' },
    ],
    actions: [
      { name: 'action_scheme_view_details', label: 'View Details' },
      { name: 'action_scheme_apply', label: 'Apply Scheme' },
    ],
    widgets: [
      { name: 'widget_scheme_list', label: 'Scheme List' },
      { name: 'widget_scheme_detail', label: 'Scheme Detail' },
      { name: 'widget_scheme_eligibility', label: 'Eligibility Check' },
    ],
  },
  {
    name: 'packing_list',
    label: 'Packing List',
    fields: [
      { name: 'field_packing_list_number', label: 'Packing List Number' },
      { name: 'field_packing_delivery_date', label: 'Delivery Date' },
      { name: 'field_packing_items', label: 'Items' },
      { name: 'field_packing_status', label: 'Status' },
    ],
    actions: [
      { name: 'action_packing_create', label: 'Create Packing List' },
      { name: 'action_packing_edit', label: 'Edit Packing List' },
      { name: 'action_packing_mark_delivered', label: 'Mark as Delivered' },
    ],
    widgets: [
      { name: 'widget_packing_list', label: 'Packing List' },
      { name: 'widget_packing_detail', label: 'Packing Detail' },
    ],
  },
  {
    name: 'my_deliveries',
    label: 'My Deliveries',
    fields: [
      { name: 'field_delivery_order_number', label: 'Order Number' },
      { name: 'field_delivery_retailer', label: 'Retailer' },
      { name: 'field_delivery_date', label: 'Delivery Date' },
      { name: 'field_delivery_status', label: 'Status' },
      { name: 'field_delivery_amount', label: 'Amount' },
    ],
    actions: [
      { name: 'action_delivery_mark_delivered', label: 'Mark as Delivered' },
      { name: 'action_delivery_collect_payment', label: 'Collect Payment' },
      { name: 'action_delivery_view_details', label: 'View Details' },
    ],
    widgets: [
      { name: 'widget_delivery_list', label: 'Delivery List' },
      { name: 'widget_delivery_detail', label: 'Delivery Detail' },
      { name: 'widget_delivery_payment_collection', label: 'Payment Collection' },
    ],
  },
  {
    name: 'recycle_bin',
    label: 'Recycle Bin',
    fields: [
      { name: 'field_recycle_item_name', label: 'Item Name' },
      { name: 'field_recycle_deleted_at', label: 'Deleted At' },
      { name: 'field_recycle_deleted_by', label: 'Deleted By' },
      { name: 'field_recycle_item_type', label: 'Item Type' },
    ],
    actions: [
      { name: 'action_recycle_restore', label: 'Restore' },
      { name: 'action_recycle_permanent_delete', label: 'Permanently Delete' },
    ],
    widgets: [
      { name: 'widget_recycle_list', label: 'Deleted Items List' },
      { name: 'widget_recycle_filter', label: 'Filter by Type' },
    ],
  },
  {
    name: 'competency',
    label: 'Competency',
    fields: [
      { name: 'field_competency_name', label: 'Competency Name' },
      { name: 'field_competency_score', label: 'Score' },
      { name: 'field_competency_category', label: 'Category' },
      { name: 'field_competency_level', label: 'Level' },
    ],
    actions: [
      { name: 'action_competency_take_quiz', label: 'Take Quiz' },
      { name: 'action_competency_view_content', label: 'View Learning Content' },
      { name: 'action_competency_export', label: 'Export' },
    ],
    widgets: [
      { name: 'widget_competency_overview', label: 'Competency Overview' },
      { name: 'widget_competency_quiz', label: 'Quiz' },
      { name: 'widget_competency_content', label: 'Learning Content' },
      { name: 'widget_competency_badges', label: 'Badges' },
    ],
  },
  {
    name: 'homepage',
    label: 'Homepage',
    fields: [
      { name: 'field_homepage_greeting', label: 'Greeting Text' },
      { name: 'field_homepage_attendance_summary', label: 'Attendance Summary' },
      { name: 'field_homepage_sales_summary', label: 'Sales Summary' },
      { name: 'field_homepage_notifications', label: 'Notifications' },
      { name: 'field_homepage_quick_stats', label: 'Quick Stats' },
      { name: 'field_homepage_beat_plan', label: 'Beat Plan' },
      { name: 'field_homepage_target_progress', label: 'Target Progress' },
    ],
    actions: [
      { name: 'action_homepage_check_in', label: 'Check In' },
      { name: 'action_homepage_check_out', label: 'Check Out' },
      { name: 'action_homepage_end_day', label: 'End My Day' },
      { name: 'action_homepage_refresh', label: 'Refresh Dashboard' },
      { name: 'action_homepage_quick_add', label: 'Quick Add' },
      { name: 'action_homepage_quick_nav', label: 'Quick Navigation' },
    ],
    widgets: [
      { name: 'widget_homepage_attendance', label: 'Attendance Widget' },
      { name: 'widget_homepage_sales_summary', label: 'Sales Summary Widget' },
      { name: 'widget_homepage_visit_plan', label: 'Visit Plan Widget' },
      { name: 'widget_homepage_announcements', label: 'Announcements' },
      { name: 'widget_homepage_quick_links', label: 'Quick Links' },
      { name: 'widget_homepage_performance', label: 'Performance Widget' },
      { name: 'widget_homepage_target_achievement', label: 'Target Achievement Widget' },
      { name: 'widget_homepage_day_status', label: 'Day Status Bar' },
    ],
  },
  {
    name: 'admin_control',
    label: 'Admin Control',
    fields: [
      // Admin Dashboard
      { name: 'field_admin_dashboard_overview', label: 'Admin Dashboard - Overview' },
      { name: 'field_admin_dashboard_stats', label: 'Admin Dashboard - Stats' },
      { name: 'field_admin_dashboard_charts', label: 'Admin Dashboard - Charts' },
      // Price Book Management
      { name: 'field_admin_pricebook_name', label: 'Price Book - Name' },
      { name: 'field_admin_pricebook_price', label: 'Price Book - Price' },
      { name: 'field_admin_pricebook_effective_date', label: 'Price Book - Effective Date' },
      // User Management
      { name: 'field_admin_user_name', label: 'User Mgmt - Name' },
      { name: 'field_admin_user_email', label: 'User Mgmt - Email' },
      { name: 'field_admin_user_phone', label: 'User Mgmt - Phone' },
      { name: 'field_admin_user_role', label: 'User Mgmt - Role' },
      { name: 'field_admin_user_manager', label: 'User Mgmt - Manager' },
      { name: 'field_admin_user_status', label: 'User Mgmt - Status' },
      // Attendance Management
      { name: 'field_admin_attendance_user', label: 'Attendance Mgmt - User' },
      { name: 'field_admin_attendance_date', label: 'Attendance Mgmt - Date' },
      { name: 'field_admin_attendance_status', label: 'Attendance Mgmt - Status' },
      { name: 'field_admin_attendance_hours', label: 'Attendance Mgmt - Hours' },
      // Product Management
      { name: 'field_admin_product_name', label: 'Product Mgmt - Name' },
      { name: 'field_admin_product_sku', label: 'Product Mgmt - SKU' },
      { name: 'field_admin_product_price', label: 'Product Mgmt - Price' },
      { name: 'field_admin_product_category', label: 'Product Mgmt - Category' },
      // Scheme Master
      { name: 'field_admin_scheme_name', label: 'Scheme Master - Name' },
      { name: 'field_admin_scheme_type', label: 'Scheme Master - Type' },
      { name: 'field_admin_scheme_validity', label: 'Scheme Master - Validity' },
      { name: 'field_admin_scheme_discount', label: 'Scheme Master - Discount' },
      // Vendor Management
      { name: 'field_admin_vendor_name', label: 'Vendor Mgmt - Name' },
      { name: 'field_admin_vendor_contact', label: 'Vendor Mgmt - Contact' },
      { name: 'field_admin_vendor_status', label: 'Vendor Mgmt - Status' },
      // Territories & Distributors
      { name: 'field_admin_territory_name', label: 'Territory - Name' },
      { name: 'field_admin_territory_region', label: 'Territory - Region' },
      { name: 'field_admin_territory_distributor', label: 'Territory - Distributor' },
      // Expense Management
      { name: 'field_admin_expense_user', label: 'Expense Mgmt - User' },
      { name: 'field_admin_expense_amount', label: 'Expense Mgmt - Amount' },
      { name: 'field_admin_expense_status', label: 'Expense Mgmt - Status' },
      { name: 'field_admin_expense_category', label: 'Expense Mgmt - Category' },
      // Feedback Management
      { name: 'field_admin_feedback_user', label: 'Feedback Mgmt - User' },
      { name: 'field_admin_feedback_type', label: 'Feedback Mgmt - Type' },
      { name: 'field_admin_feedback_status', label: 'Feedback Mgmt - Status' },
      // Operations
      { name: 'field_admin_operations_user', label: 'Operations - User' },
      { name: 'field_admin_operations_status', label: 'Operations - Status' },
      { name: 'field_admin_operations_location', label: 'Operations - Location' },
      // GPS Track Management
      { name: 'field_admin_gps_user', label: 'GPS Track - User' },
      { name: 'field_admin_gps_date', label: 'GPS Track - Date' },
      { name: 'field_admin_gps_distance', label: 'GPS Track - Distance' },
      // Retail Management
      { name: 'field_admin_retail_name', label: 'Retail Mgmt - Name' },
      { name: 'field_admin_retail_type', label: 'Retail Mgmt - Type' },
      { name: 'field_admin_retail_status', label: 'Retail Mgmt - Status' },
      // Van Sales Management
      { name: 'field_admin_vansales_vehicle', label: 'Van Sales - Vehicle' },
      { name: 'field_admin_vansales_route', label: 'Van Sales - Route' },
      { name: 'field_admin_vansales_stock', label: 'Van Sales - Stock' },
      // Security & Access Control
      { name: 'field_admin_security_profile_name', label: 'Security - Profile Name' },
      { name: 'field_admin_security_role', label: 'Security - Role' },
      { name: 'field_admin_security_permissions', label: 'Security - Permissions' },
      // Feature Management
      { name: 'field_admin_feature_name', label: 'Feature Mgmt - Name' },
      { name: 'field_admin_feature_status', label: 'Feature Mgmt - Status' },
      // Gamification
      { name: 'field_admin_gamification_config', label: 'Gamification - Config' },
      { name: 'field_admin_gamification_rewards', label: 'Gamification - Rewards' },
      // Retailer Loyalty
      { name: 'field_admin_loyalty_program', label: 'Retailer Loyalty - Program' },
      { name: 'field_admin_loyalty_points', label: 'Retailer Loyalty - Points' },
      // Company Profile
      { name: 'field_admin_company_name', label: 'Company Profile - Name' },
      { name: 'field_admin_company_logo', label: 'Company Profile - Logo' },
      { name: 'field_admin_company_details', label: 'Company Profile - Details' },
      // Invoice Management
      { name: 'field_admin_invoice_number', label: 'Invoice Mgmt - Number' },
      { name: 'field_admin_invoice_template', label: 'Invoice Mgmt - Template' },
      { name: 'field_admin_invoice_config', label: 'Invoice Mgmt - Config' },
      // Credit Management
      { name: 'field_admin_credit_limit', label: 'Credit Mgmt - Limit' },
      { name: 'field_admin_credit_status', label: 'Credit Mgmt - Status' },
      // Notification Setup
      { name: 'field_admin_notification_title', label: 'Notification - Title' },
      { name: 'field_admin_notification_schedule', label: 'Notification - Schedule' },
      { name: 'field_admin_notification_target', label: 'Notification - Target' },
      // Recycle Bin Master
      { name: 'field_admin_recycle_item', label: 'Recycle Bin - Item' },
      { name: 'field_admin_recycle_deleted_at', label: 'Recycle Bin - Deleted At' },
      // Distributor Portal Admin
      { name: 'field_admin_distportal_distributor', label: 'Dist Portal - Distributor' },
      { name: 'field_admin_distportal_orders', label: 'Dist Portal - Orders' },
      // Target Management
      { name: 'field_admin_target_name', label: 'Target Mgmt - Name' },
      { name: 'field_admin_target_value', label: 'Target Mgmt - Value' },
      { name: 'field_admin_target_period', label: 'Target Mgmt - Period' },
      // Pincode Master
      { name: 'field_admin_pincode_code', label: 'Pincode Master - Code' },
      { name: 'field_admin_pincode_area', label: 'Pincode Master - Area' },
      { name: 'field_admin_pincode_district', label: 'Pincode Master - District' },
      { name: 'field_admin_pincode_state', label: 'Pincode Master - State' },
      // Retailer External Database
      { name: 'field_admin_retailer_ext_state', label: 'Retailer Ext DB - State' },
      { name: 'field_admin_retailer_ext_city', label: 'Retailer Ext DB - City' },
      { name: 'field_admin_retailer_ext_company', label: 'Retailer Ext DB - Company' },
      { name: 'field_admin_retailer_ext_category', label: 'Retailer Ext DB - Category' },
      // Tax Master
      { name: 'field_admin_tax_name', label: 'Tax Master - Name' },
      { name: 'field_admin_tax_rate', label: 'Tax Master - Rate' },
      { name: 'field_admin_tax_type', label: 'Tax Master - Type' },
    ],
    actions: [
      // Admin Dashboard
      { name: 'action_admin_dashboard_view', label: 'Admin Dashboard - View' },
      { name: 'action_admin_dashboard_export', label: 'Admin Dashboard - Export' },
      // Price Book Management
      { name: 'action_admin_pricebook_create', label: 'Price Book - Create' },
      { name: 'action_admin_pricebook_edit', label: 'Price Book - Edit' },
      { name: 'action_admin_pricebook_delete', label: 'Price Book - Delete' },
      { name: 'action_admin_pricebook_export', label: 'Price Book - Export' },
      // User Management
      { name: 'action_admin_user_create', label: 'User Mgmt - Create' },
      { name: 'action_admin_user_edit', label: 'User Mgmt - Edit' },
      { name: 'action_admin_user_delete', label: 'User Mgmt - Delete' },
      { name: 'action_admin_user_reset_password', label: 'User Mgmt - Reset Password' },
      { name: 'action_admin_user_login_as', label: 'User Mgmt - Login As' },
      // Attendance Management
      { name: 'action_admin_attendance_approve', label: 'Attendance Mgmt - Approve' },
      { name: 'action_admin_attendance_reject', label: 'Attendance Mgmt - Reject' },
      { name: 'action_admin_attendance_export', label: 'Attendance Mgmt - Export' },
      // Product Management
      { name: 'action_admin_product_create', label: 'Product Mgmt - Create' },
      { name: 'action_admin_product_edit', label: 'Product Mgmt - Edit' },
      { name: 'action_admin_product_delete', label: 'Product Mgmt - Delete' },
      { name: 'action_admin_product_import', label: 'Product Mgmt - Import' },
      // Scheme Master
      { name: 'action_admin_scheme_create', label: 'Scheme Master - Create' },
      { name: 'action_admin_scheme_edit', label: 'Scheme Master - Edit' },
      { name: 'action_admin_scheme_delete', label: 'Scheme Master - Delete' },
      { name: 'action_admin_scheme_activate', label: 'Scheme Master - Activate' },
      // Vendor Management
      { name: 'action_admin_vendor_add', label: 'Vendor Mgmt - Add' },
      { name: 'action_admin_vendor_edit', label: 'Vendor Mgmt - Edit' },
      { name: 'action_admin_vendor_approve', label: 'Vendor Mgmt - Approve' },
      // Territories & Distributors
      { name: 'action_admin_territory_create', label: 'Territory - Create' },
      { name: 'action_admin_territory_edit', label: 'Territory - Edit' },
      { name: 'action_admin_territory_assign', label: 'Territory - Assign' },
      // Expense Management
      { name: 'action_admin_expense_approve', label: 'Expense Mgmt - Approve' },
      { name: 'action_admin_expense_reject', label: 'Expense Mgmt - Reject' },
      { name: 'action_admin_expense_export', label: 'Expense Mgmt - Export' },
      // Feedback Management
      { name: 'action_admin_feedback_view', label: 'Feedback Mgmt - View' },
      { name: 'action_admin_feedback_respond', label: 'Feedback Mgmt - Respond' },
      { name: 'action_admin_feedback_export', label: 'Feedback Mgmt - Export' },
      // Operations
      { name: 'action_admin_operations_view', label: 'Operations - View' },
      { name: 'action_admin_operations_export', label: 'Operations - Export' },
      { name: 'action_admin_operations_filter', label: 'Operations - Filter' },
      // GPS Track Management
      { name: 'action_admin_gps_track', label: 'GPS Track - Track' },
      { name: 'action_admin_gps_export', label: 'GPS Track - Export' },
      { name: 'action_admin_gps_playback', label: 'GPS Track - Playback' },
      // Retail Management
      { name: 'action_admin_retail_verify', label: 'Retail Mgmt - Verify' },
      { name: 'action_admin_retail_edit', label: 'Retail Mgmt - Edit' },
      { name: 'action_admin_retail_delete', label: 'Retail Mgmt - Delete' },
      // Van Sales Management
      { name: 'action_admin_vansales_create', label: 'Van Sales - Create' },
      { name: 'action_admin_vansales_edit', label: 'Van Sales - Edit' },
      { name: 'action_admin_vansales_assign', label: 'Van Sales - Assign' },
      // Security & Access Control
      { name: 'action_admin_security_create_profile', label: 'Security - Create Profile' },
      { name: 'action_admin_security_edit_profile', label: 'Security - Edit Profile' },
      { name: 'action_admin_security_assign_role', label: 'Security - Assign Role' },
      // Feature Management
      { name: 'action_admin_feature_toggle', label: 'Feature Mgmt - Toggle' },
      { name: 'action_admin_feature_configure', label: 'Feature Mgmt - Configure' },
      // Gamification
      { name: 'action_admin_gamification_configure', label: 'Gamification - Configure' },
      { name: 'action_admin_gamification_manage', label: 'Gamification - Manage' },
      { name: 'action_admin_gamification_redeem', label: 'Gamification - Redeem' },
      // Retailer Loyalty
      { name: 'action_admin_loyalty_configure', label: 'Retailer Loyalty - Configure' },
      { name: 'action_admin_loyalty_manage', label: 'Retailer Loyalty - Manage' },
      // Company Profile
      { name: 'action_admin_company_edit', label: 'Company Profile - Edit' },
      { name: 'action_admin_company_upload', label: 'Company Profile - Upload' },
      // Invoice Management
      { name: 'action_admin_invoice_create', label: 'Invoice Mgmt - Create' },
      { name: 'action_admin_invoice_edit', label: 'Invoice Mgmt - Edit' },
      { name: 'action_admin_invoice_configure', label: 'Invoice Mgmt - Configure' },
      // Credit Management
      { name: 'action_admin_credit_configure', label: 'Credit Mgmt - Configure' },
      { name: 'action_admin_credit_approve', label: 'Credit Mgmt - Approve' },
      // Notification Setup
      { name: 'action_admin_notification_create', label: 'Notification - Create' },
      { name: 'action_admin_notification_edit', label: 'Notification - Edit' },
      { name: 'action_admin_notification_schedule', label: 'Notification - Schedule' },
      // Recycle Bin Master
      { name: 'action_admin_recycle_restore', label: 'Recycle Bin - Restore' },
      { name: 'action_admin_recycle_permanent_delete', label: 'Recycle Bin - Permanent Delete' },
      // Distributor Portal Admin
      { name: 'action_admin_distportal_manage', label: 'Dist Portal - Manage' },
      { name: 'action_admin_distportal_approve', label: 'Dist Portal - Approve' },
      // Target Management
      { name: 'action_admin_target_create', label: 'Target Mgmt - Create' },
      { name: 'action_admin_target_assign', label: 'Target Mgmt - Assign' },
      { name: 'action_admin_target_cascade', label: 'Target Mgmt - Cascade' },
      // Pincode Master
      { name: 'action_admin_pincode_import', label: 'Pincode Master - Import' },
      { name: 'action_admin_pincode_edit', label: 'Pincode Master - Edit' },
      // Retailer External Database
      { name: 'action_admin_retailer_ext_search', label: 'Retailer Ext DB - Search' },
      { name: 'action_admin_retailer_ext_export', label: 'Retailer Ext DB - Export' },
      // Tax Master
      { name: 'action_admin_tax_create', label: 'Tax Master - Create' },
      { name: 'action_admin_tax_edit', label: 'Tax Master - Edit' },
      { name: 'action_admin_tax_map', label: 'Tax Master - Map' },
    ],
    widgets: [
      // Admin Dashboard
      { name: 'widget_admin_dashboard_dashboard', label: 'Admin Dashboard - Dashboard' },
      { name: 'widget_admin_dashboard_stats', label: 'Admin Dashboard - Stats' },
      { name: 'widget_admin_dashboard_charts', label: 'Admin Dashboard - Charts' },
      // Price Book Management
      { name: 'widget_admin_pricebook_list', label: 'Price Book - List' },
      { name: 'widget_admin_pricebook_detail', label: 'Price Book - Detail' },
      // User Management
      { name: 'widget_admin_user_list', label: 'User Mgmt - List' },
      { name: 'widget_admin_user_detail', label: 'User Mgmt - Detail' },
      { name: 'widget_admin_user_hierarchy', label: 'User Mgmt - Hierarchy' },
      // Attendance Management
      { name: 'widget_admin_attendance_list', label: 'Attendance Mgmt - List' },
      { name: 'widget_admin_attendance_summary', label: 'Attendance Mgmt - Summary' },
      { name: 'widget_admin_attendance_holidays', label: 'Attendance Mgmt - Holidays' },
      // Product Management
      { name: 'widget_admin_product_list', label: 'Product Mgmt - List' },
      { name: 'widget_admin_product_detail', label: 'Product Mgmt - Detail' },
      { name: 'widget_admin_product_categories', label: 'Product Mgmt - Categories' },
      // Scheme Master
      { name: 'widget_admin_scheme_list', label: 'Scheme Master - List' },
      { name: 'widget_admin_scheme_detail', label: 'Scheme Master - Detail' },
      { name: 'widget_admin_scheme_eligibility', label: 'Scheme Master - Eligibility' },
      // Vendor Management
      { name: 'widget_admin_vendor_list', label: 'Vendor Mgmt - List' },
      { name: 'widget_admin_vendor_detail', label: 'Vendor Mgmt - Detail' },
      // Territories & Distributors
      { name: 'widget_admin_territory_list', label: 'Territory - List' },
      { name: 'widget_admin_territory_map', label: 'Territory - Map' },
      { name: 'widget_admin_territory_distributors', label: 'Territory - Distributors' },
      // Expense Management
      { name: 'widget_admin_expense_list', label: 'Expense Mgmt - List' },
      { name: 'widget_admin_expense_summary', label: 'Expense Mgmt - Summary' },
      { name: 'widget_admin_expense_claims', label: 'Expense Mgmt - Claims' },
      // Feedback Management
      { name: 'widget_admin_feedback_list', label: 'Feedback Mgmt - List' },
      { name: 'widget_admin_feedback_detail', label: 'Feedback Mgmt - Detail' },
      // Operations
      { name: 'widget_admin_operations_dashboard', label: 'Operations - Dashboard' },
      { name: 'widget_admin_operations_live_tracking', label: 'Operations - Live Tracking' },
      // GPS Track Management
      { name: 'widget_admin_gps_map', label: 'GPS Track - Map' },
      { name: 'widget_admin_gps_timeline', label: 'GPS Track - Timeline' },
      // Retail Management
      { name: 'widget_admin_retail_list', label: 'Retail Mgmt - List' },
      { name: 'widget_admin_retail_detail', label: 'Retail Mgmt - Detail' },
      // Van Sales Management
      { name: 'widget_admin_vansales_list', label: 'Van Sales - List' },
      { name: 'widget_admin_vansales_detail', label: 'Van Sales - Detail' },
      // Security & Access Control
      { name: 'widget_admin_security_profiles', label: 'Security - Profiles' },
      { name: 'widget_admin_security_permissions', label: 'Security - Permissions' },
      { name: 'widget_admin_security_groups', label: 'Security - Groups' },
      // Feature Management
      { name: 'widget_admin_feature_list', label: 'Feature Mgmt - List' },
      { name: 'widget_admin_feature_detail', label: 'Feature Mgmt - Detail' },
      // Gamification
      { name: 'widget_admin_gamification_dashboard', label: 'Gamification - Dashboard' },
      { name: 'widget_admin_gamification_settings', label: 'Gamification - Settings' },
      // Retailer Loyalty
      { name: 'widget_admin_loyalty_dashboard', label: 'Retailer Loyalty - Dashboard' },
      { name: 'widget_admin_loyalty_settings', label: 'Retailer Loyalty - Settings' },
      // Company Profile
      { name: 'widget_admin_company_detail', label: 'Company Profile - Detail' },
      { name: 'widget_admin_company_branding', label: 'Company Profile - Branding' },
      // Invoice Management
      { name: 'widget_admin_invoice_list', label: 'Invoice Mgmt - List' },
      { name: 'widget_admin_invoice_templates', label: 'Invoice Mgmt - Templates' },
      // Credit Management
      { name: 'widget_admin_credit_list', label: 'Credit Mgmt - List' },
      { name: 'widget_admin_credit_settings', label: 'Credit Mgmt - Settings' },
      // Recycle Bin Master
      { name: 'widget_admin_recycle_list', label: 'Recycle Bin - List' },
      { name: 'widget_admin_recycle_logs', label: 'Recycle Bin - Logs' },
      // Distributor Portal Admin
      { name: 'widget_admin_distportal_dashboard', label: 'Dist Portal - Dashboard' },
      { name: 'widget_admin_distportal_orders', label: 'Dist Portal - Orders' },
      // Target Management
      { name: 'widget_admin_target_list', label: 'Target Mgmt - List' },
      { name: 'widget_admin_target_detail', label: 'Target Mgmt - Detail' },
      { name: 'widget_admin_target_tracking', label: 'Target Mgmt - Tracking' },
      // Pincode Master
      { name: 'widget_admin_pincode_list', label: 'Pincode Master - List' },
      { name: 'widget_admin_pincode_search', label: 'Pincode Master - Search' },
      // Retailer External Database
      { name: 'widget_admin_retailer_ext_list', label: 'Retailer Ext DB - List' },
      { name: 'widget_admin_retailer_ext_detail', label: 'Retailer Ext DB - Detail' },
      // Tax Master
      { name: 'widget_admin_tax_list', label: 'Tax Master - List' },
      { name: 'widget_admin_tax_detail', label: 'Tax Master - Detail' },
    ],
  },
];

// Get all module names (for module-level permissions)
export const getAllModuleNames = (): string[] =>
  HIERARCHICAL_MODULES.map(m => `module_${m.name}`);

// Get all field names across all modules
export const getAllFieldNames = (): string[] =>
  HIERARCHICAL_MODULES.flatMap(m => m.fields.map(f => f.name));

// Get all action names across all modules
export const getAllActionNames = (): string[] =>
  HIERARCHICAL_MODULES.flatMap(m => m.actions.map(a => a.name));

// Get all widget names across all modules
export const getAllWidgetNames = (): string[] =>
  HIERARCHICAL_MODULES.flatMap(m => m.widgets.map(w => w.name));

// Get the parent module name for a given item name
export const getParentModule = (itemName: string): string | undefined => {
  for (const mod of HIERARCHICAL_MODULES) {
    const allItems = [
      ...mod.fields.map(f => f.name),
      ...mod.actions.map(a => a.name),
      ...mod.widgets.map(w => w.name),
      `module_${mod.name}`,
    ];
    if (allItems.includes(itemName)) return mod.name;
  }
  return undefined;
};

// Get permission_type for a given item name
export const getPermissionType = (itemName: string): 'module' | 'field' | 'action' | 'widget' => {
  if (itemName.startsWith('module_')) return 'module';
  if (itemName.startsWith('field_')) return 'field';
  if (itemName.startsWith('action_')) return 'action';
  if (itemName.startsWith('widget_')) return 'widget';
  return 'module';
};
