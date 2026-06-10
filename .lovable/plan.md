## Problem

In `ApprovalChecklistDialog.tsx`, each FieldCard shows `ok = autoOk || manual`. When the underlying retailer data already satisfies the check (e.g. name present, phone valid, address present, GPS captured), `autoOk` is `true`. Clicking the checkbox only flips the `manual` flag — which has no visible effect because `ok` stays `true`. Result: the card looks "stuck checked" and the user thinks the UI is broken.

## Goal

Make the checkbox state honest and intuitive:
- If the field is auto-verified from data → show as checked, **lock it** (disabled), and label it "Auto-verified" so the user understands why it can't be unchecked.
- If the field is NOT auto-verified → checkbox is freely toggleable (check = manual override grants the weight, uncheck = removes it).

## Changes (single file: `src/components/retailer/ApprovalChecklistDialog.tsx`)

1. **FieldCard component**
   - Disable the checkbox and remove the card's click/keyboard handler when `autoOk === true`.
   - Show a small "Auto-verified" pill (instead of "Manually verified by you") when `autoOk` is true.
   - Keep "Manually verified by you" only when `manual && !autoOk`.
   - Adjust hover/cursor styling: `cursor-default` when auto-verified, `cursor-pointer` otherwise.

2. **Tip text above the grid**
   - Update to: "Click any unchecked field to manually verify it. Auto-verified fields are locked."

3. **No scoring or data changes** — auto fields already contribute their weight; manual override only adds weight for fields not auto-satisfied.

## Out of scope
- No changes to weights, approval gating, duplicate logic, or DB writes.
- No changes to risk-indicator pills at the top (those are read-only by design).
