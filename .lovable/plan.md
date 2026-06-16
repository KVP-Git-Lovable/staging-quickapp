## Fix Base Unit toggle in UOM Master

Three frontend edits in `src/components/admin/uom/UomMasterPage.tsx` plus one Supabase RPC update.

### 1. `src/components/admin/uom/UomMasterPage.tsx` — UomRow toggle (~line 505)
Replace the `row.is_base ? <Badge locked/> : <Switch/>` branch with a single always-rendered `<Switch>` plus a small "base" label underneath when `row.is_base`. Keeps the existing `onPersist(row, { enabled: v })` call so the existing base-unit confirmation dialog in `persist()` (which calls the `get_unit_usage_count` RPC) becomes reachable for base units.

### 2. Same file — keep `persist()` as-is
No change. The confirmation dialog already handles the disable-base path; it just wasn't reachable while the switch was hidden.

### 3. Same file — description text (~line 758)
Replace the paragraph that says "Disabling a base unit only hides it from new product forms…" with the new wording clarifying that all units, including base units, can be toggled and that disabling hides them from new product forms and order entry while leaving existing products untouched.

### 4. Supabase migration — `get_product_units` RPC
Recreate the function so it joins `enabled_units` and filters on `COALESCE(eu.enabled, true) = true` for every row, removing the previous base-unit bypass. After this, a disabled base unit no longer appears in the order-entry unit dropdown via `useProductUnits`.

```sql
CREATE OR REPLACE FUNCTION public.get_product_units(p_product_id uuid)
RETURNS TABLE(mapping_id uuid, uom_id uuid, code text, name text, category text,
  conversion_to_base numeric, is_base boolean, is_default_sales boolean,
  is_active boolean, is_price_basis boolean, is_default_purchase boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, m.id, m.code, m.name, m.category,
         p.conversion_to_base, p.is_base, p.is_default_sales,
         COALESCE(p.is_active, true),
         COALESCE(p.is_price_basis, false),
         COALESCE(p.is_default_purchase, false)
  FROM public.product_uom_mapping p
  JOIN public.uom_master m ON m.id = p.uom_id
  LEFT JOIN public.enabled_units eu ON eu.uom_id = m.id
  WHERE p.product_id = p_product_id
    AND COALESCE(p.is_active, true) = true
    AND COALESCE(eu.enabled, true) = true
  ORDER BY p.is_base DESC, p.is_default_sales DESC, m.name;
$$;
```

### Acceptance
- UOM Master shows a working toggle for every unit including base units, with a "base" label under base rows.
- Disabling a base unit triggers the existing usage-count confirmation dialog before persisting.
- After disabling a base unit, it no longer appears in the order-entry Unit dropdown for products that use it.
- Header description reflects the new behavior.
