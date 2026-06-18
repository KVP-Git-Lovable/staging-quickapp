## What the toast means

`Could not find a relationship between 'beat_user_access' and 'beats' in the schema cache` comes from this query inside `BeatTransferModal.tsx`:

```ts
supabase
  .from("beat_user_access")
  .select("beat_id, access_type, effective_to, beats!beat_user_access_beat_id_fkey(...)")
```

PostgREST needs a real foreign key (`beat_user_access.beat_id → beats.id`) to embed `beats(...)`. I checked the DB — **`beat_user_access` has no foreign keys at all**, so the embed always fails and the toast fires every time the modal opens.

## Is the relationship required for Beat Exchange?

**No.** The modal still loads beats you **own** (separate query against `beats.user_id = me`), and the swap / confirm path doesn't use the embed. The only thing this query adds is beats that were **shared with you** via `beat_user_access` (CO_OWNER / OPERATIONAL access). For owners-only setups, exchange already works — the toast is just noise.

If you do want shared beats to appear in the dropdowns, we don't need to add an FK. We can fetch in two safe steps.

## Fix (one file: `src/components/BeatTransferModal.tsx`)

Replace the failing embedded query with a two-step fetch:

1. `select("beat_id, access_type, effective_to")` from `beat_user_access` (no embed).
2. If any rows come back, `select("id, beat_id, beat_name").in("id", sharedBeatIds).eq("is_active", true)` from `beats`.
3. Merge with owned beats exactly like today.

Also wrap that block in try/catch so a `beat_user_access` permission error never blocks owned beats from loading.

Result: no more schema-cache toast, shared beats still appear, and Beat Exchange (including the new Unassigned option) works the same.

## Out of scope

- No DB schema/FK changes.
- No changes to the exchange / confirm logic or the Unassigned feature.
