## Goal

Replace the current single-select "Mass Edit Beats" modal opened from the **My Retailers** page with a new **Beat Transfer** modal that matches the attached dual-pane screenshot and runs entirely on live Supabase data. The existing `Mass Edit Beats` button (`src/pages/MyRetailers.tsx`, line 732) keeps its position but opens the new modal.

The standalone `/beats/transfer` page and `retailer_beat_transfer_history` audit table built earlier are reused — only the entry point and UI shell change.

## 1. New component: `src/components/BeatTransferModal.tsx`

Self-contained modal (no route change) with the exact layout from the screenshot:

- Header: "Beat Transfer".
- Top row, two `Select`s side-by-side: **From Beat** and **To Beat**. Destination list excludes the chosen source.
- Two-pane body (`grid-cols-1 md:grid-cols-[1fr_auto_1fr]`):
  - **Left card** "Retailers in {sourceBeatName} ({total})" — search input, scroll list with checkboxes, footer "Showing X to Y of N".
  - **Middle column** — vertical stack of icon buttons: `>` (move checked), `>>` (move all filtered), `<` (return checked), `<<` (return all).
  - **Right card** "Selected for Transfer ({count})" with a "Clear all" link, search input, row list with grab handle + `X` remove, pagination footer.
- Info bar (blue tint): "{count} retailers will be moved from **{source}** to **{destination}**".
- Footer: `Cancel` and primary `Transfer N Retailers` (disabled until source + destination + ≥1 selection).
- Confirm sub-dialog before write.

State: `sourceBeatId`, `destBeatId`, `available`, `selected`, `leftSearch`, `rightSearch`, `leftChecked: Set<string>`, `rightChecked: Set<string>`, `isLoading`, `isTransferring`.

## 2. Data — all via `@/integrations/supabase/client`

- Beats: `supabase.from('beats').select('id, beat_id, beat_name').eq('is_active', true).order('beat_name')`.
- Source retailers: `supabase.from('retailers').select('id, name').eq('beat_id', sourceBeatId).order('name')`, fired when source changes; spinner while loading; "No retailers found in this beat." empty state.
- Transfer on confirm:
  1. `auth.getUser()` → `transferred_by`.
  2. `supabase.from('retailers').update({ beat_id, beat_name, updated_at: new Date().toISOString() }).in('id', ids)`.
  3. `supabase.from('retailer_beat_transfer_history').insert(rows)` (one row per retailer, from/to id+name + `transferred_by`).
  4. On success: toast, refetch source-beat retailers, clear right pane and selections, call `onSuccess?.()` so My Retailers refreshes its list, close modal.
  5. On any error: `toast.error(err.message)`, keep state intact.

No mock data, no hardcoded ids/names. Strict TS types: `Beat`, `Retailer`, `TransferHistoryRow`.

## 3. Wire to My Retailers button

In `src/pages/MyRetailers.tsx`:

- Replace the `MassEditBeatsModal` import with `BeatTransferModal`.
- Keep `massEditModalOpen` state + the existing button (line 732 — label stays "Mass Edit Beats" so we don't change user-visible chrome unless asked).
- Render `<BeatTransferModal open={massEditModalOpen} onOpenChange={setMassEditModalOpen} onSuccess={() => { setMassEditModalOpen(false); /* existing refetch */ }} />` in place of the current modal block (lines 1110–1120).
- No other logic on the page changes.

## 4. Leave alone

- `MassEditBeatsModal.tsx` stays in the repo (unused after this change) — no deletes per the "don't modify existing components" constraint discussed earlier. It can be removed later if you want.
- The standalone `/beats/transfer` route + `MassBeatTransfer.tsx` page remain available.
- `retailer_beat_transfer_history` table and its policies are already in place — no new migration.

## 5. Validation & UX details

- Disable both `Select`s, move buttons, and search inputs while `isTransferring`.
- Confirm dialog body: "Are you sure you want to move {N} retailers from {source} to {destination}? This action cannot be undone."
- Move buttons act on the **filtered** view (so `>>` respects the active left search), matching the screenshot's expected behavior.
- All styling uses existing semantic tokens (`bg-muted`, `text-muted-foreground`, `border`, `text-primary`, etc.) — no raw hex.

## Phasing

1. Build `BeatTransferModal.tsx`.
2. Swap the modal in `MyRetailers.tsx`.
3. Smoke test from the My Retailers button: pick beats → move → confirm → verify both `retailers` and `retailer_beat_transfer_history` updated.