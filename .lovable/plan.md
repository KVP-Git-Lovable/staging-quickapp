## Plan: Scenario 9 — Duplicate Beat Name Validation

Implements full duplicate/near-duplicate beat name detection with a warning dialog, async DB check across the org, and a DB unique-index safety net.

### 1. New component: `src/components/DuplicateBeatWarningDialog.tsx`

Create the dialog exactly as specified:

- Props: `open`, `onOpenChange`, `beatName`, `matchType` (`exact_own | exact_other | near_own | near_other`), optional `existingOwnerName`, `matchedBeatName`, plus `onConfirm` / `onCancel`.
- Red `AlertTriangle` header + "Duplicate Beat Name Detected" for exact matches; amber "Similar Beat Name Found" for near matches.
- Four message variants (own/other × exact/near) using the exact copy from the spec.
- Extra muted note shown for `exact_other` and `near_other`: "If you proceed, two beats with the same name will exist…".
- Footer: `Cancel — Edit Name` (outline) and `Create Anyway` / `Yes, Create Beat` (destructive for exact, default for near).

### 2. `src/pages/MyBeats.tsx` changes

**Imports (top of file)**

- Add `import { DuplicateBeatWarningDialog } from "@/components/DuplicateBeatWarningDialog";`

**Helpers (module scope, above the component)**

- Add `levenshtein(a, b)` per spec.
- Add `async function checkBeatNameDuplicate(name, currentUserId, distributorId)` that:
  - Queries `beats` (`beat_name, user_id, profiles:user_id(full_name, name)`) where `is_active = true`, scoped by `distributor_id` when provided.
  - Returns `exact_own` / `exact_other` on case-insensitive exact match.
  - Otherwise returns `near_own` / `near_other` when Levenshtein distance ≤ 2 OR (length ≥ 4 AND one name contains the other).
  - Returns `null` when nothing matches.  
  IMPORTANT BUSINESS RULE CHANGE  
    
  Scenario 9 Approved with one business rule change:  
    
  Option A is approved.  
    
  Business Rule:  
    
  - Exact duplicate Beat names are NOT allowed.  
  - Near duplicate Beat names should show a warning only and allow the user to continue.  
    
  Please update the implementation accordingly:  
    
  1. For exact_own and exact_other:  
   - Show the red duplicate warning dialog.  
   - Do NOT allow "Create Anyway".  
   - Show only "Edit Name".  
   - Message should clearly state that exact duplicate Beat names are not allowed.  
    
  2. For near_own and near_other:  
   - Show the amber warning dialog.  
   - Allow "Edit Name" and "Yes, Create Beat".  
   - User may continue after acknowledging the warning.  
    
  3. Keep the database UNIQUE indexes exactly as proposed. The database must reject exact duplicate Beat names even if UI validation is bypassed.  
    
  Everything else in Scenario 9 is approved.

**State (near other dialog state, ~line 197)**

- Add `duplicateWarning` state with shape `{ matchType, existingOwnerName?, matchedBeatName?, proceedCallback }`.

**Refactor `handleSaveBeat` (~lines 643–end of function)**

- Keep the early validations (name required, repeat-related checks, `if (!user) return`).
- Remove the existing local `beats.find(...)` duplicate check (lines 649–657).
- After validations, call `checkBeatNameDuplicate(beatName.trim(), user.id, (user as any).distributor_id ?? null)`.
  - If a result is returned, `setDuplicateWarning({ ...result, proceedCallback: async () => { setDuplicateWarning(null); await proceedWithBeatCreation(); } })` and `return`.
  - Otherwise call `await proceedWithBeatCreation()`.
- Extract everything currently inside the `setIsCreating(true)` try/catch/finally (beat insert → retailer update → beat allowance / plan creation, etc.) into an inner `const proceedWithBeatCreation = async () => { … }` that preserves all existing behavior unchanged.

**JSX (near the other dialogs, ~line 2480+)**

- Render `<DuplicateBeatWarningDialog … />` when `duplicateWarning` is set, wired to `beatName`, the stored match info, `proceedCallback` for confirm, and a cancel handler that clears the state.

### 3. Database safety net (migration)

Create two partial unique indexes on `public.beats`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_beats_unique_name_distributor
  ON beats (LOWER(beat_name), distributor_id)
  WHERE is_active = true AND distributor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_beats_unique_name_user
  ON beats (LOWER(beat_name), user_id)
  WHERE is_active = true AND distributor_id IS NULL;
```

Run via `supabase--migration`. If existing data already contains duplicates the index creation will fail — in that case I'll surface the conflicting rows so you can decide whether to deactivate/rename them before retrying. No other schema or RLS changes.

### 4. Verification

- Type-check via the auto build.
- Manually walk the 4 scenarios in `/my-beats`:
  1. Exact own → red dialog, "already exists under your account".
  2. Exact other-user → red dialog with owner name + extra warning note.
  3. Near match (e.g. "North Zon" vs "North Zone") → amber "Similar Beat Name Found".
  4. Unique name → no dialog, beat creates immediately.

### Notes / assumptions

- `user.distributor_id` may not exist on the current `useAuth` user shape; I'll read it defensively as `(user as any).distributor_id ?? null` exactly as the spec implies, so the org-wide check still works when it's absent (falls back to all active beats and to the per-user unique index).
- The `profiles:user_id(...)` join assumes the existing FK from `beats.user_id` → `profiles`. If PostgREST can't resolve it I'll fall back to a second lookup against `profiles` by `user_id`, keeping the same dialog output.
- No other files, business logic, or styling are touched.