## Status check

- **Fix 1 — beat_plans merged into chips**: ALREADY IMPLEMENTED. `src/hooks/useCalendarData.ts` lines 206–215 iterate `beatPlansRes.data` and push `source: "permanent"` chips with de-dup against daily plans via the `push()` helper.
- **Fix 2 — shared beats from `beat_user_access`**: NOT IMPLEMENTED. No query on `beat_user_access`, no shared-chip generation across the month.

## Plan — add shared-beat chips

Edit `src/hooks/useCalendarData.ts`:

1. Add `eachDayOfInterval` to the `date-fns` import.
2. Add a 6th query to the `Promise.all`:
   ```ts
   sb.from("beat_user_access")
     .select("beat_id, access_type, effective_from, effective_to")
     .eq("user_id", repId)
     .eq("is_active", true)
     .or(`effective_to.is.null,effective_to.gte.${start}`)
     .lte("effective_from", end)
   ```
   (Window-overlap filter so we only fetch shares active during the visible month, not "gt now" which would miss past-month views.)
3. Add shared `beat_id`s to `allBeatIds` so names are resolved.
4. After the existing chip generation, iterate `sharedAccessRes.data` and for each day in `[start..end]` that also falls inside `[effective_from, effective_to]`, push a chip:
   ```ts
   { beat_id, beat_name, status: "shared", assignment_type: access_type,
     retailer_count, last_served, source: "permanent" }
   ```
   Use the existing `push()` helper so a day already showing the beat as `assigned`/`served` (owned/planned) is not overwritten by a shared chip.
5. Skip dates in `leaveDates` only if there is no `daily_beat_plans` row — keep current `deriveStatus` behavior; shared chips still render on leave days (they represent access, not a planned visit).

No DB / RLS / type changes needed (`status: "shared"` and `source: "permanent"` already exist on `DayBeat`).

## Why the small deviation from the snippet
- The snippet uses `effective_to.gt.${new Date().toISOString()}` which hides shares in past months. Using the visible-month window keeps the calendar honest when scrolling backward/forward.
- Reusing `push()` preserves de-dup with owner/daily/permanent chips so a rep's own beat is not relabeled "shared".
