## Goal

Mirror the help affordances we added to **Assign Coverage** (`CoverageModal.tsx`) — a blue info banner at the top of the dialog plus a contextual `Info` tooltip — across the rest of the beat-menu actions so each modal explains what it does and how it differs from the others.

## Scope (per modal)

Each modal gets:
1. A blue info banner directly under `DialogHeader` (same style as CoverageModal: `bg-blue-50 border-blue-200 text-blue-900` block with a one-line "What this does" + a short note on when to use it vs. its sibling actions).
2. An `Info` (lucide) icon next to the most confusing field/label, wrapped in `TooltipProvider/Tooltip/TooltipTrigger/TooltipContent`, explaining that field.

Imports added where missing: `Info` from `lucide-react`, `Tooltip*` from `@/components/ui/tooltip`.

### 1. `src/components/EditBeatModal.tsx` — Edit Beat
- Banner: "Edit this beat's name, area, schedule, and assigned rep. Changes apply immediately to all retailers in this beat. Use Clone Beat if you want a copy instead of modifying the original."
- Tooltip on the **Assigned Rep** field: explains that changing the rep here permanently reassigns ownership — for short-term cover use Assign Coverage; for permanent handover with audit trail use Transfer Ownership.

### 2. `src/components/ShareBeatModal.tsx` — Share Beat
- Banner: "Sharing gives another rep ongoing joint access to this beat. Both reps can visit retailers and place orders. For temporary leave/absence cover only, use Assign Coverage instead."
- Tooltip on the **Permission level / shared user** label: explains the difference between View, Edit, Full — and that the original owner keeps ownership.

### 3. `src/components/TransferOwnershipModal.tsx` — Transfer Ownership
- Banner: "Transferring permanently moves this beat to a new owner. The previous owner loses access unless also added via Share Beat. Use Assign Coverage for short-term absences; use Share Beat for ongoing joint access."
- Tooltip on the **New Owner** field: notes the change is logged in beat history, all retailers/visits/orders stay attached, and the transfer cannot be auto-reverted (a new transfer is required).

### 4. `src/components/BeatHistoryDrawer.tsx` — View History
- Banner: "Read-only timeline of every change to this beat — ownership transfers, coverage assignments, shares, retailer transfers, edits, and (de)activation. Useful for audits and dispute resolution."
- Tooltip on the timeline header: explains entry types and that timestamps are in local time.

### 5. Clone Beat (out of scope, noted)
Clone currently uses `window.prompt(...)` from `MyBeats.tsx` (line 1939) — there is no modal to add a banner to. Leaving as-is unless you want it converted to a proper dialog in a follow-up.

## Out of scope

- No logic changes to any modal — banners/tooltips only.
- No changes to `BeatCard.tsx` dropdown items.
- No changes to permissions, RPCs, or DB.

## Files changed

- `src/components/EditBeatModal.tsx`
- `src/components/ShareBeatModal.tsx`
- `src/components/TransferOwnershipModal.tsx`
- `src/components/BeatHistoryDrawer.tsx`
