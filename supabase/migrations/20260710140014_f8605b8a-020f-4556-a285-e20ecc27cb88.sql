CREATE OR REPLACE FUNCTION public.set_products_active(p_product_ids uuid[], p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_products integer := 0;
  v_variants integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT public.user_has_permission(v_uid, 'admin_product_edit', 'can_edit') THEN
    RAISE EXCEPTION 'Your profile does not have permission to perform this action.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_product_ids IS NULL OR array_length(p_product_ids,1) IS NULL THEN
    RAISE EXCEPTION 'No products selected';
  END IF;

  UPDATE public.products SET is_active = p_active
   WHERE id = ANY(p_product_ids) AND is_active = NOT p_active;
  GET DIAGNOSTICS v_products = ROW_COUNT;

  UPDATE public.product_variants v SET is_active = p_active
   WHERE v.is_active = NOT p_active AND v.product_id = ANY(p_product_ids);
  GET DIAGNOSTICS v_variants = ROW_COUNT;

  RETURN jsonb_build_object('success', true,
    'affected_products', v_products, 'affected_variants', v_variants);
END; $$;

GRANT EXECUTE ON FUNCTION public.set_products_active(uuid[], boolean) TO authenticated;