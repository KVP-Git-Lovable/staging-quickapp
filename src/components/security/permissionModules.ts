// Shared Module → Feature → Sub-feature structure for permissions

export interface SubFeature {
  name: string;
  label: string;
}

export interface Feature {
  name: string;
  label: string;
  subFeatures?: SubFeature[];
}

export interface PermissionModule {
  name: string;
  label: string;
  features: Feature[];
}

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    name: 'admin_panel',
    label: 'Admin Panel',
    features: [
      {
        name: 'admin_dashboard',
        label: 'Admin Dashboard',
        subFeatures: [
          { name: 'admin_dashboard_overview', label: 'Dashboard Overview' },
          { name: 'admin_user_list', label: 'User List' },
          { name: 'admin_user_create', label: 'Create User' },
          { name: 'admin_user_edit', label: 'Edit User' },
          { name: 'admin_user_delete', label: 'Delete User' },
          { name: 'admin_user_activate_deactivate', label: 'Activate / Deactivate User' },
          { name: 'admin_user_reset_password', label: 'Reset User Password' },
          { name: 'admin_user_hierarchy', label: 'User Hierarchy Management' },
          { name: 'admin_approver_management', label: 'Approver Management' },
          { name: 'admin_security_roles_display', label: 'Security Roles Display' },
        ]
      },
      {
        name: 'admin_price_book',
        label: 'Price Book Management',
        subFeatures: [
          { name: 'admin_price_book_list', label: 'Price Book List' },
          { name: 'admin_price_book_create', label: 'Create Price Book' },
          { name: 'admin_price_book_edit', label: 'Edit Price Book' },
          { name: 'admin_price_book_delete', label: 'Delete Price Book' },
          { name: 'admin_price_book_assignment', label: 'Price Book Assignment' },
        ]
      },
      {
        name: 'admin_attendance_mgmt',
        label: 'Attendance Management',
        subFeatures: [
          { name: 'admin_attendance_live_monitoring', label: 'Live Attendance Monitoring' },
          { name: 'admin_attendance_leave_approvals', label: 'Leave Approvals' },
          { name: 'admin_attendance_regularization_approvals', label: 'Regularization Approvals' },
          { name: 'admin_attendance_holiday_management', label: 'Holiday Management' },
          { name: 'admin_attendance_leave_balances', label: 'Leave Balances Manager' },
          { name: 'admin_attendance_policy_config', label: 'Attendance Policy Configuration' },
          { name: 'admin_attendance_working_days', label: 'Working Days Configuration' },
        ]
      },
      {
        name: 'admin_product_mgmt',
        label: 'Product Management',
        subFeatures: [
          { name: 'admin_product_list', label: 'Product List' },
          { name: 'admin_product_create', label: 'Create Product' },
          { name: 'admin_product_edit', label: 'Edit Product' },
          { name: 'admin_product_delete', label: 'Delete Product' },
          { name: 'admin_product_categories', label: 'Product Categories' },
          { name: 'admin_product_bulk_import', label: 'Product Bulk Import' },
          { name: 'product_availability_settings', label: 'Product Availability Rules (manage)' },
        ]
      },
      {
        name: 'admin_scheme_master',
        label: 'Scheme Master',
        subFeatures: [
          { name: 'admin_scheme_list', label: 'Scheme List' },
          { name: 'admin_scheme_create', label: 'Create Scheme' },
          { name: 'admin_scheme_edit', label: 'Edit Scheme' },
          { name: 'admin_scheme_delete', label: 'Delete Scheme' },
          { name: 'admin_scheme_applicability', label: 'Scheme Applicability' },
          { name: 'admin_scheme_policy_config', label: 'Scheme Policy Configuration' },
        ]
      },
      {
        name: 'admin_vendor_mgmt',
        label: 'Vendor Management',
        subFeatures: [
          { name: 'admin_vendor_list', label: 'Vendor List' },
          { name: 'admin_vendor_create', label: 'Create Vendor' },
          { name: 'admin_vendor_edit', label: 'Edit Vendor' },
          { name: 'admin_vendor_approvals', label: 'Vendor Approvals' },
        ]
      },
      {
        name: 'admin_territories_distributors',
        label: 'Territories & Distributors',
        subFeatures: [
          { name: 'admin_territory_management', label: 'Territory Management' },
          { name: 'admin_distributor_assignment', label: 'Distributor Assignment' },
          { name: 'admin_region_management', label: 'Region Management' },
        ]
      },
      {
        name: 'admin_expense_mgmt',
        label: 'Expense Management',
        subFeatures: [
          { name: 'admin_expense_claims_list', label: 'Expense Claims List' },
          { name: 'admin_expense_approvals', label: 'Expense Approvals' },
          { name: 'admin_expense_analytics', label: 'Expense Analytics' },
          { name: 'admin_expense_policy_config', label: 'Expense Policy Configuration' },
        ]
      },
      {
        name: 'admin_feedback_mgmt',
        label: 'Feedback Management',
        subFeatures: [
          { name: 'admin_feedback_list', label: 'Feedback List' },
          { name: 'admin_competition_insights', label: 'Competition Insights' },
          { name: 'admin_branding_requests', label: 'Branding Requests' },
        ]
      },
      {
        name: 'admin_operations',
        label: 'Operations',
        subFeatures: [
          { name: 'admin_operations_dashboard', label: 'Operations Dashboard' },
          { name: 'admin_checkin_monitoring', label: 'Check-in Monitoring' },
          { name: 'admin_order_monitoring', label: 'Order Monitoring' },
          { name: 'admin_stock_monitoring', label: 'Stock Data Monitoring' },
        ]
      },
      {
        name: 'admin_gps_track_mgmt',
        label: 'GPS Track Management',
        subFeatures: [
          { name: 'admin_gps_live_location', label: 'Live Location Monitoring' },
          { name: 'admin_gps_journey_playback', label: 'Journey Playback' },
          { name: 'admin_gps_team_tracking', label: 'Team Tracking' },
        ]
      },
      {
        name: 'admin_retail_mgmt',
        label: 'Retail Management',
        subFeatures: [
          { name: 'admin_retailer_list', label: 'Retailer List' },
          { name: 'admin_retailer_verification', label: 'Retailer Verification' },
          { name: 'admin_retailer_photo_update', label: 'Retailer Photo Update' },
          { name: 'admin_retailer_territory_assignment', label: 'Territory Assignment' },
        ]
      },
      {
        name: 'admin_van_sales',
        label: 'Van Sales Management',
        subFeatures: [
          { name: 'admin_van_list', label: 'Van List' },
          { name: 'admin_van_create', label: 'Create Van' },
          { name: 'admin_van_edit', label: 'Edit Van' },
          { name: 'admin_van_driver_assignment', label: 'Driver Assignment' },
          { name: 'admin_van_stock_view', label: 'Van Stock View' },
          { name: 'admin_van_opening_grn_edits', label: 'Opening GRN Edits' },
        ]
      },
      {
        name: 'admin_security_access',
        label: 'Security & Access',
        subFeatures: [
          { name: 'admin_security_profiles', label: 'Security Profiles' },
          { name: 'admin_profile_permissions', label: 'Profile Permissions' },
          { name: 'admin_user_specific_permissions', label: 'User-Specific Permissions' },
        ]
      },
      {
        name: 'admin_feature_mgmt',
        label: 'Feature Management',
        subFeatures: [
          { name: 'admin_feature_flags', label: 'Feature Flags Management' },
          { name: 'admin_feature_toggle', label: 'Toggle Feature Status' },
        ]
      },
      {
        name: 'admin_gamification',
        label: 'Gamification',
        subFeatures: [
          { name: 'admin_gamification_config', label: 'Gamification Configuration' },
          { name: 'admin_badges_management', label: 'Badges Management' },
          { name: 'admin_rewards_management', label: 'Rewards Management' },
          { name: 'admin_redemption_management', label: 'Redemption Management' },
        ]
      },
      {
        name: 'admin_retailer_loyalty',
        label: 'Retailer Loyalty',
        subFeatures: [
          { name: 'admin_loyalty_programs', label: 'Loyalty Programs' },
          { name: 'admin_loyalty_points', label: 'Points Management' },
          { name: 'admin_loyalty_redemptions', label: 'Loyalty Redemptions' },
        ]
      },
      {
        name: 'admin_company_profile',
        label: 'Company Profile',
        subFeatures: [
          { name: 'admin_company_details', label: 'Company Details' },
          { name: 'admin_bank_information', label: 'Bank Information' },
          { name: 'admin_header_branding', label: 'Header Branding' },
        ]
      },
      {
        name: 'admin_invoice_mgmt',
        label: 'Invoice Management',
        subFeatures: [
          { name: 'admin_invoice_list', label: 'Invoice List' },
          { name: 'admin_invoice_create', label: 'Create Invoice' },
          { name: 'admin_invoice_templates', label: 'Invoice Templates' },
        ]
      },
      {
        name: 'admin_credit_mgmt',
        label: 'Credit Management',
        subFeatures: [
          { name: 'admin_credit_scoring_config', label: 'Credit Scoring Configuration' },
          { name: 'admin_credit_limits', label: 'Credit Limits Management' },
          { name: 'credit_note_settings', label: 'Credit Note Settings (approval config)' },
        ]
      },
      {
        name: 'admin_activity_master',
        label: 'Activity Type Master',
        subFeatures: [
          { name: 'activity_type_settings', label: 'Activity Type Master (config)' },
          { name: 'activity_attachments', label: 'Activity Attachments' },
          { name: 'action_activity_create', label: 'Log / configure activity' },
          { name: 'activity_team_view', label: 'View team activities (read = my team, view-all = everyone)' },
          { name: 'action_activity_assign', label: 'Assign activities to team' },
        ]
      },
      {
        name: 'admin_recycle_bin',
        label: 'Recycle Bin',
        subFeatures: [
          { name: 'admin_recycle_bin_settings', label: 'Recycle Bin Settings' },
          { name: 'admin_permanent_deletion_logs', label: 'Permanent Deletion Logs' },
          { name: 'admin_restore_deleted_items', label: 'Restore Deleted Items' },
        ]
      },
      {
        name: 'admin_distributor_portal',
        label: 'Distributor Portal Admin',
        subFeatures: [
          { name: 'admin_portal_users', label: 'Portal Users Management' },
          { name: 'admin_portal_orders', label: 'Portal Orders' },
          { name: 'admin_portal_inventory', label: 'Portal Inventory' },
          { name: 'admin_portal_claims', label: 'Portal Claims' },
          { name: 'admin_portal_support', label: 'Portal Support Requests' },
          { name: 'admin_portal_ideas', label: 'Portal Ideas' },
        ]
      },
      {
        name: 'admin_target_vs_actual',
        label: 'Target vs Actual',
        subFeatures: [
          { name: 'admin_target_setting', label: 'Target Setting' },
          { name: 'admin_target_tracking', label: 'Target vs Actual Tracking' },
        ]
      },
      {
        name: 'admin_hierarchy_targets',
        label: 'Hierarchy Targets',
        subFeatures: [
          { name: 'admin_hierarchy_target_setup', label: 'Hierarchy Target Setup' },
          { name: 'admin_target_cascade', label: 'Target Cascade Down' },
          { name: 'admin_allocation_methods', label: 'Allocation Methods' },
        ]
      },
    ]
  },
  {
    name: 'attendance',
    label: 'Attendance',
    features: [
      { name: 'attendance_check_in_out', label: 'Check-in / Check-out' },
      { name: 'attendance_face_verification', label: 'Face Verification' },
      { name: 'attendance_leave_applications', label: 'Leave Applications' },
      { name: 'attendance_regularization_requests', label: 'Regularization Requests' },
      { name: 'attendance_holiday_list', label: 'Holiday List' },
      { name: 'attendance_timeline_view', label: 'Timeline View' },
      { name: 'attendance_journey_map', label: 'Journey Map' },
      { name: 'attendance_statistics', label: 'Attendance Statistics' },
      { name: 'attendance_photo_capture', label: 'Photo Capture' },
    ]
  },
  {
    name: 'my_visit',
    label: 'My Visit',
    features: [
      {
        name: 'visit_auto_plan',
        label: 'Auto Plan',
        subFeatures: [
          { name: 'visit_auto_plan_view', label: 'View Auto Plan' },
          { name: 'visit_auto_plan_generate', label: 'Generate Auto Plan' },
          { name: 'visit_auto_plan_edit', label: 'Edit Auto Plan' },
        ]
      },
      {
        name: 'visit_all_beat',
        label: 'All Beat',
        subFeatures: [
          { name: 'visit_all_beat_view', label: 'View All Beats' },
          { name: 'visit_all_beat_select', label: 'Select Beat' },
          { name: 'visit_all_beat_retailers', label: 'Beat Retailers' },
        ]
      },
      {
        name: 'visit_retailers',
        label: 'Retailers',
        subFeatures: [
          { name: 'visit_retailer_list', label: 'Retailer List' },
          { name: 'visit_retailer_check_in', label: 'Check-in Verification' },
          { name: 'visit_retailer_order_entry', label: 'Order Entry' },
          { name: 'visit_retailer_no_order', label: 'No-Order Reasons' },
          { name: 'visit_retailer_create_visit', label: 'Create Visit' },
        ]
      },
      {
        name: 'visit_summary',
        label: 'Summary',
        subFeatures: [
          { name: 'visit_summary_view', label: 'View Summary' },
          { name: 'visit_summary_export', label: 'Export Summary' },
          { name: 'visit_summary_insights', label: 'Summary Insights' },
        ]
      },
      {
        name: 'visit_timeline',
        label: 'Timeline',
        subFeatures: [
          { name: 'visit_timeline_view', label: 'View Timeline' },
          { name: 'visit_timeline_details', label: 'Timeline Details' },
        ]
      },
      {
        name: 'visit_gps_track',
        label: 'GPS Track',
        subFeatures: [
          { name: 'visit_gps_track_view', label: 'View GPS Track' },
          { name: 'visit_gps_track_playback', label: 'Journey Playback' },
        ]
      },
      {
        name: 'visit_van_stock',
        label: 'Van Stock',
        subFeatures: [
          { name: 'visit_van_stock_view', label: 'View Van Stock' },
          { name: 'visit_van_stock_manage', label: 'Manage Van Stock' },
        ]
      },
      {
        name: 'visit_activity',
        label: 'Activity',
        subFeatures: [
          { name: 'visit_activity_view', label: 'View Activity' },
          { name: 'visit_activity_log', label: 'Activity Log' },
          { name: 'visit_activity_sync', label: 'Sync Activity' },
        ]
      },
      {
        name: 'visit_todays_progress',
        label: "Today's Progress",
        subFeatures: [
          { name: 'visit_todays_progress_view', label: "View Today's Progress" },
        ]
      },
      { name: 'visit_points_gamification', label: 'Points / Gamification' },
      { name: 'visit_ai_recommendations', label: 'AI Recommendations' },
    ]
  },
  {
    name: 'all_retailers',
    label: 'All Retailers',
    features: [
      { name: 'retailer_list', label: 'Retailer List' },
      { name: 'retailer_add', label: 'Add Retailer' },
      { name: 'retailer_detail', label: 'Retailer Detail' },
      { name: 'retailer_category_filter', label: 'Category Filter' },
      { name: 'retailer_beat_assignment', label: 'Beat Assignment' },
      { name: 'retailer_credit_score', label: 'Credit Score' },
      { name: 'retailer_order_history', label: 'Order History' },
      { name: 'retailer_analytics', label: 'Retailer Analytics' },
      { name: 'retailer_bulk_import', label: 'Bulk Import' },
      { name: 'retailer_location_map', label: 'Location Map' },
    ]
  },
  {
    name: 'my_target',
    label: 'My Target',
    features: [
      { name: 'target_overview', label: 'Target Overview' },
      { name: 'target_period_selection', label: 'Period Selection' },
      { name: 'target_achievement_percentage', label: 'Achievement Percentage' },
      { name: 'target_territory_performance', label: 'Territory Performance' },
      { name: 'target_beat_performance', label: 'Beat Performance' },
      { name: 'target_retailer_performance', label: 'Retailer Performance' },
      { name: 'target_ai_recommendations', label: 'AI Recommendations' },
      { name: 'target_shortfall_analysis', label: 'Shortfall Analysis' },
    ]
  },
  {
    name: 'performance',
    label: 'Performance',
    features: [
      { name: 'performance_overall', label: 'Overall Performance' },
      { name: 'performance_territory_breakdown', label: 'Territory Breakdown' },
      { name: 'performance_beat_breakdown', label: 'Beat Breakdown' },
      { name: 'performance_retailer_breakdown', label: 'Retailer Breakdown' },
      { name: 'performance_period_comparison', label: 'Period Comparison' },
      { name: 'performance_trend_analysis', label: 'Trend Analysis' },
      { name: 'performance_leaderboard', label: 'Leaderboard' },
    ]
  },
  {
    name: 'analytics',
    label: 'Analytics',
    features: [
      { name: 'analytics_business_summary', label: 'Business Summary' },
      { name: 'analytics_beat_details', label: 'Beat Details' },
      { name: 'analytics_retailer_details', label: 'Retailer Details' },
      { name: 'analytics_order_details', label: 'Order Details' },
      { name: 'analytics_product_breakdown', label: 'Product Breakdown' },
      { name: 'analytics_pending_payments', label: 'Pending Payments' },
      { name: 'analytics_user_filter', label: 'User Filter' },
      { name: 'analytics_date_range_picker', label: 'Date Range Picker' },
      { name: 'analytics_performance_calendar', label: 'Performance Calendar' },
      { name: 'analytics_leaderboard', label: 'Leaderboard' },
      { name: 'analytics_field_activity', label: 'Analytics — Field Activity' },
    ]
  },
  {
    name: 'institutional_sales',
    label: 'Institutional Sales',
    features: [
      { name: 'institutional_dashboard', label: 'Dashboard' },
      { name: 'institutional_leads', label: 'Leads' },
      { name: 'institutional_accounts', label: 'Accounts' },
      { name: 'institutional_contacts', label: 'Contacts' },
      { name: 'institutional_opportunities', label: 'Opportunities' },
      { name: 'institutional_quotes', label: 'Quotes' },
      { name: 'institutional_order_commitments', label: 'Order Commitments' },
      { name: 'institutional_invoices', label: 'Invoices' },
      { name: 'institutional_price_books', label: 'Price Books' },
      { name: 'institutional_collections', label: 'Collections' },
      { name: 'institutional_products', label: 'Products' },
    ]
  },
  {
    name: 'distributor_master',
    label: 'Distributor Master',
    features: [
      { name: 'distributor_list', label: 'Distributor List' },
      { name: 'distributor_add', label: 'Add Distributor' },
      { name: 'distributor_detail', label: 'Distributor Detail' },
      { name: 'distributor_edit', label: 'Edit Distributor' },
      { name: 'distributor_partnership_status', label: 'Partnership Status' },
      { name: 'distributor_fleet_size', label: 'Fleet Size' },
      { name: 'distributor_coverage_area', label: 'Coverage Area' },
      { name: 'distributor_retailer_mapping', label: 'Retailer Mapping' },
    ]
  },
  {
    name: 'primary_orders',
    label: 'Primary Orders',
    features: [
      { name: 'primary_order_list', label: 'Order List' },
      { name: 'primary_order_status', label: 'Order Status' },
      { name: 'primary_order_create', label: 'Create Order' },
      { name: 'primary_order_details', label: 'Order Details' },
      { name: 'primary_order_transporter_info', label: 'Transporter Info' },
      { name: 'primary_order_dispatch_date', label: 'Dispatch Date' },
      { name: 'primary_order_inventory_sync', label: 'Inventory Sync' },
    ]
  },
  {
    name: 'territories',
    label: 'Territories',
    features: [
      { name: 'territory_list', label: 'Territory List' },
      { name: 'territory_detail', label: 'Territory Detail' },
      { name: 'territory_assignment', label: 'Territory Assignment' },
      { name: 'territory_region_management', label: 'Region Management' },
      { name: 'territory_coverage_statistics', label: 'Coverage Statistics' },
    ]
  },
  {
    name: 'gps_track',
    label: 'GPS Track',
    features: [
      { name: 'gps_live_tracking', label: 'Live Tracking' },
      { name: 'gps_journey_playback', label: 'Journey Playback' },
      { name: 'gps_visit_statistics', label: 'Visit Statistics' },
      { name: 'gps_distance_traveled', label: 'Distance Traveled' },
      { name: 'gps_time_analytics', label: 'Time Analytics' },
      { name: 'gps_team_status', label: 'Team Status' },
    ]
  },
  {
    name: 'my_beats',
    label: 'My Beats',
    features: [
      { name: 'beat_list', label: 'Beat List' },
      { name: 'beat_create', label: 'Create Beat' },
      { name: 'beat_detail', label: 'Beat Detail' },
      { name: 'beat_schedule', label: 'Beat Schedule' },
      { name: 'beat_analytics', label: 'Beat Analytics' },
      { name: 'beat_retailer_assignment', label: 'Retailer Assignment' },
      { name: 'beat_travel_allowance', label: 'Travel Allowance' },
    ]
  },
  {
    name: 'competition_master',
    label: 'Competition Master',
    features: [
      { name: 'competition_competitor_list', label: 'Competitor List' },
      { name: 'competition_competitor_detail', label: 'Competitor Detail' },
      { name: 'competition_sales_team_size', label: 'Sales Team Size' },
      { name: 'competition_regional_presence', label: 'Regional Presence' },
      { name: 'competition_sku_comparison', label: 'SKU Comparison' },
      { name: 'competition_swot_analysis', label: 'SWOT Analysis' },
      { name: 'competition_news_articles', label: 'News Articles' },
    ]
  },
  {
    name: 'check_schemes',
    label: 'Check Schemes',
    features: [
      { name: 'scheme_active_schemes', label: 'Active Schemes' },
      { name: 'scheme_types', label: 'Scheme Types' },
      { name: 'scheme_validity_tracking', label: 'Validity Tracking' },
      { name: 'scheme_details', label: 'Scheme Details' },
      { name: 'scheme_applicability', label: 'Applicability' },
      { name: 'scheme_tiered_offers', label: 'Tiered Offers' },
    ]
  },
  {
    name: 'my_expenses',
    label: 'My Expenses',
    features: [
      { name: 'expense_beat_allowance', label: 'Beat Allowance' },
      { name: 'expense_claims', label: 'Expense Claims' },
      { name: 'expense_claim_history', label: 'Claim History' },
      { name: 'expense_approval_status', label: 'Approval Status' },
      { name: 'expense_distance_calculation', label: 'Distance-based Calculation' },
    ]
  },
  {
    name: 'gamification',
    label: 'Gamification / Leaderboard',
    features: [
      { name: 'gamification_leaderboard', label: 'Leaderboard' },
      { name: 'gamification_badges', label: 'Badges' },
      { name: 'gamification_rewards', label: 'Rewards' },
      { name: 'gamification_redemption', label: 'Redemption' },
    ]
  },
  {
    name: 'packing_list',
    label: 'Packing List',
    features: [
      { name: 'packing_list_view', label: 'View Packing Lists' },
      { name: 'packing_list_create', label: 'Create Packing List' },
      { name: 'packing_list_manage', label: 'Manage Packing Lists' },
    ]
  },
  {
    name: 'my_deliveries',
    label: 'My Deliveries',
    features: [
      { name: 'delivery_list', label: 'Delivery List' },
      { name: 'delivery_detail', label: 'Delivery Detail' },
      { name: 'delivery_status_update', label: 'Status Update' },
    ]
  },
  {
    name: 'recycle_bin',
    label: 'Recycle Bin',
    features: [
      { name: 'recycle_view', label: 'View Recycle Bin' },
      { name: 'recycle_restore', label: 'Restore Items' },
      { name: 'recycle_permanent_delete', label: 'Permanent Delete' },
    ]
  },
  {
    name: 'competency',
    label: 'Competency',
    features: [
      { name: 'competency_dashboard', label: 'Competency Dashboard' },
      { name: 'competency_detail', label: 'Competency Detail' },
      { name: 'competency_team', label: 'Team Competency' },
    ]
  },
  {
    name: 'tax_master',
    label: 'Tax Master',
    features: [
      { name: 'tax_master_list', label: 'View Tax Masters' },
      { name: 'tax_master_create', label: 'Create Tax Master' },
      { name: 'tax_master_edit', label: 'Edit Tax Master' },
      { name: 'tax_master_delete', label: 'Delete Tax Master' },
      { name: 'tax_component_manage', label: 'Manage Tax Components' },
      { name: 'tax_product_mapping', label: 'Product Tax Mapping' },
    ]
  },
  {
    name: 'user_management',
    label: 'User Management',
    features: [
      { name: 'user_mgmt_list', label: 'User List' },
      { name: 'user_mgmt_create', label: 'Create User' },
      { name: 'user_mgmt_edit', label: 'Edit User' },
      { name: 'user_mgmt_delete', label: 'Delete User' },
      { name: 'user_mgmt_activate_deactivate', label: 'Activate / Deactivate' },
      { name: 'user_mgmt_reset_password', label: 'Reset Password' },
      { name: 'user_mgmt_hierarchy', label: 'Hierarchy Management' },
    ]
  },
  {
    name: 'operations',
    label: 'Operations',
    features: [
      {
        name: 'operations',
        label: 'Operations',
        subFeatures: [
          { name: 'operations_config', label: 'Operations configuration' },
          { name: 'order_backdate', label: 'Place backdated orders' },
          { name: 'order_on_behalf', label: 'Place order on behalf' },
          { name: 'order_out_of_beat', label: 'Place out-of-beat orders' },
          { name: 'order_edit', label: 'Edit placed orders' },
        ]
      },
    ]
  },
];

