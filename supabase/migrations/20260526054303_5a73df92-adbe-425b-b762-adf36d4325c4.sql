CREATE OR REPLACE FUNCTION public.admin_deactivate_all_products()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_products integer := 0;
  v_variants integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT (is_system = true) INTO v_is_admin FROM public.profiles WHERE id = v_uid;
  IF NOT COALESCE(v_is_admin, false) THEN
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role = 'admin') THEN
      v_is_admin := true;
    END IF;
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  UPDATE public.products SET is_active = false WHERE is_active = true;
  GET DIAGNOSTICS v_products = ROW_COUNT;

  UPDATE public.product_variants SET is_active = false WHERE is_active = true;
  GET DIAGNOSTICS v_variants = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'deactivated_products', v_products,
    'deactivated_variants', v_variants
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_deactivate_all_products() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_deactivate_all_products() TO authenticated;