## Redesign: Beat Transfer → Two-Beat Exchange Board

Replace the source→destination flow in `src/components/BeatTransferModal.tsx` with a symmetric exchange board where the user picks Beat A and Beat B, freely moves retailers in either direction (arrows + drag-and-drop), and commits all changes atomically on confirm.

### Scope

Single file: `src/components/BeatTransferModal.tsx`. No DB schema changes, no other components touched.

### State model

- `beatAId`, `beatBId` (UUIDs from `beats.id`, used only for select control). Resolve to full `Beat` objects via lookup.
- `originalA: Set<string>` and `originalB: Set<string>` — retailer ids originally loaded for each beat (immutable baseline used to compute moves).
- `panelA: Retailer[]` and `panelB: Retailer[]` — current contents of each panel (mutated by moves).
- `loadingA`, `loadingB` — per-panel spinners.
- Per panel: `searchA`/`searchB`, `checkedA`/`checkedB` (Set<string>), `pageA`/`pageB`.
- `confirmOpen`, `isSaving`.

Derived:
- `movedToB = panelB.filter(r => originalA.has(r.id))`
- `movedToA = panelA.filter(r => originalB.has(r.id))`

### Data fetching

When Beat A changes (and is set):
```ts
supabase.from("retailers")
  .select("id, name, beat_id, beat_name")
  .eq("beat_id", beatA.beat_id)   // text string, NOT beats.id UUID
  .order("name");
```
On result: set `panelA`, `originalA = new Set(rows.map(r=>r.id))`, clear `checkedA/checkedB`, `pageA/pageB=1`, and also reset panelB-side pending moves by reloading B baseline (simplest: reload B too if B selected). Per spec: changing A clears all pending moves → reload A and reset panelB to its `originalB` snapshot via a refetch of B too.
Same rule for Beat B.

Validation: if user picks A == B in the other select, show inline destructive text and ignore.

Beats list fetched once on open: `select id, beat_id, beat_name from beats where is_active = true order by beat_name`.

### Panel UI (identical structure left/right)

Header: `Retailers in {beat?.beat_name || "—"} ({panel.length})`.
Body:
- Search input (filters visible list only).
- "Select all" checkbox at top of list — toggles all *filtered* items into `checked*`.
- Row: checkbox + name, draggable (`draggable=true`, `dataTransfer` carries retailer id + source side `"A"|"B"`).
- Pagination footer: `Showing X to Y of N` + Prev/Next.
- Empty states: "Select a beat." / "No retailers in this beat." / "No matches."
- Loading: spinner.

Drop zone: each panel container listens to `onDragOver` (preventDefault + highlight class) and `onDrop` (move retailer from source side to this side if sides differ).

### Move operations

Helpers `moveIds(fromSide, toSide, ids)`: pulls matching retailers out of source panel array, appends to dest panel array sorted by name, clears that side's checked set for those ids.

Arrow buttons (middle column, vertical on md+):
- `>` → `moveIds("A","B", [...checkedA])`
- `>>` → `moveIds("A","B", filteredA.map(r=>r.id))` (all currently visible after search; if no search, all of panel A)
- `<` → `moveIds("B","A", [...checkedB])`
- `<<` → `moveIds("B","A", filteredB.map(r=>r.id))`

Buttons disabled when their source list is empty / nothing checked.

### Summary banner (below panels)

Render only when `movedToA.length + movedToB.length > 0`:
> `X retailers will move to {beatB.beat_name}, Y retailers will move to {beatA.beat_name}`

X = `movedToB.length`, Y = `movedToA.length`.

### Footer

- Cancel button.
- `Confirm Exchange` button — disabled unless both beats selected, not same beat, and `(movedToA.length + movedToB.length) > 0`.

### Confirmation modal

Nested `<Dialog>`:
- Title: `Confirm Beat Exchange`
- Body: `X retailers will be moved to {B.beat_name}\nY retailers will be moved to {A.beat_name}\nThis action cannot be undone.`
- Buttons: `Cancel` / `Confirm Exchange`.

### Commit (`handleConfirm`)

1. Get auth user; bail if missing.
2. If `movedToB.length > 0`:
   ```ts
   supabase.from("retailers").update({
     beat_id: beatB.beat_id, beat_name: beatB.beat_name, updated_at: new Date().toISOString()
   }).in("id", movedToB.map(r=>r.id));
   ```
3. If `movedToA.length > 0`: same with beat A values.
4. Build history rows for both directions (retailer_id, retailer_name, from_beat_id/name = original side, to_beat_id/name = new side, transferred_by = user.id) and insert into `retailer_beat_transfer_history` (single insert with all rows).
5. On success:
   - Refetch both panels from DB, reset originals, clear checks/pages/searches' page index.
   - Toast: `Exchange complete. X retailers moved to {B}, Y moved to {A}.`
   - Call `onSuccess?.()`; keep modal open showing fresh state (or close — spec says reload both panels, so keep open).
6. On any error: error toast, do not mutate state.

### Reset rules

- Modal close: clear everything.
- Beat A change: refetch A, refetch B (if selected), reset originals, clear checks/pages/searches.
- Beat B change: symmetric.

### Out of scope

- Sidebar, header, modal shell, card chrome.
- `retailer_beat_transfer_history` schema, RLS, other modals (`BeatTransferDialog`, `TransferRetailerBeatModal`).
- Backend RPCs (no transaction wrapper; sequential writes are acceptable per spec).
