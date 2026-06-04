# Fix voice-place-order "Product not found" for existing products

## Root cause

`public.products` has RLS enabled with only an admin-write policy, and **no table-level `GRANT`s** for `anon`, `authenticated`, or `service_role`. The voice edge function calls Supabase with the service role key — service role bypasses RLS but still needs table privileges. Every `select` on `products` is being rejected with a permission error that `searchProducts` discards (it ignores the `error` field), so the function reports "Product not found" even when the row clearly exists (`BRITISH COFFEE`, `is_active=true`).

## Fix

### 1. Migration: grant privileges on `public.products`

```sql
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
```

(Existing RLS policy is kept; only admins can still write from the client. Service role retains full access via bypass + grant.)

After this, also audit other tables the voice/Bolna functions touch (`retailers`, `orders`, `order_items`) and add the same standard grant block where missing, since the same omission may be silently affecting them too.

### 2. Stop swallowing Supabase errors in `supabase/functions/_shared/bolna.ts`

In `searchProducts`, capture and log `error` from each query (STEP 1 alias, STEP 2 ilike, STEP 3 token OR). Currently:

```ts
const { data } = await supabase.from("products")...
```

becomes:

```ts
const { data, error } = await supabase.from("products")...
if (error) console.error("PRODUCT QUERY ERROR:", error);
```

Same treatment for `findRetailerByPhone` in the same file. Silent errors are what made this bug invisible.

### 3. Add the requested diagnostic logs in `supabase/functions/voice-place-order/index.ts`

Right before calling `searchProducts`, add a one-shot sanity probe and structured logs:

```ts
const probe = await supabase
  .from("products")
  .select("id,name,is_active")
  .ilike("name", "%british%");
console.log("DEBUG BRITISH SEARCH:", { error: probe.error, count: probe.data?.length });
console.log("QUERY:", names[i]);
```

`searchProducts` already logs `NORMALIZED QUERY`, `MATCH CANDIDATES`, and `FINAL MATCH`, so no extra logs needed there once errors are surfaced.

### 4. Verify

- Redeploy edge functions (automatic on save).
- Call voice-place-order with the same Bolna payload (`product_name: "british coffee"`).
- Confirm logs show `DEBUG BRITISH SEARCH: { count: 1 }` and `FINAL MATCH: BRITISH COFFEE`.
- Confirm the order is created end-to-end.

## Out of scope

- No schema changes to `products`.
- No changes to order business logic, retailer scoping, or matching thresholds.
- Retailer/customer filters were never present in this function — Step 5 of the request is a no-op and will be skipped.
