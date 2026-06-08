## Goal

When a user adds a retailer to a beat they do **not own** (shared / coverage beat), the retailer should be owned by the **beat owner**, not the current user. This keeps retailers attached to the beat owner after coverage ends — no orphaned retailers.

## Current behaviour (bug)

`src/pages/AddRetailer.tsx`:

- Beats dropdown only loads beats where `created_by = user.id` (line 258), so today a covering user can't even add retailers on a shared beat from this page. Once we relax that, the next problem appears:
- The insert payload always sets `payload.user_id = user.id` (line 838) and uses the form-picked `owner_id`/`owner_name` (lines 806–807) — there's no awareness of who actually owns the beat.
- `created_by` is never written, so we lose audit of who physically added the row.

The `retailers` table already has all four columns we need: `user_id`, `owner_id`, `owner_name`, `created_by` (confirmed via schema check).

## Fix (single file: `src/pages/AddRetailer.tsx`)

### 1. Load beats the user can add retailers on (not just owned)

In `loadBeats` (around lines 255–283), replace the strict `created_by = user.id` query with two parallel queries and merge:

```ts
const nowIso = new Date().toISOString();

const [ownedRes, accessRes] = await Promise.all([
  supabase
    .from('beats')
    .select('beat_id, beat_name, user_id, created_by, owner_name, is_active, id')
    .eq('created_by', user.id)
    .eq('is_active', true),
  supabase
    .from('beat_user_access')
    .select('access_type, beat_id, effective_from, effective_to, is_active, beats:beats!beat_user_access_beat_id_fkey(beat_id, beat_name, user_id, created_by, owner_name, is_active, id)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .or(`effective_to.is.null,effective_to.gt.${nowIso}`),
]);
```

Merge into one deduped list (owned wins). Filter `accessRes` rows to access types that grant write (`OWNED`, `CO_OWNER`, `OPERATIONAL`, `COVERAGE`) — exclude `VIEW_ONLY`. Keep the existing IndexedDB cache path; extend the cached `beats` records with the same fields (`user_id`, `owner_name`).

Update the `beats` state type (line 112) to include `user_id?: string` and `owner_name?: string | null`.

### 2. Set retailer ownership based on the selected beat

In the create branch (around lines 783–839), compute owner from the selected beat:

```ts
const selectedBeatRow = beats.find(b => b.beat_id === beatId);
const beatOwnerUserId = selectedBeatRow?.user_id ?? user.id;
const beatOwnerName   = selectedBeatRow?.owner_name ?? null;
const isOwnBeat       = beatOwnerUserId === user.id;
```

Then in the payload:

```ts
// Always tracks who physically added it (audit trail)
payload.created_by = user.id;

// Form-picked owner takes priority (manual override),
// otherwise: own beat -> current user; shared beat -> beat owner
payload.owner_id   = selectedOwnerId || (isOwnBeat ? user.id : beatOwnerUserId);
payload.owner_name = selectedOwnerName || (isOwnBeat ? currentUserName : beatOwnerName);

// user_id (row-owner used by RLS / "my retailers" filters) follows the beat owner
payload.user_id    = isOwnBeat ? user.id : beatOwnerUserId;
payload.status     = 'active';
```

`currentUserName` already exists in the component (used elsewhere for owner pickers); if not, derive from the existing profile fetch.

Leave the **edit** branch (lines 810–826) alone — editing an existing retailer should not silently change ownership.

### 3. UI hint (small, optional but recommended)

When `!isOwnBeat`, show a one-line muted note under the Beat selector:

> "This beat is owned by {beatOwnerName}. The new retailer will be assigned to them; you'll remain recorded as the creator."

Keeps user expectation aligned with what we just changed.

## Out of scope

- No DB migration, no RLS change, no edge function.
- No change to `BeatDetail.tsx` (already fixed in the previous round).
- The offline-create path (`createRetailer` in the offline service) already accepts the payload as-is, so the new fields flow through both online and offline inserts.

## Verification

1. Log in as a user who has a **coverage / shared** assignment on Bejai2.
2. Bejai2 now appears in the AddRetailer beat dropdown.
3. Add a retailer "Test Store" on Bejai2.
4. DB row for "Test Store":
   - `user_id` = Bejai2 owner (Abhishek), not the current user.
   - `owner_id` / `owner_name` = Abhishek.
   - `created_by` = current user.
5. After coverage expires and the recipient loses access, "Test Store" still belongs to Abhishek and remains visible to him.
6. Adding a retailer on a beat the user **owns** behaves exactly as before — `user_id` / `owner_id` = current user, `created_by` = current user.
