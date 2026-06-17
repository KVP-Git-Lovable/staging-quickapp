## Findings

- The issue comes from the recent migration `20260617083724...`.
- That migration recreated `public.distributors`, then backfilled missing distributor rows from `public.distributor_users`:
  - `name = distributor_users.full_name`
  - `email = distributor_users.email`
  - `contact_person = distributor_users.full_name`
- Because of that, the Distributor Master is showing portal/user names like Santa, Aish, Alice, Prajwal, etc. as if they are distributor businesses.
- These rows are not safe to simply delete because they are now referenced by existing data:
  - 10 `distributor_users`
  - 16 `orders`
  - 24 `primary_orders`
- I found one recoverable real distributor record in Recycle Bin:
  - `BHARATH BEVERAGES` for distributor id `3049f21b-95a1-436e-a433-483c9c465481`

## Plan

1. **Repair the bad backfill source**
   - Update the migration logic so future environments do not backfill distributor master display fields from user names/emails.
   - Any emergency placeholder created from `distributor_users` should be clearly marked/neutral, not shown as a real distributor business.

2. **Clean the current live data safely**
   - Restore the known real distributor details for `BHARATH BEVERAGES` from Recycle Bin.
   - Do not delete linked distributor IDs, because that could break existing orders and portal users.
   - For the remaining user-derived placeholder rows, remove the misleading business identity instead of showing user names as distributor names.

3. **Fix Distributor Master display**
   - Update `/distributor-master` so user-derived placeholder records are not shown as normal distributor businesses.
   - Real distributors manually created in Distributor Master, like `Joy Icecream`, will continue to show.
   - Add a safe internal check based on whether a row looks like a portal-user placeholder, not hardcoded Supabase IDs.

4. **Protect related dropdowns**
   - Apply the same filtering to distributor dropdowns used for remap / target selection where showing user-derived placeholders would cause wrong selection.

5. **Verify**
   - Confirm the Direct Distributor tab no longer shows the portal users list.
   - Confirm `Joy Icecream` remains visible.
   - Confirm `BHARATH BEVERAGES` is restored if its recovered record is still available.
   - Confirm orders and portal users remain linked, with no destructive deletion.