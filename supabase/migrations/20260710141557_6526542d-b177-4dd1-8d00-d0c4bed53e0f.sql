CREATE OR REPLACE FUNCTION public.admin_deactivate_all_products()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_products integer := 0;
  v_variants integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.user_has_permission(v_uid, 'admin_product_mgmt', 'can_modify_all') THEN
    RAISE EXCEPTION 'Your profile does not have permission to perform this action.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.products SET is_active = false WHERE is_active = true;
  GET DIAGNOSTICS v_products = ROW_COUNT;
  UPDATE public.product_variants SET is_active = false WHERE is_active = true;
  GET DIAGNOSTICS v_variants = ROW_COUNT;
  RETURN jsonb_build_object('success', true,
    'deactivated_products', v_products, 'deactivated_variants', v_variants);
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_deactivate_all_products() TO authenticated;