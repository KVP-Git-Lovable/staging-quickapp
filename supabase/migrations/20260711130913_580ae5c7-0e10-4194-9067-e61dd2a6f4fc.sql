CREATE OR REPLACE FUNCTION public.get_all_product_units()
RETURNS TABLE(
  product_id uuid,
  mapping_id uuid,
  uom_id uuid,
  code text,
  name text,
  category text,
  conversion_to_base numeric,
  is_base boolean,
  is_default_sales boolean,
  is_price_basis boolean,
  is_default_purchase boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.product_id,
         p.id,
         m.id,
         m.code,
         m.name,
         m.category,
         p.conversion_to_base,
         p.is_base,
         p.is_default_sales,
         COALESCE(p.is_price_basis, false),
         COALESCE(p.is_default_purchase, false)
  FROM product_uom_mapping p
  JOIN uom_master m ON m.id = p.uom_id
  JOIN products pr ON pr.id = p.product_id AND COALESCE(pr.is_active, true) = true
  LEFT JOIN enabled_units eu ON eu.uom_id = m.id
  WHERE COALESCE(p.is_active, true) = true
    AND COALESCE(eu.enabled, true) = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_product_units() TO authenticated;