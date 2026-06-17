## Fix plan: Distributor Master missing table

**Problem**
- The app is failing because `public.distributors` genuinely does not exist in Supabase.
- The Distributor Master page and many other DMS/order screens still query `from('distributors')`, so this must be fixed at the database schema level, not by changing one page.
- Existing `distributor_users` still has 10 user rows across 7 unique `distributor_id`s, so we can recover partial distributor records using those IDs and contact details.

## Implementation steps

1. **Recreate `public.distributors` with the expected columns**
   - Restore the original base columns: name, contact person, phone, email, address, status, territory, credit fields.
   - Include later DMS columns used by the app: distribution level, parent distributor, GST, business profile, assets, relationship fields, owner mapping, network counts, etc.
   - Add indexes for parent/type/status/owner lookups.
   - Add explicit Data API grants and RLS policies so authenticated users can load/create/update/delete distributors.

2. **Backfill recovered distributor rows**
   - Insert one distributor row per distinct `distributor_users.distributor_id`.
   - Preserve the exact old distributor IDs so existing portal users, orders, payment config, inventory, and other related tables continue linking correctly.
   - Use the available `distributor_users` fields to reconstruct:
     - `name` from available full name as a fallback business name
     - `contact_person` from full name
     - `phone` and `email` from user data
     - `status = active`
     - `distribution_level = direct_distributor` as a safe default
   - This restores usable rows, but fields that were only present in the dropped `distributors` table and not duplicated elsewhere may need manual correction unless a Supabase backup is restored.

3. **Compatibility checks**
   - Confirm Distributor Master loads without the schema-cache error.
   - Confirm the Add Distributor flow can insert into the recreated table.
   - Confirm existing code references align with the recreated columns.

## Important note about “old data”
This plan recovers distributor records from surviving related tables, preserving the old IDs. It cannot recover fields that no longer exist anywhere in the database after the table was lost. For a full exact restore of every old distributor field, a Supabase backup/PITR restore is still required.