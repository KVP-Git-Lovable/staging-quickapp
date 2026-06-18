## Root cause

Dharmesh has **21 unassigned retailers**, but they're stored with `beat_id = 'unassigned'` (a literal string sentinel), not `NULL` or `''`.

Query I ran against `retailers` for Dharmesh (`user_id = 41070e2f-…`):

| beat_id | count |
|---|---|
| beat_1781174620877_… | 21 |
| **`unassigned`** | **21** |
| beat_1781174563696_… | 20 |
| … | … |

The current `loadSide` filter only matches `beat_id IS NULL OR beat_id = ''`, so the literal `'unassigned'` rows are skipped → panel shows 0.

There's also a smaller related issue: the Beat A/B dropdowns and Mass Edit list real beats by joining on `beats.beat_id`, so the `'unassigned'` sentinel never appears as a real beat — which is exactly why these 21 rows have been invisible everywhere.

## Fix (one file: `src/components/BeatTransferModal.tsx`)

In `loadSide`, when the synthetic Unassigned bucket is selected, broaden the filter to include the literal sentinel(s) commonly used in this project:

```ts
query = query.or("beat_id.is.null,beat_id.eq.,beat_id.eq.unassigned,beat_id.eq.UNASSIGNED");
```

Same change for the count query used by the panel header / pagination (so "Retailers in Unassigned (N)" reflects the real number).

Move target stays the same: moving **into** Unassigned still writes `beat_id = NULL, beat_name = NULL` (we standardise on NULL going forward — we don't want to keep creating new `'unassigned'` strings). Moving **out** of Unassigned to a real beat works regardless of which sentinel the row had.

## Out of scope

- No DB cleanup migration (not converting existing `'unassigned'` strings to NULL). Happy to add that as a follow-up if you want a one-time normalisation.
- No changes to other screens.
