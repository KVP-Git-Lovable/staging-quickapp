
# Feature Management — Coverage Audit & Scoping Expansion

## What's there today
- `feature_flags` has **25 entries**, almost all "is this nav item / module visible".
- Scoping: **global** + **per-company override** (`company_feature_config`). No per-role, no per-user.
- Many real *process* requirements (mandatory check-in, payment proof, face match, feedback before checkout, regularization rules, auto-end-day, retailer verification, credit checks) already exist — but as **separate policy tables and hooks**, not as feature flags. So the admin UI doesn't see them.

## What's missing — two gaps

### Gap 1: Coverage
Modules in the app with NO feature flag row today (sample, not exhaustive):
- Counter Sales / POS, Van Sales Management, Event Orders, Branding Requests,
  Joint Sales, Employee 360 / Onboarding, Retailer Loyalty, Credit Management,
  Vendors, Holidays/Leave, Approvals (Team / Expense), Help Center, AI Features,
  Customer Portal, Distributor Portal, WhatsApp ordering, Cart, Notifications,
  Performance Dashboard, Status Dashboard, Mass Beat Transfer, PM Projects, etc.

Process toggles that exist in code but aren't in Feature Management:
- `check_in_mandatory_for_order` (only one in `feature_flags` of this kind)
- Payment proof mandatory (own table)
- Face match on check-in (own table/policy)
- Feedback before checkout (`feedback_policies`)
- Auto end-day (`auto_end_day_policy`)
- Regularization (`regularization_policy`)
- Retailer verification (`retailer_verification_policy`)
- GPS tracking always-on, distance validation
- Mandatory photo / mandatory remarks on visit
- No-order reason required
- Credit limit enforcement
- Order edit / cancel windows
- Offline mode required

### Gap 2: Scoping
User asked: "per user, per role, per company". Today we only support global + per-company.

---

## Plan

### Step 1 — Seed missing feature flags (one migration, data only)
Add ~60–80 rows to `feature_flags` covering:
- **Module visibility** for every page in `src/pages` not already covered (categorize as `navigation` or `module`).
- **Process controls** as a new category `process` — each as on/off, plain language name + description:
  - `visit_check_in_mandatory`, `visit_photo_mandatory`, `visit_remarks_mandatory`, `visit_no_order_reason_required`
  - `attendance_face_match`, `attendance_geo_fence`, `attendance_auto_end_day`, `attendance_regularization_enabled`
  - `order_payment_proof_mandatory`, `order_credit_limit_enforced`, `order_edit_window_enabled`, `order_cancel_requires_reason`
  - `retailer_verification_required`, `retailer_gps_required`, `retailer_photo_required`
  - `feedback_before_checkout`, `feedback_before_order_submit`
  - `gps_always_on`, `gps_distance_validation`
  - `offline_mode_required`, `whatsapp_ordering_enabled`, `customer_portal_enabled`
  - …and the rest discovered during the audit pass.
- Reuse existing process-table values for `is_enabled` defaults so behavior doesn't change.

A short audit script (read-only) lists every page/hook with a policy/mandatory check and produces the seed list — we'll commit the resulting SQL.

### Step 2 — Add role + user scoping (one schema migration)
New tables, mirroring `company_feature_config`:
- `role_feature_config(role_id, feature_id, is_enabled NULL, updated_by, timestamps)` — role = `security_profiles.id`.
- `user_feature_config(user_id, feature_id, is_enabled NULL, updated_by, timestamps)`.

Both: `is_enabled NULL` = inherit. Unique on (scope_id, feature_id). RLS: super-admin all; company managers read/write within company; users read their own only.

### Step 3 — Resolution order (update `get_effective_features` RPC)
For a given (user, company, feature):
1. Global `feature_flags.is_enabled = false` → OFF (kill switch).
2. Else `user_feature_config` if set → use it.
3. Else `role_feature_config` (any role the user has) → if **any** override exists, OFF wins over ON (most restrictive).
4. Else `company_feature_config` if set → use it.
5. Else global default → ON.
6. After 1–5, apply `feature_dependencies` blocking.

Return per-row `source` ('global'|'user'|'role'|'company'|'default') so UI can show where the value came from.

### Step 4 — Process-control adoption (no code rewrites)
Provide an adapter hook `useProcessRequirement(key)` that:
- First reads from `useFeature(key)` (new flag system).
- Falls back to the legacy policy table when the flag isn't seeded yet.
This means existing screens keep working; we migrate call sites opportunistically. **No mass refactor.**

Concrete migrations done in this PR for the highest-visibility process controls:
- `useCheckInMandatory` → reads `visit_check_in_mandatory`.
- `usePaymentProofMandatory` → reads `order_payment_proof_mandatory`.
- `useFeedbackPolicyCheck` (entry gate only) → reads `feedback_before_checkout`.
- `useAutoEndDayPolicy` (enabled flag only) → reads `attendance_auto_end_day`.
Detailed policy fields (windows, thresholds) stay in their tables — we're only moving the on/off switch.

### Step 5 — UI extensions in `FeatureManagement.tsx`
Existing tabs: Global, By Company, Dependencies, Audit Log. Add:
- **By Role** — role selector + per-feature override (Inherit / On / Off).
- **By User** — user selector with search + per-feature override.
- **Coverage Report** — read-only tab listing every page/hook found in code vs. its mapped feature flag, so future gaps are visible.
- Filter chips on every tab: category = `navigation` | `module` | `process` | `general`.

`CompanyProfile.tsx` Features tab and `UserProfile.tsx` Features section already exist — they automatically pick up the new flags. Add a small "Configured by: company / role / user / global" badge on each row using the new `source` field.

### Step 6 — Permissions
- New permission key `feature_role_manage` (super-admin + company manager).
- `feature_user_manage` (super-admin + company manager).
- Seed into default admin profiles.

---

## Technical notes
- All new RPCs use `p_` param prefix.
- `get_effective_features(p_company_id, p_user_id default null)` — backward compatible; existing callers keep working.
- Cache key in `FeatureContext` becomes `${user_id}:${company_id}` so user-level overrides take effect on login.
- Audit log (`feature_flag_audit`) gets `scope_type` (`global`|`company`|`role`|`user`) and `scope_id` columns.
- No edge functions needed.
- No breaking changes — every new override defaults to NULL (inherit).

## Out of scope
- Migrating *all* legacy policy tables into feature flags (we only move on/off switches; detailed config stays where it is).
- A visual rule builder for combining flags. Toggles only.
- Per-territory or per-beat scoping (can add later as a 4th scope table using same pattern).

## Deliverables
- Migration A: seed ~60–80 new flag rows (data only).
- Migration B: `role_feature_config`, `user_feature_config`, audit log columns, updated RPCs, RLS, grants, permission seeds.
- `useProcessRequirement` adapter + 4 hook updates above.
- `FeatureManagement.tsx`: 3 new tabs (By Role, By User, Coverage Report) + category filter.
- Source badge on `FeatureCard` + `UserFeaturesSection`.
- README "Feature Management" section updated with the new resolution order.
