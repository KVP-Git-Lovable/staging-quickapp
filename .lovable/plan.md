# Fix: Native Browser Dialog on Beat Delete

## Root cause

In `src/pages/BeatDetail.tsx` (line 530), when a beat has historical records and can't be hard-deleted, the code uses:

```ts
const confirmed = window.confirm(`"${beatData.beat_name}" has historical records...`);
```

`window.confirm` is a browser-native API, so Chrome renders it as the OS-style "preview--bharat-sales-spark.lovable.app says" popup — unstyled, no branding, no theme. That's the dialog in your screenshot.

The rest of the app uses shadcn `AlertDialog` / `Dialog` (e.g. `DeleteConfirmDialog.tsx`, `DeactivateBeatWizard.tsx`) for confirmations, so this one path is inconsistent.

## Fix

Replace the `window.confirm` call with an in-app shadcn `AlertDialog` styled like the rest of the beat modals (with the blue info banner pattern we just rolled out).

### Changes to `src/pages/BeatDetail.tsx`

1. Add state to hold the "cannot delete, deactivate instead?" prompt:
   - `cannotDeleteOpen: boolean`
   - `cannotDeleteReasons: string[]`

2. Split `handleDeleteClick` so the pre-check still calls `can_delete_beat`, but instead of `window.confirm(...)` it sets the state and opens the new dialog. The actual deactivation logic moves into a new `handleConfirmDeactivate` handler triggered by the dialog's confirm button.

3. Render a new `<AlertDialog>` (or `<Dialog>`) at the bottom of the component:
   - Title: "Cannot permanently delete this beat"
   - Blue info banner (same `bg-blue-50 border-blue-200` pattern as CoverageModal/EditBeatModal) explaining: historical data is preserved; deactivation only hides the beat from active views.
   - Body lists the reasons returned by `can_delete_beat` as bullet points (retailers assigned, visit records, beat plans, etc.).
   - Footer: "Cancel" + "Deactivate beat" (orange, matches DeactivateBeatWizard styling), with loading state from `isDeleting`.

4. No changes to RPC, permissions, DB, or the happy-path delete flow (which already uses an in-app modal further down).

## Out of scope

- No changes to `MyBeats.tsx` clone prompt (separate issue, not asked).
- No backend / RPC changes.
- No changes to the existing in-app delete modal that appears when the beat *is* deletable.

## Technical notes

- Reuse the existing `AlertDialog` primitives from `@/components/ui/alert-dialog` already imported elsewhere in the project.
- Keep the `Info` icon + blue banner pattern consistent with the other beat modals updated earlier in this conversation.
