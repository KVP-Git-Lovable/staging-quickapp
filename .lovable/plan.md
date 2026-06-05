## Fix `transferBeatOwnership()` in `src/services/beatService.ts`

Two code-only fixes inside one function. No DB/schema changes.

### Fix 1 — Wrong column name `retailer_name` → `name`
The `retailers` table column is `name`, not `retailer_name`. The current select silently returns undefined, so per-retailer ownership history rows are written with `retailer_name: undefined`.

- Line 258: change `.select('id, retailer_name')` to `.select('id, name')`
- Line 301: change `retailer_name: r.retailer_name` to `retailer_name: r.name`

### Fix 2 — Retailer update missing ownership fields
When ownership transfers, only `user_id` is updated on retailers. `owner_id` and `owner_name` remain stale, so downstream views (My Retailers, hierarchy filters) still show the old owner.

- Lines 291–294: update all three ownership columns:
  ```ts
  .update({
    user_id: newOwnerId,
    owner_id: newOwnerId,
    owner_name: newOwnerName,
  })
  ```

### Out of scope
- No changes to `beats` update block, history inserts, or other functions.
- No migrations.
