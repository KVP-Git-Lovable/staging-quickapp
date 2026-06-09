## The Gap

Today the Rep journey screen (My Visit / Visit Planner) and its underlying hook `useVisitsData` filter strictly by the logged-in user:

```ts
supabase.from('visits').select('*').eq('user_id', uid)…
supabase.from('orders').select('*').eq('user_id', uid)…
```

So when Abhishek shares Bejai2 with Ashwitha (OPERATIONAL) and both plan it for today:
- Ashwitha visits Retailer X and places an order → row stored with `user_id = Ashwitha`.
- Abhishek opens his journey → still sees Retailer X as "pending" because his query never returns Ashwitha's visit/order.

Result: duplicate visits, double calls to the retailer, no situational awareness between the two reps working the same beat.

## Opinion

This is a real shared-ownership gap, not just a display bug. Sharing a beat (CO_OWNER / OPERATIONAL) is meant to signal "we're working this together" — so the journey must show "this stop has already been covered by your teammate" with attribution. We should **not** mutate `user_id` on orders/visits (that breaks performance attribution, targets, commissions). Instead, we **augment** the owner's view with teammate activity on shared retailers/beats for that day.

VIEW_ONLY shares should also see teammate activity (read-only purpose). COVERAGE shares are temporary and already follow the same pattern.

## Plan

### 1. Resolve "teammates on a shared beat for today"
New helper (client-side or RPC) `getBeatTeammates(userId, date)`:
- Take the user's active beats for `date` (from `beat_plans` + `beat_user_access` already loaded).
- For each beat, find all **other** users whose `beat_user_access` is active that day OR who own the beat (`beats.user_id`).
- Returns `Map<beat_id, teammateUserIds[]>` and a flat `teammateUserIds[]`.

### 2. Extend `useVisitsData` to fetch teammate activity
In `syncFromNetwork(uid, date)`:
- Run the existing 3 queries for `uid` (unchanged).
- In parallel, if teammates exist, run a **second** batch for `visits` and `orders` filtered by `user_id IN (teammateIds)` AND `retailer_id IN (sharedBeatRetailerIds)` for the same date.
- Merge into the same retailer list but tag each row with `source: 'self' | 'teammate'` and `actor: { user_id, full_name }`.
- Cache merged result in IndexedDB under a new key (`visits-merged-{uid}-{date}`) so offline still works.

### 3. Render teammate-covered stops distinctly
In the Visit list card (`src/components/visits/*` / `VisitCard`):
- If `source === 'teammate'`, render the existing "Done" pill in a muted indigo with a small avatar/initials + label "Done by Ashwitha · 11:42 AM" and an order badge if an order exists.
- Tapping it opens a read-only summary (retailer, visit time, order id, amount) — no edit, no re-order CTA for the owner.
- Owner can still visit the retailer himself (not blocked), but a confirmation appears: "Ashwitha already visited this retailer today. Continue?"

### 4. Order list / Today's Orders parity
Apply the same teammate merge in `useTodayOrders` (or equivalent) so Abhishek's "Orders today" tab lists Ashwitha's orders on shared-beat retailers under a "Team orders" sub-section. Counts on the dashboard tile should clearly separate **Mine / Team / Total**.

### 5. Permission gating
- Only include teammate activity for beats where the current user's access is `OWNED | CO_OWNER | OPERATIONAL | VIEW_ONLY | COVERAGE` AND `is_active`.
- Respect RLS — `visits` and `orders` RLS already allow shared-beat readers via existing `beat_user_access` policies; verify and add a SELECT policy if missing (likely needed for `orders`).

### 6. Notification (optional, phase 2)
Trigger a lightweight notification to other teammates on the same beat when one of them checks in / places an order: "Ashwitha just placed an order at Retailer X (Bejai2)." Uses the existing notification engine.

## Files to touch

- `src/hooks/useVisitsData.ts` — add teammate fetch + merge.
- `src/hooks/useTodayOrders.ts` (or wherever orders today are read) — same merge.
- `src/lib/beatTeammates.ts` (new) — `getBeatTeammates` helper.
- `src/components/visits/VisitCard.tsx` — teammate badge + confirmation modal.
- `src/pages/VisitPlanner.tsx` / `MyVisit` — section split (Mine vs Team).
- Migration: ensure SELECT RLS on `orders` and `visits` allows users with active `beat_user_access` on the row's `beat_id` (via SECURITY DEFINER helper `has_beat_access(user, beat)`).

## Out of scope

- Reassigning order ownership / targets between Abhishek and Ashwitha.
- Real-time live sync (Supabase Realtime) — current 8s polling on focus + manual refresh is enough for v1.
- Conflict resolution if both reps order for the same retailer simultaneously (acceptable for v1; both orders are valid).

Want me to implement v1 (steps 1-3 + RLS check) first and leave dashboard counts / notifications for a follow-up?
