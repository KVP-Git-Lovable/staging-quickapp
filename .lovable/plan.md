## Goal

In the **Beat Exchange** modal (opened from "Mass Edit Beat" on `/my-retailers`), add a special option called **"Unassigned Retailers"** in the Beat A / Beat B dropdowns. Selecting it lists every retailer owned by the current user that isn't mapped to any beat, so the user can multi-select them and bulk-assign them to a real beat.

## Behavior

- A pinned entry `Unassigned Retailers` appears at the top of both Beat A and Beat B selectors.
- When chosen on a side, that panel lists all retailers (scoped to current user) where `beat_id IS NULL` or `beat_id = ''`, with the same search / select-all / pagination / drag-drop UX as a real beat.
- The other side must be a real beat — you can't pair Unassigned ↔ Unassigned (the option is hidden from the opposite dropdown once selected, same pattern already used to hide the chosen beat).
- Moving a retailer **out of Unassigned → real beat**: on Confirm, updates `beat_id` and `beat_name` to the chosen beat (existing path).
- Moving a retailer **into Unassigned** (real beat → Unassigned): on Confirm, sets `beat_id = NULL` and `beat_name = NULL` so it becomes unassigned again.
- Transfer history rows still written; `from_beat_id` / `to_beat_id` are `NULL` and the name stored as `"Unassigned"` for traceability.
- Ownership guard relaxed: today both sides must be in `ownableBeatIds`. New rule — the Unassigned side is always allowed; the real beat side must still be owned by the user.
- Panel header reads `Retailers in Unassigned (N)` when sentinel is selected.

## Files to change

Single file: `src/components/BeatTransferModal.tsx`.

- Add `const UNASSIGNED_ID = "__unassigned__"`.
- Render `Unassigned Retailers` as the first `<SelectItem>` in both Beat A and Beat B dropdowns (filter it out from the opposite side when already chosen).
- Resolve `beatA` / `beatB` so the sentinel returns a synthetic `{ id: UNASSIGNED_ID, beat_id: "", beat_name: "Unassigned" }`.
- In `loadSide`, branch on sentinel: query `retailers` with `.or('beat_id.is.null,beat_id.eq.')` filtered by current `user_id`; otherwise existing query.
- In `handleConfirm`:
  - Build per-direction update payload — sentinel target → `{ beat_id: null, beat_name: null }`; otherwise existing payload.
  - Build `historyRows` with nullable from/to ids and name `"Unassigned"` on whichever side is the sentinel.
  - Replace the strict `ownableBeatIds` guard so it only requires ownership for the real-beat side(s).

## Out of scope

- No DB schema changes (uses existing nullable `retailers.beat_id`).
- No other modals, pages, or filters touched.
