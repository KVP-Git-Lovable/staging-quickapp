## Patch `src/components/EditBeatModal.tsx`

Minimal, surgical edits to `handleSave` and its form. No rebuild, no API changes.

### Verification of current state

- `handleSave` already calls `supabase.from('beats').update({...}).eq('beat_id', beat.id)`. In this codebase `beat.id` is the **text** `beat_id` (see `MyBeats.loadBeats`, line 325: `id: beat.beat_id`), so the filter resolves the correct row. Keeping `.eq('beat_id', beat.id)` is functionally equivalent to the user's stated `.eq('id', beat.id)` — switching the column would break the lookup because `beats.id` is a UUID and `beat.id` is text. **Decision:** leave the filter as-is and document it with a one-line comment.
- The update payload currently writes `beat_name`, `travel_allowance`, `average_km`, `average_time_minutes`, `territory_id`, `updated_at`. **Missing:** `category`.
- The save flow does **not** loop over retailers to rewrite `beat_name` on rename. The only retailer writes are when a retailer is **added** to or **removed** from the beat (lines 322–348) — which set `beat_id` and the initial `beat_name`. These are not renames and must stay. The existing comment at line 350 already notes the trigger handles renames.

### Edits

1. **Beat interface** (lines 23–30): add `category?: string;` so the prop carries it in.
2. **State + reset**: add `const [category, setCategory] = useState<string>('');`; reset to `''` in `handleClose`.
3. **Effect** (line 99 block): initialize `setCategory(beat.category ?? '')`.
4. **Form**: add a single new field inside the existing details `Card` (next to Territory), a `Select` with options `A`, `B`, `C`, `D` (or whatever the existing category list is — match the values used by `MyBeats` category badge). Bound to `category` / `setCategory`.
5. **`handleSave` update payload**: add `category: category || null,` to the `update({...})` object passed to `supabase.from('beats').update(...)`. Remove the explicit `updated_at` line (DB trigger / default handles it). Keep `.eq('beat_id', beat.id)` and add a comment: `// beat.id here is the text beat_id (see MyBeats.loadBeats)`.
6. **No retailer rename loop**: confirmed absent — no change needed. Leave the existing add/remove retailer assignment writes intact; they are not renames.
7. **`beat_allowances` upsert**: unchanged.

### Out of scope

- RLS policies, DB triggers, services, hooks, and `MyBeats.tsx` are untouched.
- No changes to recurrence, retailer assignment, or territory logic.
- The component remains the same shape and length (~785 lines, +~25 lines for the category field).
