## Diagnosis confirmed

Verified against the DB: `public.products` has `base_unit` but **no `unit` column**. So the current `PRODUCT_PICKER_COLUMNS` in `src/hooks/useMasterDataCache.ts:14` makes every paginated products fetch return a PostgREST 400 ("column products.unit does not exist"), which — combined with the 3× retry added earlier — always ends with the Products & Variants warming step marked `error`. That is exactly the reported symptom (step never goes green, offline order entry has no products).

Also confirmed `unit` is not referenced anywhere else in `useMasterDataCache.ts` (only appears on line 14 and inside unrelated comments on lines 160/614). Removing it from the select list is safe — downstream consumers already read units from `product_uom_mapping` / `uom_master` and the product's `base_unit`, both of which remain in the select and in their own cache steps.

## Change

Single-line edit in `src/hooks/useMasterDataCache.ts`:

```ts
const PRODUCT_PICKER_COLUMNS =
  'id, name, sku, product_number, rate, base_unit, base_unit_category, category_id, closing_stock, gst_percentage, hsn_code, tax_master_id, default_sales_uom_id, price_basis_uom_id, is_active';
```

Nothing else changes. Retry/backoff and freshness gate stay as-is.

## Expected result

- Products paginated fetch succeeds → Products & Variants step emits `done`.
- All 6 warming steps green; header indicator flips to 🟢 on its own.
- `master_cache_ready_at` gets written, so subsequent cold starts hit the fast freshness path.
- Offline order entry has the products catalog available.

Your proposed fix is correct — approve to apply.