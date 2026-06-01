## Fix: "To Beat" panel should list retailers currently in the destination beat

Right now the right column is just a staging list ("Selected for Transfer"). When the user picks a destination beat (e.g. `surathkal`) it display existing retailers in the destination beat, and visually append items being transferred.

### Scope

Single file: `src/components/BeatTransferModal.tsx`. No DB, no other UI.

### Changes

1. **New state**
  - `existingDest: Retailer[]` — retailers already in destination beat (read-only baseline).
  - `loadingDest: boolean`.
2. **Fetch destination retailers**
  - New `useEffect` keyed on `destBeat?.beat_id`. When destination is cleared, reset `existingDest` to `[]`.
  - Query:
    ```ts
    supabase.from("retailers")
      .select("id, name, beat_id")
      .eq("beat_id", destBeat.beat_id)
      .order("name");
    ```
3. **Right panel rendering**
  - Header: `Retailers in {destBeat?.beat_name || "—"} ({existingDest.length + selected.length})`.
  - List shows two groups inside the same scroll area:
    - **Existing** (rendered first, muted styling, no checkbox / no remove button, small "current" badge).
    - **Pending transfer** (rendered after a thin divider with label "Pending transfer (n)") — these are the `selected[]` items; keep the existing remove / checkbox affordances so the user can un-stage them.
  - Pagination + search filter apply to the combined list (existing first, then pending). Empty state: "No retailers in this beat yet." when both groups empty and a destination is chosen; current "Select a destination beat" hint when none chosen.
  - Keep "Clear all" button — only clears `selected[]`, never `existingDest`.
4. **Move / transfer logic**
  - Unchanged. `selected[]` is still the only thing the Transfer action writes. Existing retailers also should be able to be moved 
  - Guard: prevent staging a retailer whose `id` is already in `existingDest` (defensive — same beat is already blocked, but cheap to check).
5. **Reset rules**
  - On modal close and on destination change: clear `selected[]`, `rightChecked`, `rightPage = 1`, refetch `existingDest`.
  - On successful transfer (`onSuccess`): close modal as today; no extra refresh needed here.

### Out of scope

- Left panel, From-Beat select, transfer SQL, history insert, styling tokens, and all other modals remain untouched.