## Cause: Customer Portal catalog can't read `products` because of RLS / wrong Supabase client

### What's happening
The Customer Portal is authenticated through **localStorage only** (`useCustomerPortalAuth`) — there is no Supabase Auth session for these users, so on the database they are the anonymous (`anon`) role.

Other portal pages correctly use the isolated anon client `customerPortalSupabase`, but `CustomerCatalog.tsx` was written to use the main `supabase` client. As long as the same browser had a valid dashboard login, that client's `auth.uid()` returned a real UUID and the catalog "worked." The moment that dashboard session expired or the user opened the portal in a clean browser, every query in the catalog became an anon request — and RLS on `public.products` only allows the `authenticated` role:

```text
products_select: TO authenticated USING (auth.uid() IS NOT NULL AND is_active = true)
```

There is no anon SELECT policy on `products`, so PostgREST silently returns zero rows. That is why:
- The product picker shows no options ("Select..." stays empty).
- Subtotal/Total are 0 (no rows = nothing priced).
- The cart still shows "2" — those items were stored earlier when the catalog was working.

The same issue affects `enabled_units` (no anon policy), used to compute the display unit. Categories, price books, price-book entries, distributor price books, and schemes already have anon-permissive policies, so they keep loading — that's why "Apply Offers (1)" still shows.

The "wrong quantity" you're seeing is downstream: with no product selectable, the row stays at QTY 0 / STOCK 0, and the row's default unit is hardcoded to "KG" in component state.

### Fix

1. **Switch CustomerCatalog's data fetching to `customerPortalSupabase`** (the same anon client already used by `CustomerCart` and `CustomerLayout`). Update the price-book hooks it depends on (`useRetailerPriceBook`, `usePriceBookEntries`) to accept an optional client argument so the portal can pass the anon client without breaking other callers.

2. **Add anon-read RLS policies on the two portal-blocked tables** so the anon client is actually allowed to read them:
   - `public.products` — anon SELECT where `is_active = true` (matches the portal's existing filter and the existing authenticated policy).
   - `public.enabled_units` — anon SELECT (read-only master data already exposed via other portal queries).

3. **Verification**: log out of the dashboard, reopen `/customer-portal/catalog` in a fresh tab, confirm the product picker lists products, that selecting one shows its rate from the price book, and that quantity/stock update correctly.

### Technical notes
- No schema changes — only RLS policies and the client used in `CustomerCatalog.tsx` and its hooks.
- The two new anon policies mirror the pattern already in use for `price_books`, `price_book_entries`, `distributor_price_books`, and `product_categories`.
- No change to existing dashboard/admin behavior: the existing `authenticated` policies stay in place.
- This explains why it "worked yesterday evening" — the user had an active dashboard session in the same browser, so the main client carried `auth.uid()`.