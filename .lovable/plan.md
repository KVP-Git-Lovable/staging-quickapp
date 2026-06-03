## Status check

- ✅ `username` fix in `checkBeatNameDuplicate` (line 137 + both owner-name fallbacks at 149/165) is already applied.
- ❌ Dialog-stacking fix is **not** applied yet. `handleSaveBeat` (lines 848–862) sets `duplicateWarning` while the Create Beat `<Dialog open={isCreateBeatOpen}>` is still open, so the warning renders behind it and the user sees nothing happen.

## Fix (single edit, `src/pages/MyBeats.tsx`, lines 848–862)

Close the Create Beat dialog first, then open the warning after a short delay so Radix's exit animation completes and the warning portal sits on top cleanly.

```ts
if (duplicateResult) {
  const isExact =
    duplicateResult.matchType === 'exact_own' || duplicateResult.matchType === 'exact_other';
  setIsCreateBeatOpen(false);
  setTimeout(() => {
    setDuplicateWarning({
      ...duplicateResult,
      proceedCallback: isExact
        ? () => setDuplicateWarning(null)
        : async () => {
            setDuplicateWarning(null);
            await proceedWithBeatCreation();
          },
    });
  }, 150);
  return;
}
```

No other changes needed — `proceedWithBeatCreation`, the warning-dialog component, and the username join are already correct.

### Verification
- Type `Udupi` → click Create Beat → Create dialog closes → red "Duplicate Beat Name Not Allowed" dialog appears with `Existing owner: Prabhu KVP` and only an Edit Name action.
- Type a brand-new name → no warning, beat creates as before.
- Type a near-match → Create dialog closes → amber "Similar beat found" with Cancel + Create Anyway. Clicking Create Anyway calls `proceedWithBeatCreation`.
