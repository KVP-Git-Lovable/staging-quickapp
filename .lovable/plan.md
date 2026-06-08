Add edit-end-date to each row in **Current shares** (ShareBeatModal), mirroring CoverageModal.

### Edit `src/components/ShareBeatModal.tsx`

1. Import `Pencil` from `lucide-react`.
2. Add state: `editingShareId`, `editEndDate`, `savingEdit`.
3. Add `saveEditDate(row)` — updates `beat_user_access.effective_to` to `YYYY-MM-DD 23:59:59` ISO; on success `loadShares()`.
4. Row UI: when editing, show inline `<input type="date">` (min = today) + Save / ✕. Otherwise add a Pencil icon-button next to **Revoke** (works for both permanent and until shares; lets user set/change end date).

No service or DB changes.