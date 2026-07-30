## What I found (verified)

- The **Retailer growth** program has 3 activities in the database: `retailer_created` (15 pts, enabled), `first_order_new_retailer` (5 pts, enabled), `retailer_active_streak` (50 pts, disabled).
- `gamification_points` shows **0 awards ever** for `New retailer created` and `Retailer active 30 days`; `First order from new retailer` last awarded 2026-07-22.
- Reason: the app awards points from a **hardcoded switch** in `src/utils/gamificationPointsAwarder.ts`. It only has branches for `order_placed`, `first_order_new_retailer`, `daily_target`, `focused_product_sales`, `productive_visit`, `consecutive_orders`, `monthly_growth`. There is **no `retailer_created` branch and no call at all when a retailer is created** (searched every retailer insert path: `MyRetailers.tsx`, `AddRetailerInlineToBeat.tsx`, `EmployeePortalHome.tsx`, `AddRetailer.tsx`) — so that trigger can never fire.
- A fully data-driven engine already exists in Postgres: `gam_award_event(p_user_id, p_trigger_type, ...)`, which reads `trigger_type`, `conditions_json`, eligibility, validity, caps and expiry straight from the tables. It is currently unused by the frontend, and `gamification_settings.engine_enabled = false`, so even if called it would only dry-run.

So: the trigger/condition mapping exists in data, but nothing dispatches retailer events into it.

## Plan

1. **Generic dispatcher (removes hardcoding)**
   Add `src/utils/gamificationEventDispatcher.ts` with one function:
   `awardGamificationEvent(triggerType, { referenceType, referenceId, retailerId, context })` that calls the `gam_award_event` RPC and dispatches the existing `pointsEarned` UI event when any row returns `awarded = true`. No trigger names, points, or conditions in code — the DB decides.

2. **Wire the retailer triggers**
   - `retailer_created`: call the dispatcher after a successful retailer insert in `MyRetailers.tsx`, `AddRetailerInlineToBeat.tsx`, `EmployeePortalHome.tsx`, and the AddRetailer save path — passing context facts (`has_gps`, `source`) so conditions like "GPS captured" evaluate.
   - `retailer_verified`: call it from the retailer verification path with `verification_score` in context.
   - Idempotency is already handled in the engine via `reference_id` (the retailer id), so re-saves won't double-award.

3. **Turn the engine on**
   Set `gamification_settings.engine_enabled = true` so `gam_award_event` writes instead of dry-running. (Confirm with you before flipping, since it makes every enabled activity live.)

4. **`retailer_active_streak`**
   This one needs a periodic evaluation (a retailer ordering for 30 consecutive days), not an event. It stays disabled for now; I'll note it as a follow-up scheduled job rather than fake it client-side.

## Technical notes

- The existing hardcoded awarder stays in place for the order/visit flows for now, to avoid double-awarding; the dispatcher is only used for triggers it does not handle. A later cleanup can migrate order/visit flows onto `gam_award_event` too and delete the switch.
- No schema changes required — only a settings flag update plus frontend calls.
