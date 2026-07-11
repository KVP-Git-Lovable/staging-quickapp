CREATE OR REPLACE FUNCTION public.get_category_usage()
RETURNS TABLE(category_id uuid, product_count bigint, variant_count bigint, scheme_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.id,
    (SELECT count(*) FROM products        p WHERE p.category_id = c.id),
    (SELECT count(*) FROM product_variants v WHERE v.category_id = c.id),
    (SELECT count(*) FROM product_schemes  s WHERE s.category_id = c.id)
  FROM product_categories c;
$$;

GRANT EXECUTE ON FUNCTION public.get_category_usage() TO authenticated;