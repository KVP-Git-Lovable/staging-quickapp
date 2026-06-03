## Goal
Create `DeactivateBeatWizard` to replace the current delete action on My Beats. It guides the user through handling retailers, then deactivates the beat.

## New file
`src/components/DeactivateBeatWizard.tsx`

A controlled Dialog with two-step wizard state (`step: 1 | 2`).

### Props
```ts
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beat: { id: string; beat_id: string; beat_name: string };
  retailerCount: number;
  userId: string;
  onSuccess: () => void;   // parent reloads beats
}
```

### Internal data fetched on open
- Retailers on this beat: `supabase.from('retailers').select('id, name').eq('beat_id', beat.beat_id)`
- Active destination beats (excluding current): `supabase.from('beats').select('id, beat_id, beat_name').eq('is_active', true).neq('id', beat.id)` (scoped by `user_id = userId` to keep it to user's own beats)

### Step 1 — Retailer handling
If `retailerCount === 0`: skip directly to Step 2 (set step=2 in the load effect).

Otherwise show RadioGroup with 3 options:
1. `keep` — "Keep retailers attached" (default)
2. `transfer_all` — "Transfer all retailers" + Select dropdown of destination beats
3. `transfer_selected` — "Transfer selected retailers" + checkbox list of retailers + Select dropdown of destination beats

Validation to enable Next:
- `keep` → always valid
- `transfer_all` → destination chosen
- `transfer_selected` → ≥1 retailer checked AND destination chosen

Buttons: [Cancel] [Next]

### Step 2 — Confirmation summary
Plain-language summary derived from Step 1 state:
- "Beat **{beat_name}** will be marked **Inactive**."
- If transferring: "**{N}** retailer(s) will move to **{destBeatName}**."
- If keep: "**{retailerCount}** retailer(s) will remain attached."

Buttons: [Back] [Confirm Deactivate] (loading state while submitting)

### On Confirm
1. If mode is `transfer_all` or `transfer_selected`:
   - `await beatService.transferRetailers(retailerIds, beat.id, destBeatId, userId, 'Beat deactivation')`
   - `retailerIds` = all retailers (transfer_all) or checked subset
2. `await beatService.deactivateBeat(beat.id, userId)`
3. `toast.success('Beat deactivated')`
4. `onSuccess()` and close dialog
5. Catch → `toast.error(err.message)`, keep dialog open

## Wire-up in `src/pages/MyBeats.tsx`
- Import `DeactivateBeatWizard`.
- Add state: `deactivatingBeat: AnnotatedBeat | null`.
- Replace whatever currently handles the "Deactivate Beat" menu action on `BeatCard` (the `onDeactivate` / delete callback) so it sets `deactivatingBeat` instead of calling delete.
- Render `<DeactivateBeatWizard open={!!deactivatingBeat} onOpenChange={(o)=>!o&&setDeactivatingBeat(null)} beat={...} retailerCount={deactivatingBeat?.retailer_count ?? 0} userId={user.id} onSuccess={loadMyBeatsAndStats} />`.

## Out of scope
- No changes to `beatService` (uses existing `transferRetailers` and `deactivateBeat`).
- No changes to `BeatCard` menu structure or permissions matrix.
- No edits to `BeatDeleteDialog` (kept for the separate inactive-beat hard delete path).
- No DB / RLS / migration changes.
- No edits to `types.ts`.

## UI/UX notes
- Use existing shadcn `Dialog`, `RadioGroup`, `Select`, `Checkbox`, `ScrollArea`, `Button`.
- Use semantic design tokens only; no hardcoded colors.
- Disable destructive Confirm button while async work is pending.
