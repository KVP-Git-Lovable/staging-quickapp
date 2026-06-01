## Fix: use `beats.beat_id` (text) as the retailer join key

`BeatTransferModal.tsx` currently joins retailers on `beats.id` (UUID). Retailers actually store `beats.beat_id` (text), so the source list is always empty.

### Changes (single file: `src/components/BeatTransferModal.tsx`)

1. **`Beat` type** — add `beat_id`:
   ```ts
   interface Beat { id: string; beat_id: string; beat_name: string; }
   ```
2. **Beats query** — select all three columns:
   ```ts
   .from("beats").select("id, beat_id, beat_name").eq("is_active", true)
   ```
3. **Select value** — keep using `b.id` (UUID, guaranteed unique) for the `<Select>` value so the dropdown stays stable. Look up the full beat via `beats.find(b => b.id === sourceBeatId)` (already done).
4. **Retailers query** — use the resolved `sourceBeat.beat_id` text:
   ```ts
   .from("retailers").select("id, name, beat_id, beat_name")
     .eq("beat_id", sourceBeat.beat_id)
   ```
   Change the effect's dependency to re-run when `sourceBeat?.beat_id` changes, and guard on `sourceBeat` being resolved.
5. **Transfer UPDATE** — write the text key:
   ```ts
   .update({ beat_id: destBeat.beat_id, beat_name: destBeat.beat_name, updated_at: ... })
   .in("id", ids)
   ```
6. **History insert** — log text ids:
   ```ts
   from_beat_id: sourceBeat.beat_id,
   to_beat_id:   destBeat.beat_id,
   ```

No UI, layout, styling, or other logic changes.
