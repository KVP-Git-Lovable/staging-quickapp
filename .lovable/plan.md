## Goal
Beat A / Beat B dropdowns in the Beat Exchange modal currently show every active beat in the org. Restrict them to beats the current user can manage.

## Changes (single file: `src/components/BeatTransferModal.tsx`)

### 1. Auth-aware beats fetch (replaces lines ~76–89)
- Get current user via `supabase.auth.getUser()` on open; bail if not authenticated.
- Run two queries in parallel:
  - `beats` where `is_active = true` AND `user_id = currentUser.id` (owned).
  - `beat_user_access` joined to `beats` where `user_id = currentUser.id`, `is_active = true`, `access_type IN ('CO_OWNER','OPERATIONAL')`, and `effective_to IS NULL OR effective_to > now()` (shared, still in window).
- Merge, dedupe by `beat_id`, sort by `beat_name`, set into `beats`.
- Track owned beat_ids in a new `ownableBeatIds: Set<string>` state.

### 2. Block exchange when a side isn't owned (in `handleConfirm`, ~line 205)
- Before any updates, if `!ownableBeatIds.has(beatA.beat_id) || !ownableBeatIds.has(beatB.beat_id)`, toast "You can only exchange retailers between beats you own" and return.
- This prevents CO_OWNER/OPERATIONAL view-only style misuse — only fully owned beats on both sides can swap.

### 3. Cleanup
- Reset `ownableBeatIds` on dialog close alongside other state resets.
- Keep the existing `retailers` panel queries unchanged (already keyed by `beat_id`).

## Notes
- No DB / migration changes; relies on existing RLS on `beats` and `beat_user_access`.
- `Beat` interface stays the same.
- Behaviour matches the user-provided expected dropdown contents per logged-in user.
