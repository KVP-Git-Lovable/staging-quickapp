## Verified current state (staging aoxdosjkwqyuvccuwhzc)

- `gamification_games` (12 cols), `gamification_actions` (16 cols), `gamification_points` (9 cols), `gamification_daily_tracking` (7 cols), `leaderboard_snapshots` (10 cols) all exist with the columns you listed.
- Counts confirmed: 2 games, 2 actions, 122 point rows, 610 points, 0 daily-tracking rows, 5 snapshot rows.
- `gamification_settings` and `activity_tiers` do **not** exist — both are new.
- `user_period_targets` exists and has `kpi_id`, `period_type`, `period_start/end`, `achievement_percent` — the tiered archetype can read it as designed. `target_kpi_definitions` exists.
- `products` has **no** `is_focused` column — needs adding for the Product archetype.
- Award path today is app code: `src/utils/gamificationPointsAwarder.ts`, called from `Cart.tsx`, `VisitCard.tsx`, `CompetitionDataForm.tsx`, `RetailerFeedbackModal.tsx`, `BrandingRequestModal.tsx`, `noOrderUtils.ts`, `orderCancellation.ts`. Admin UI is `src/components/GamificationManagement.tsx`.
- `gamification_workflow_light.html` is not in the project — Phase 1 screens wait on your attachment before final styling.

## Phase 0 — Schema extend (additive, staging)

One migration, no drops:
- `gamification_actions` += `conditions_json`, `expiry_type`, `expiry_days`, `validity_from`, `validity_to`, `cap_scope`, `cap_value`, `redemption_min`, `award_mode`, `leaderboard`, `eligibility_mode`, `eligibility_ids uuid[]`, `is_tiered`, `kpi_id`, `target_period`, `tier_mode`, `is_system`.
- `gamification_points` += `expires_at`, `status` (default `active`), `period_key`, `retailer_id`.
- `gamification_games` += `category`, `icon`, `color`.
- `gamification_daily_tracking` += `period_key` (+ unique index on user/action/period_key) for month and retailer scopes; retailer scope adds `retailer_id`.
- New `activity_tiers` (action_id fk, threshold_pct, points, sort).
- New single-row `gamification_settings` (engine_enabled, currency_name, point_conversion, timezone, leaderboard_enabled, notifications_enabled, default_award_mode, approval_fallback).
- `products` += `is_focused boolean default false`.
- GRANTs + RLS on the two new tables (read for authenticated, write for admins via existing `is_admin_or_manager()`).

## Phase 0b — Data migration

- All 122 rows: `status='active'`, `expires_at =` **financial year end (31 Mar)** relative to cutover.
- Mark `first_order_new_retailer` and `productive_visit` `is_system=true`, fill their new policy columns with defaults (expiry `fy_end`, cap scope per their existing `max_daily_awards`, leaderboard on).
- Reconcile `points_to_rupee_conversion` from the 2 games into `gamification_settings.point_conversion`; flag if they differ.
- Verify no orphan point rows.

## Phase 1 — Admin frontend

New module under `src/components/gamification/`, replacing `GamificationManagement.tsx` as the entry:
1.1 Overview — hero, global-config card (edit → `gamification_settings`), program grid with 3/2/list views, 8 category colours, computed stat strip.
1.2 New program form → `gamification_games`.
1.3 Program detail — colour band, linked-module note, activity cards (badge + name + status only).
1.4 Activity form base — details / trigger + conditions (scoped by category) / reward (read-only conversion line) / policy.
1.5 Product archetype — focus-flag panel, `is_focused` toggle in product editor + bulk mark, zero-flag warning.
1.6 Beat growth — metric, compare-against, min growth %, to `conditions_json`.
1.7 Capture — read-only trigger panel, daily cap required.
1.8 Target tiered — live KPI dropdown, tier table → `activity_tiers`, highest-only fixed, empty-Targets warning.
1.9 Eligibility picker — all / manager (via `get_all_subordinates`) / territory / specific users.

Rules enforced throughout: live reads only, no "audit" wording, conversion global only, toggle labelled "Activity active".

## Phase 2 — Award engine (Postgres)

Built as functions + triggers + cron, each with a `dry_run` guard driven by `gamification_settings.engine_enabled`:
1. `gam_award_event(...)` — matches active activities on trigger + conditions + eligibility + validity, inserts ledger rows with computed `expires_at`.
2. Eligibility resolver (manager subtree resolved at award time).
3. Cap enforcement — drop-on-hit using `gamification_daily_tracking` at the activity's scope.
4. Nightly cron marks `status='expired'`.
5. Month-close job for tiered activities — highest tier met from `user_period_targets.achievement_percent`, one row per period_key.
6. Redemption — oldest-first `status='redeemed'`, respecting `redemption_min`.
7. Notifications on award via existing `notifications` table.
8. Repoint the leaderboard snapshot job to sum active, non-expired, leaderboard-enabled rows.
9. Cutover: enable engine + delete the `gamificationPointsAwarder` call sites in the same release; watch for duplicate `reference_id` inserts.

Dry-run first: engine writes to a shadow table until totals reconcile against expected balances.

## Phase 3 — Rep-facing

3.1 Wallet — balance, ₹ value, expiring-soon, award history (vivid theme).
3.2 Leaderboard — untouched, data repoint only.
3.3 Reward moment — celebration card off the award notification.

## Sequence and gates

Phase 0 → 0b (I can run and verify these immediately) → Phase 1 (starts once you attach `gamification_workflow_light.html`) → Phase 2 dry-run → sign-off → hard cutover → Phase 3. Production `etabpbfokzhhfuybeieu` only after staging sign-off; I will not touch it in this build.
