## Fix retailer count on beat cards

Edit only `src/pages/MyBeats.tsx`. No UI, layout, or other logic changes.

### Change 1 — Cached count branch (~lines 309–320)
Remove the `effectiveUserIds.includes(r.user_id)` filter when building the cached retailer count map. Keep filtering out null/empty/`'unassigned'` `beat_id`. Also restrict to the user's visible beats by `beat_id` (text) so cross-user beats don't leak in.

### Change 2 — Online count branch (~lines 368–374)
Replace the retailer fetch:

```ts
.from('retailers')
.select('beat_id')
.in('user_id', effectiveUserIds)
.not('beat_id', 'is', null)
.neq('beat_id', '')
.neq('beat_id', 'unassigned');
```

with a query scoped by the beat text IDs, with no `user_id` filter:

```ts
const beatTextIds = beatsData.map(b => b.beat_id).filter(Boolean);
.from('retailers')
.select('beat_id')
.in('beat_id', beatTextIds.length ? beatTextIds : ['__none__']);
```

The existing `retailerCountMap` already keys by `item.beat_id` (text) and is looked up via `beat.beat_id` — that join is correct and stays as-is.

### Why this fixes it
- Retailers like Nayak Stores and Ajay Stores have different `user_id`s than the beat's owner, so the old `.in('user_id', effectiveUserIds)` filter dropped them and produced `0`.
- Counting by `retailers.beat_id = beats.beat_id` (text) with no user scoping returns all retailers truly assigned to that beat → "Betora Goa Main" shows 2.

### Out of scope
BeatCard rendering, active/inactive filter, stats cards, realtime subscriptions, and all other queries remain untouched.