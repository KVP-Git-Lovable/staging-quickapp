## My Beats — Stats & Filter Enhancements

The page already has a tab/segmented control (Active / Inactive / All) and `beats` is loaded fresh from the DB on every load + realtime reload on retailer/beat_plan changes. We will keep that infrastructure and only adjust the stats row + unassigned logic.

### 1. Stats row (replace current 4-card grid)

Render 6 stat cards in `grid-cols-2 md:grid-cols-3 lg:grid-cols-6`, all derived from the freshly-loaded `beats` / `allRetailers` arrays (DB-backed):

| Card | Source |
|---|---|
| Total Beats | `beats.length` |
| Active Beats | `beats.filter(b => b.is_active !== false).length` |
| Inactive Beats | `beats.filter(b => b.is_active === false).length` |
| Beats with No Retailer | `beats.filter(b => b.retailer_count === 0).length` |
| Total Retailers | `allRetailers.length` |
| Avg per Beat | `round(totalAssignedRetailers / beats.length)` |

Separate highlighted card (orange, full-width on mobile, spans 2 cols on desktop, placed under the 6-card row):

- **Unassigned Retailers** = `allRetailers.filter(r => !r.beat_id || r.beat_id === '' || r.beat_id === 'unassigned' || !beats.some(b => b.id === r.beat_id))`

That last clause covers retailers pointing to a deleted/orphan beat. Retailers on inactive beats are NOT counted as unassigned (their beat still exists), satisfying "retailers assigned to inactive beats remain visible under those inactive beats".

Clicking the card opens the existing `statsDetailDialog === 'unassigned'` dialog (already implemented) and lists those retailers.

### 2. Tabs / filter (already present)

Keep the existing `ToggleGroup` for Active / Inactive / All beats. Default remains `'active'`. No DB query change needed — `beats` already holds all rows; `filteredBeats` slices by `is_active`.

Ensure the header label updates from `Your Beats (X of Y)` to reflect the active tab clearly:
`Active Beats (X) / Inactive Beats (X) / All Beats (X)`.

### 3. Live refresh

Already handled: the existing `supabase.channel('beats-updates')` subscribes to `retailers` + `beat_plans` postgres_changes and calls `loadBeats()` + `loadAllRetailers()`. We additionally subscribe to the `beats` table so create/deactivate/reactivate refresh counts automatically:

```ts
.on('postgres_changes', { event: '*', schema: 'public', table: 'beats',
    filter: `user_id=eq.${user.id}` }, () => { loadBeats(); loadAllRetailers(); })
```

### 4. Files touched

- `src/pages/MyBeats.tsx` — replace stats grid (~lines 1324–1368), tweak header label (~1669), add `beats` realtime channel (~237–269). No other files.

### Out of scope

No DB migration, no changes to BeatCard, EditBeat, transfer logic, or retailer listing UI under each beat.
