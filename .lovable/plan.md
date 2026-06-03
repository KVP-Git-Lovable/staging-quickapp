## Plan: Apply 5 audit fixes to beat management

### Code fixes

**1. `src/services/beatService.ts` — `resolveBeatTextId` (line 50)**
Change `.eq('id', beatId)` → `.eq('beat_id', beatId)` so it queries the text beat_id column.

**2. `src/services/beatService.ts` — `transferBeatOwnership` (line 244)**
Change `.eq('id', beatId)` → `.eq('beat_id', beatId)` in the initial beat fetch.

**3. `src/pages/MyBeats.tsx` — `deactivateBeat` state cleanup**
- Line 197: extend state type with `beat_id: string`.
- Line 962 + line 1229: include `beat_id: beatId` when calling `setDeactivateBeat`.
- Line 2429: change `beat_id: deactivateBeat.id` → `beat_id: deactivateBeat.beat_id`.

**4. `src/pages/MyBeats.tsx` — Implement Clone Beat (line 1798)**
Replace `onClone={() => toast.info('Clone Beat — coming soon')}` with a real handler that:
- Prompts for a new name (defaulting to `${beat.name} (Copy)`).
- Calls `beatService.cloneBeat(beat.id, newName, user!.id)`.
- Toasts success/error and reloads beats via `loadBeats()`.

### Database fix (Fix 5)

Run an `UPDATE profile_object_permissions` for:
- **Sales Manager**: enable `can_read/can_create/can_edit` on `action_beat_share`, `action_beat_coverage`, `action_beat_transfer`, `action_beat_reactivate`, `action_beat_clone`.
- **Field Sales Executive**: same flags on `action_beat_share`, `action_beat_reactivate`, `action_beat_clone`.

Since this is data (not schema), I'll use the data-insert/update path. After applying, run the verification SELECT and report row counts back.

### Verification
- After the code changes, the build runs automatically; no behavior validation possible from my side beyond compile success.
- After the DB update, run the verification `SELECT sp.name, pop.object_name, pop.can_create ...` query and report results.
- The 3 runtime DB count checks (Share / Coverage / Transfer) require you to exercise the UI as the user — I'll report back what I can verify on my side.

No other files touched. Scope is exactly the 5 fixes listed.