CREATE OR REPLACE FUNCTION public.can_delete_beat(p_beat_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  reasons text[] := ARRAY[]::text[];
  cnt int;
BEGIN
  SELECT count(*) INTO cnt FROM public.retailers WHERE beat_id = p_beat_id;
  IF cnt > 0 THEN reasons := reasons || format('%s retailer(s) currently assigned', cnt); END IF;

  SELECT count(*) INTO cnt FROM public.retailer_beat_assignments WHERE beat_id = p_beat_id;
  IF cnt > 0 THEN reasons := reasons || format('%s historical retailer assignment(s)', cnt); END IF;

  SELECT count(*) INTO cnt
  FROM public.visits v
  JOIN public.retailers r ON r.id = v.retailer_id
  WHERE r.beat_id = p_beat_id;
  IF cnt > 0 THEN reasons := reasons || format('%s visit record(s)', cnt); END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT count(*) FROM public.orders WHERE beat_id = $1' INTO cnt USING p_beat_id;
      IF cnt > 0 THEN reasons := reasons || format('%s order record(s)', cnt); END IF;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
  END IF;

  SELECT count(*) INTO cnt FROM public.beat_plans WHERE beat_id = p_beat_id;
  IF cnt > 0 THEN reasons := reasons || format('%s beat plan record(s)', cnt); END IF;

  SELECT count(*) INTO cnt FROM public.daily_beat_plans WHERE beat_id = p_beat_id;
  IF cnt > 0 THEN reasons := reasons || format('%s tour-plan record(s)', cnt); END IF;

  IF to_regclass('public.van_beat_assignments') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.van_beat_assignments WHERE beat_id = $1' INTO cnt USING p_beat_id;
    IF cnt > 0 THEN reasons := reasons || format('%s van/route record(s)', cnt); END IF;
  END IF;

  RETURN jsonb_build_object('deletable', array_length(reasons,1) IS NULL, 'reasons', reasons);
END
$$;