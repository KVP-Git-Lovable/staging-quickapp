CREATE OR REPLACE FUNCTION public.merge_retailers(p_source uuid, p_target uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_tbl text; v_moved int; v_total int := 0;
  v_repointed jsonb := '[]'::jsonb;
  v_dropped   jsonb := '[]'::jsonb;
  v_pending_after numeric;
  v_src_name text; v_tgt_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=v_uid AND role='admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    SELECT COALESCE(sp.is_system,false) INTO v_is_admin
    FROM profiles p JOIN security_profiles sp ON sp.id=p.role_id WHERE p.id=v_uid;
  END IF;
  IF NOT COALESCE(v_is_admin,false) THEN RAISE EXCEPTION 'Permission denied: admin only'; END IF;

  IF p_source IS NULL OR p_target IS NULL OR p_source=p_target THEN
    RAISE EXCEPTION 'source and target must be provided and different'; END IF;

  SELECT name INTO v_src_name FROM retailers WHERE id=p_source;
  SELECT name INTO v_tgt_name FROM retailers WHERE id=p_target;
  IF v_src_name IS NULL THEN RAISE EXCEPTION 'source retailer not found'; END IF;
  IF v_tgt_name IS NULL THEN RAISE EXCEPTION 'target retailer not found'; END IF;

  FOR v_tbl IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
    WHERE c.table_schema='public' AND c.column_name='retailer_id'
      AND c.table_name NOT LIKE 'qa_%' AND c.table_name <> 'retailers'
  LOOP
    BEGIN
      EXECUTE format('UPDATE public.%I SET retailer_id=$1 WHERE retailer_id=$2', v_tbl)
        USING p_target, p_source;
      GET DIAGNOSTICS v_moved = ROW_COUNT;
      v_total := v_total + v_moved;
      IF v_moved > 0 THEN v_repointed := v_repointed || jsonb_build_object('table',v_tbl,'moved',v_moved); END IF;
    EXCEPTION WHEN unique_violation THEN
      EXECUTE format('DELETE FROM public.%I WHERE retailer_id=$1', v_tbl) USING p_source;
      GET DIAGNOSTICS v_moved = ROW_COUNT;
      v_dropped := v_dropped || jsonb_build_object('table',v_tbl,'dropped',v_moved);
    END;
  END LOOP;

  BEGIN v_pending_after := public.recompute_retailer_pending(p_target);
  EXCEPTION WHEN OTHERS THEN v_pending_after := NULL; END;

  UPDATE retailers SET status='inactive', duplicate_of=p_target, updated_at=now() WHERE id=p_source;

  RETURN jsonb_build_object(
    'status','ok','source',p_source,'target',p_target,
    'reason',p_reason,
    'total_rows_moved',v_total,'repointed',v_repointed,
    'dropped_on_collision',v_dropped,'pending_after',v_pending_after);
END; $$;

GRANT EXECUTE ON FUNCTION public.merge_retailers(uuid, uuid, text) TO authenticated;