export const PERMISSION_FIELDS = [
  { key: 'can_read', label: 'Read' },
  { key: 'can_create', label: 'Create' },
  { key: 'can_edit', label: 'Edit' },
  { key: 'can_delete', label: 'Delete' },
  { key: 'can_view_all', label: 'View All' },
  { key: 'can_modify_all', label: 'Modify All' },
] as const;

export type PermissionField = typeof PERMISSION_FIELDS[number]['key'];

// Helper to get all permission items (features or sub-features) for a module
export const getAllPermissionItems = (module: PermissionModule): { name: string; label: string; parentLabel?: string }[] => {
  const items: { name: string; label: string; parentLabel?: string }[] = [];
  
  module.features.forEach(feature => {
    if (feature.subFeatures && feature.subFeatures.length > 0) {
      // For features with sub-features, add the sub-features
      feature.subFeatures.forEach(subFeature => {
        items.push({
          name: subFeature.name,
          label: subFeature.label,
          parentLabel: feature.label
        });
      });
    } else {
      // For features without sub-features, add the feature itself
      items.push({
        name: feature.name,
        label: feature.label
      });
    }
  });
  
  return items;
};

// Helper to count total features (including sub-features)
export const getTotalFeatureCount = (module: PermissionModule): number => {
  return getAllPermissionItems(module).length;
};

// Helper to get ALL permission item names across all modules (for auto-grant operations)
export const getAllModulePermissionItems = (): string[] => {
  const items: string[] = [];
  PERMISSION_MODULES.forEach(mod => {
    mod.features.forEach(feat => {
      items.push(feat.name);
      feat.subFeatures?.forEach(sub => items.push(sub.name));
    });
  });
  return items;
};
