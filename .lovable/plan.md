## Confirmed root cause

The current RLS design on business tables wraps every SELECT/UPDATE/DELETE with an `OR is_system_admin(auth.uid())` bypass. Any user assigned to a security profile with `is_system = true` instantly sees and edits every row across the org — regardless of ownership, beat sharing, or manager hierarchy.

Today 6 accounts are on the "System Administrator" profile (`is_system = true`):
Prajwalkvp, Prabhu (ajay.kvp1), Dharmesh, Prabhu KVP (ajay.kvp2), Anvita K, Abhishek KP. This explains the cross-user visibility you saw in My Visits, My Beats, Retailers, and Orders.

Your guidance is correct: **System Administration ≠ Business Data Visibility**. The fix is to stop using `is_system_admin` as a data-visibility bypass on business tables. Admin power should be expressed only via `profile_object_permissions` / permission sets (admin_*, module_*) and the hierarchy/sharing functions.

## Plan

### 1. Tighten RLS on business-data tables (remove the `is_system_admin` bypass)

Drop and recreate the SELECT / UPDATE / DELETE policies on these tables so the only ways to see/modify a row are: own (`auth.uid() = user_id` / `owner_id_snapshot`), explicit beat access (`user_has_beat_access`), explicit row sharing (`retailer_shared_access`, `beat_user_access`, `beat_coverage_assignments`, `daily_beat_plans` assignment), or hierarchy (`is_subordinate_of`).

Tables in scope (business data — admin bypass to be removed):

- `orders`, `order_items`
- `visits`
- `beats`, `retailers`, `retailer_beat_assignments`
- `primary_orders`, `primary_order_items`, `primary_invoices`, `primary_shipments`
- `invoices`, `invoice_items`, `credit_notes`, `credit_note_items`
- `retailer_payment_collections`, `petty_cash_transactions`, `additional_expenses`
- `attendance`, `regularization_requests`, `leave_applications`, `daily_gps_distance`, `gps_tracking`, `gps_tracking_stops`
- `daily_beat_plans`, `beat_plans`, `beat_user_access` (select), `beat_coverage_assignments` (select)
- `counter_sales`, `counter_sale_items`, `van_*` (rep-owned), `joint_sales_sessions`, `joint_sales_feedback`
- `retailer_visit_logs`, `retailer_feedback`, `retailer_change_requests`, `retailer_loyalty_*` user-owned tables

For each table, the new SELECT pattern is:

```sql
user_has_permission(auth.uid(), '<module>', 'can_read')
AND (
  auth.uid() = user_id
  OR auth.uid() = owner_id_snapshot                       -- where applicable
  OR user_has_beat_access(auth.uid(), beat_id)            -- where applicable
  OR is_subordinate_of(auth.uid(), user_id)
  OR EXISTS (... explicit sharing table ...)              -- where applicable
)
```

INSERT policies stay as they are (already enforce `auth.uid() = user_id`). UPDATE / DELETE mirror SELECT but drop the admin bypass and keep the existing permission checks.

### 2. Keep `is_system_admin` ONLY on admin/config/master tables

These tables legitimately need a global admin (configuring the system, master data, security):

- `security_profiles`, `profile_object_permissions`, `user_profiles`, `user_object_permissions`
- `permission_set_groups`, `permission_set_group_permissions`, `permission_set_group_users`, `coverage_permission_assignments`
- `feature_flags`, `feature_flag_audit`, `company_feature_config`, `role_feature_config`, `user_feature_config`
- `companies`, `holidays`, `working_days_config`, `week_off_config`, `auto_end_day_policy`
- `notification_rules`, `notification_event_types`, `expense_master_config`, `expense_approval_rules`, `approval_workflows`, `approval_config`
- `products`, `product_variants`, `product_categories`, `company_product_categories`, `uom_master`, `uom_category`, `product_uom_mapping`, `tax_masters`, `tax_components`, `tax_product_map`
- `territories`, `pincode_master`, `distributors`, `warehouses`, `vendors` (admin maintenance only — list view still gated by `user_has_permission`)
- `feedback_policies`, `feedback_policy_rules`, `feedback_questions`, `target_*` setup/definition tables, `leave_types`, `leave_policy`, `global_leave_policy`
- `recycle_bin`, `recycle_bin_config`, `permanent_deletion_log`, `sensitive_data_access_log`

These remain `is_system_admin(auth.uid()) OR <existing ownership/permission>` because they describe the system itself, not a user's business data.

### 3. Recommended (optional): split the privilege

After the rewrite, "root admin" can stay a single account by convention. But operationally, the safer pattern is: keep `is_system = true` on a single bootstrap account, and grant the 5 other current admins fine-grained `admin_*` permissions on the modules they need (Security, Feature Flags, Masters, etc.) via `profile_object_permissions` / permission set groups. They keep admin capability, lose data bypass. This is purely an operational follow-up — no migration required.

### 4. Migration shape

A single migration that, for every table in section 1:

1. `DROP POLICY` on the existing SELECT/UPDATE/DELETE policy.
2. `CREATE POLICY` with the new predicate (no `is_system_admin` in the OR chain on business data).
3. Re-grants are unchanged.

Tables in section 2 are not touched.

### 5. Verification

After the migration:

- Re-query `pg_policies` and grep for `is_system_admin` — should appear only on admin/config tables.
- Log in as one of the 6 current "System Administrators" with no manager link and no shared beats — confirm `My Visits`, `My Beats`, `Retailers`, `Orders` show only their own records.
- Log in as a manager — confirm subordinate rows still show.
- Log in as a rep with a beat shared via `beat_user_access` — confirm the shared beat's retailers/orders still show.
- Spot-check admin pages (`/security-management`, `/admin-controls`, masters) — still accessible because `admin_*` permissions / `is_system_admin` are unchanged on config tables.

### 6. Client code

No client changes are required — every list page already calls Supabase with no `.eq('user_id', ...)` filter and relies on RLS to scope rows. Tightening RLS automatically removes the leaked rows. The `useSubordinates` / `useViewableUserIds` hooks continue to work for manager dashboards.

### What I need from you to proceed

1. Confirm I should **remove `is_system_admin` from the OR chain on every business-data table listed in section 1**.
2. Confirm the **admin/config tables in section 2 keep the bypass** (so a root admin can still manage profiles, feature flags, masters, etc.).
3. Anything you want explicitly added or excluded from section 1's table list (e.g. should `attendance` / `leave_applications` keep admin visibility for HR? My default is no — HR gets it via hierarchy or an explicit `admin_hr_view` permission).

Once you confirm, I'll switch to build mode and ship the migration in one shot.
