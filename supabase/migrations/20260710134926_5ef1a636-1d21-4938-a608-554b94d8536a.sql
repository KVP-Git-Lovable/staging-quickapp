CREATE OR REPLACE FUNCTION public.set_category_products_active(p_category_id uuid, p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_products integer := 0;
  v_variants integer := 0;
  v_cat_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    SELECT COALESCE(sp.is_system, false) INTO v_is_admin
    FROM public.profiles p JOIN public.security_profiles sp ON sp.id = p.role_id
    WHERE p.id = v_uid;
  END IF;
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'Permission denied: admin only'; END IF;

  SELECT name INTO v_cat_name FROM public.product_categories WHERE id = p_category_id;
  IF v_cat_name IS NULL THEN RAISE EXCEPTION 'Category not found'; END IF;

  UPDATE public.products SET is_active = p_active
   WHERE category_id = p_category_id AND is_active IS DISTINCT FROM p_active;
  GET DIAGNOSTICS v_products = ROW_COUNT;

  UPDATE public.product_variants v SET is_active = p_active
   WHERE v.is_active IS DISTINCT FROM p_active
     AND v.product_id IN (SELECT id FROM public.products WHERE category_id = p_category_id);
  GET DIAGNOSTICS v_variants = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'category', v_cat_name,
    'affected_products', v_products, 'affected_variants', v_variants);
END; $$;

GRANT EXECUTE ON FUNCTION public.set_category_products_active(uuid, boolean) TO authenticated;