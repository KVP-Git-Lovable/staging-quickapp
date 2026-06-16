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