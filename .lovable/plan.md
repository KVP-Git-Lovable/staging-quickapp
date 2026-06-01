# Mass Beat Transfer Module

Build a standalone, fully-functional "Mass Beat Transfer" page wired to Supabase data, with a new history table for audit.

## 1. Database migration

New table only — no changes to `beats` or `retailers`.

```sql
CREATE TABLE IF NOT EXISTS public.retailer_beat_transfer_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id     uuid NOT NULL,
  retailer_name   text NOT NULL,
  from_beat_id    uuid NOT NULL,
  from_beat_name  text NOT NULL,
  to_beat_id      uuid NOT NULL,
  to_beat_name    text NOT NULL,
  transferred_by  uuid NOT NULL,
  transferred_at  timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.retailer_beat_transfer_history TO authenticated;
GRANT ALL ON public.retailer_beat_transfer_history TO service_role;

ALTER TABLE public.retailer_beat_transfer_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read transfer history"
  ON public.retailer_beat_transfer_history FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users insert their own transfer history rows"
  ON public.retailer_beat_transfer_history FOR INSERT
  TO authenticated WITH CHECK (transferred_by = auth.uid());

CREATE INDEX idx_rbth_retailer ON public.retailer_beat_transfer_history(retailer_id);
CREATE INDEX idx_rbth_from_beat ON public.retailer_beat_transfer_history(from_beat_id);
CREATE INDEX idx_rbth_to_beat ON public.retailer_beat_transfer_history(to_beat_id);
```

## 2. Route & file structure

- Route: `/beats/transfer` registered in `src/App.tsx` (lazy import, same pattern as existing pages).
- New page: `src/pages/MassBeatTransfer.tsx`.
- New hook: `src/hooks/useMassBeatTransfer.ts` (fetch beats, fetch retailers by beat, perform transfer).
- Reuse existing UI primitives: `Card`, `Select`, `Input`, `Button`, `Checkbox`, `Dialog`, `sonner` toast, `SearchInput`.

## 3. UI layout

Standard app shell (sidebar + header inherited from layout). Page contains:

- Header row: title "Mass Beat Transfer" + subtitle.
- Two `Select` dropdowns at top: Source Beat, Destination Beat.
- Inline error if user picks same beat in both.
- Two-column responsive grid (`grid-cols-1 md:grid-cols-[1fr_auto_1fr]`):
  - Left card: "Retailers in {sourceBeatName} (N)" — search box, Select-All checkbox, scrollable checkbox list, pagination footer "Showing X to Y of N".
  - Middle column: vertical stack of move buttons `>`, `>>`, `<`, `<<`.
  - Right card: "Selected for Transfer (N)" — search box, removable list rows with `x`, pagination footer.
- Info bar below: "X retailers will be moved from {Source} to {Destination}".
- Footer actions: `Cancel` (resets state / navigates back) and `Transfer X Retailers` (opens confirm modal).

## 4. Data fetching (all live)

- **Beats dropdowns**: `supabase.from('beats').select('id, beat_name').eq('is_active', true).order('beat_name')`. Destination list filters out the chosen source id client-side.
- **Source retailers**: when source beat selected — `supabase.from('retailers').select('id, name').eq('beat_id', sourceBeatId).order('name')`. Show spinner while loading. Empty state: "No retailers found in this beat."
- All queries via the shared `@/integrations/supabase/client`.
- React state holds: `sourceBeatId`, `destBeatId`, `availableRetailers`, `selectedRetailers` (moved to right pane), `leftSearch`, `rightSearch`, `leftChecked` (checkbox set for current move), `rightChecked`, `isLoadingRetailers`, `isTransferring`.

## 5. Transfer logic

On confirm:

1. `supabase.auth.getUser()` → `transferred_by`.
2. `UPDATE retailers SET beat_id, beat_name, updated_at = now() WHERE id IN (...)` via `.update().in('id', ids)`.
3. `INSERT` one row per retailer into `retailer_beat_transfer_history` with from/to beat id+name and `transferred_by`.
4. On success: refetch source-beat retailers, clear right pane and selections, toast "X retailers transferred successfully."
5. On any error: `toast.error(err.message)` and keep state intact.

## 6. Confirmation modal

Standard `Dialog` with title "Confirm Transfer", body "Are you sure you want to move X retailers from {Source} to {Destination}? This action cannot be undone.", buttons `Cancel` / `Confirm Transfer`. Confirm button shows spinner while `isTransferring`.

## 7. Validation rules

- Transfer button disabled unless source + destination + ≥1 retailer in right pane.
- If user picks the same beat for destination, show inline destructive helper text under the Destination select and block the modal.
- Empty source beat → empty-state message in left card.
- All Supabase errors surfaced via `toast.error`.

## 8. Loading & disabled states

- Left card shows a centered spinner while retailers load.
- Confirm button shows spinner + "Transferring…" while running.
- During transfer, disable both dropdowns, move buttons, search inputs, and cancel.

## 9. Non-goals / constraints

- No edits to `beats`, `retailers`, or any existing component/page.
- No mock data; everything from Supabase.
- Strict TypeScript types for `Beat`, `Retailer`, `TransferHistoryRow`.
- Uses semantic Tailwind tokens already in the design system (no raw colors).

## Phasing

1. Run the migration.
2. After approval, regenerate Supabase types (auto), then build `useMassBeatTransfer.ts`, `MassBeatTransfer.tsx`, and register the route.
3. Smoke test: pick a beat, move retailers, confirm DB rows in both `retailers` and `retailer_beat_transfer_history`.