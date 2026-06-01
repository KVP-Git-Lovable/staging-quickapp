
-- 1a. beats lifecycle columns
ALTER TABLE public.beats
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid,
  ADD COLUMN IF NOT EXISTS reactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reactivated_by uuid;

-- 1b. retailer_beat_assignments
CREATE TABLE IF NOT EXISTS public.retailer_beat_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id uuid NOT NULL,
  beat_id text NOT NULL,
  beat_name text,
  assigned_from timestamptz NOT NULL DEFAULT now(),
  assigned_to timestamptz,
  is_current boolean NOT NULL DEFAULT true,
  assigned_by uuid,
  removed_by uuid,
  transfer_reason text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.retailer_beat_assignments TO authenticated;
GRANT ALL ON public.retailer_beat_assignments TO service_role;

ALTER TABLE public.retailer_beat_assignments ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS rba_one_current_per_retailer
  ON public.retailer_beat_assignments(retailer_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS rba_beat_idx ON public.retailer_beat_assignments(beat_id);
CREATE INDEX IF NOT EXISTS rba_retailer_idx ON public.retailer_beat_assignments(retailer_id);
CREATE INDEX IF NOT EXISTS rba_user_idx ON public.retailer_beat_assignments(user_id);

CREATE POLICY "rba_select_own" ON public.retailer_beat_assignments
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR assigned_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.retailers r WHERE r.id = retailer_id AND r.user_id = auth.uid())
  );

CREATE POLICY "rba_insert_auth" ON public.retailer_beat_assignments
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "rba_update_auth" ON public.retailer_beat_assignments
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 1c. Backfill from current retailers
INSERT INTO public.retailer_beat_assignments (retailer_id, beat_id, beat_name, assigned_from, is_current, assigned_by, user_id)
SELECT r.id, r.beat_id, r.beat_name, COALESCE(r.created_at, now()), true, r.user_id, r.user_id
FROM public.retailers r
WHERE r.beat_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.retailer_beat_assignments a
    WHERE a.retailer_id = r.id AND a.is_current
  );

-- 1d. RPCs
CREATE OR REPLACE FUNCTION public.transfer_retailer_beat(
  p_retailer_id uuid,
  p_new_beat_id text,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_current record;
  v_beat record;
  v_retailer record;
BEGIN
  SELECT * INTO v_retailer FROM public.retailers WHERE id = p_retailer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Retailer not found'; END IF;

  SELECT * INTO v_beat FROM public.beats WHERE beat_id = p_new_beat_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target beat not found'; END IF;
  IF v_beat.is_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'Cannot assign retailer to inactive beat'; END IF;

  SELECT * INTO v_current FROM public.retailer_beat_assignments
    WHERE retailer_id = p_retailer_id AND is_current
    LIMIT 1;

  IF FOUND AND v_current.beat_id = p_new_beat_id THEN
    RETURN jsonb_build_object('status','noop','assignment_id', v_current.id);
  END IF;

  IF FOUND THEN
    UPDATE public.retailer_beat_assignments
       SET assigned_to = now(),
           is_current = false,
           removed_by = v_user,
           transfer_reason = COALESCE(transfer_reason, p_reason),
           updated_at = now()
     WHERE id = v_current.id;
  END IF;

  INSERT INTO public.retailer_beat_assignments(
    retailer_id, beat_id, beat_name, assigned_from, is_current, assigned_by, transfer_reason, user_id
  ) VALUES (
    p_retailer_id, p_new_beat_id, v_beat.beat_name, now(), true, v_user, p_reason, v_retailer.user_id
  );

  UPDATE public.retailers
     SET beat_id = p_new_beat_id, beat_name = v_beat.beat_name, updated_at = now()
   WHERE id = p_retailer_id;

  INSERT INTO public.beat_audit_log(beat_id, action, old_user_id, new_user_id, metadata, performed_by)
  VALUES (
    p_new_beat_id, 'RETAILER_TRANSFERRED', v_current.beat_id::uuid_or_null_safe, NULL,
    jsonb_build_object('retailer_id', p_retailer_id, 'from_beat_id', v_current.beat_id, 'to_beat_id', p_new_beat_id, 'reason', p_reason),
    v_user
  ) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('status','ok','from_beat_id', v_current.beat_id, 'to_beat_id', p_new_beat_id);
EXCEPTION WHEN undefined_function THEN
  -- old_user_id is uuid in audit table; skip cast and retry plain insert
  INSERT INTO public.beat_audit_log(beat_id, action, metadata, performed_by)
  VALUES (p_new_beat_id, 'RETAILER_TRANSFERRED',
    jsonb_build_object('retailer_id', p_retailer_id, 'from_beat_id', v_current.beat_id, 'to_beat_id', p_new_beat_id, 'reason', p_reason),
    v_user);
  RETURN jsonb_build_object('status','ok','from_beat_id', v_current.beat_id, 'to_beat_id', p_new_beat_id);
END $$;

-- Simpler audit insert version (drop the broken cast above by replacing function)
CREATE OR REPLACE FUNCTION public.transfer_retailer_beat(
  p_retailer_id uuid,
  p_new_beat_id text,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_current record;
  v_beat record;
  v_retailer record;
BEGIN
  SELECT * INTO v_retailer FROM public.retailers WHERE id = p_retailer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Retailer not found'; END IF;

  SELECT * INTO v_beat FROM public.beats WHERE beat_id = p_new_beat_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target beat not found'; END IF;
  IF v_beat.is_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'Cannot assign retailer to inactive beat'; END IF;

  SELECT * INTO v_current FROM public.retailer_beat_assignments
    WHERE retailer_id = p_retailer_id AND is_current
    LIMIT 1;

  IF FOUND AND v_current.beat_id = p_new_beat_id THEN
    RETURN jsonb_build_object('status','noop','assignment_id', v_current.id);
  END IF;

  IF FOUND THEN
    UPDATE public.retailer_beat_assignments
       SET assigned_to = now(),
           is_current = false,
           removed_by = v_user,
           transfer_reason = COALESCE(transfer_reason, p_reason),
           updated_at = now()
     WHERE id = v_current.id;
  END IF;

  INSERT INTO public.retailer_beat_assignments(
    retailer_id, beat_id, beat_name, assigned_from, is_current, assigned_by, transfer_reason, user_id
  ) VALUES (
    p_retailer_id, p_new_beat_id, v_beat.beat_name, now(), true, v_user, p_reason, v_retailer.user_id
  );

  UPDATE public.retailers
     SET beat_id = p_new_beat_id, beat_name = v_beat.beat_name, updated_at = now()
   WHERE id = p_retailer_id;

  INSERT INTO public.beat_audit_log(beat_id, action, metadata, performed_by)
  VALUES (p_new_beat_id,
          CASE WHEN v_current.beat_id IS NULL THEN 'RETAILER_ASSIGNED_TO_BEAT' ELSE 'RETAILER_TRANSFERRED' END,
          jsonb_build_object('retailer_id', p_retailer_id, 'from_beat_id', v_current.beat_id, 'to_beat_id', p_new_beat_id, 'reason', p_reason),
          v_user);

  RETURN jsonb_build_object('status','ok','from_beat_id', v_current.beat_id, 'to_beat_id', p_new_beat_id);
END $$;

CREATE OR REPLACE FUNCTION public.assign_retailer_to_beat(
  p_retailer_id uuid,
  p_beat_id text,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.transfer_retailer_beat(p_retailer_id, p_beat_id, p_reason);
$$;

CREATE OR REPLACE FUNCTION public.can_delete_beat(p_beat_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  reasons text[] := ARRAY[]::text[];
  cnt int;
BEGIN
  SELECT count(*) INTO cnt FROM public.retailers WHERE beat_id = p_beat_id;
  IF cnt > 0 THEN reasons := reasons || format('%s retailer(s) currently assigned', cnt); END IF;

  SELECT count(*) INTO cnt FROM public.retailer_beat_assignments WHERE beat_id = p_beat_id;
  IF cnt > 0 THEN reasons := reasons || format('%s historical retailer assignment(s)', cnt); END IF;

  IF to_regclass('public.visits') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.visits WHERE beat_id = $1' INTO cnt USING p_beat_id;
    IF cnt > 0 THEN reasons := reasons || format('%s visit record(s)', cnt); END IF;
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT count(*) FROM public.orders WHERE beat_id = $1' INTO cnt USING p_beat_id;
      IF cnt > 0 THEN reasons := reasons || format('%s order record(s)', cnt); END IF;
    EXCEPTION WHEN undefined_column THEN NULL; END;
  END IF;

  IF to_regclass('public.daily_beat_plans') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.daily_beat_plans WHERE beat_id = $1' INTO cnt USING p_beat_id;
    IF cnt > 0 THEN reasons := reasons || format('%s tour-plan record(s)', cnt); END IF;
  END IF;

  IF to_regclass('public.beat_plans') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.beat_plans WHERE beat_id = $1' INTO cnt USING p_beat_id;
    IF cnt > 0 THEN reasons := reasons || format('%s beat plan record(s)', cnt); END IF;
  END IF;

  IF to_regclass('public.van_beat_assignments') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.van_beat_assignments WHERE beat_id = $1' INTO cnt USING p_beat_id;
    IF cnt > 0 THEN reasons := reasons || format('%s van/route record(s)', cnt); END IF;
  END IF;

  IF to_regclass('public.beat_audit_log') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.beat_audit_log WHERE beat_id = $1' INTO cnt USING p_beat_id;
    IF cnt > 0 THEN reasons := reasons || format('%s audit record(s)', cnt); END IF;
  END IF;

  RETURN jsonb_build_object('deletable', array_length(reasons,1) IS NULL, 'reasons', reasons);
END $$;

CREATE OR REPLACE FUNCTION public.deactivate_beat(p_beat_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  UPDATE public.beats
     SET is_active = false, deactivated_at = now(), deactivated_by = v_user, updated_at = now(), updated_by = v_user
   WHERE beat_id = p_beat_id;
  INSERT INTO public.beat_audit_log(beat_id, action, metadata, performed_by)
  VALUES (p_beat_id, 'BEAT_DEACTIVATED', '{}'::jsonb, v_user);
  RETURN jsonb_build_object('status','ok');
END $$;

CREATE OR REPLACE FUNCTION public.reactivate_beat(p_beat_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  UPDATE public.beats
     SET is_active = true, reactivated_at = now(), reactivated_by = v_user,
         deactivated_at = NULL, deactivated_by = NULL,
         updated_at = now(), updated_by = v_user
   WHERE beat_id = p_beat_id;
  INSERT INTO public.beat_audit_log(beat_id, action, metadata, performed_by)
  VALUES (p_beat_id, 'BEAT_REACTIVATED', '{}'::jsonb, v_user);
  RETURN jsonb_build_object('status','ok');
END $$;

CREATE OR REPLACE FUNCTION public.delete_beat_permanent(p_beat_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_check jsonb;
BEGIN
  v_check := public.can_delete_beat(p_beat_id);
  IF (v_check->>'deletable')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Beat has historical references and cannot be deleted: %', v_check->'reasons';
  END IF;
  DELETE FROM public.beats WHERE beat_id = p_beat_id;
  RETURN jsonb_build_object('status','deleted');
END $$;

GRANT EXECUTE ON FUNCTION public.transfer_retailer_beat(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_retailer_to_beat(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_beat(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_beat(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_beat(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_beat_permanent(text) TO authenticated;

-- 1f. Trigger to auto-log beat create/update
CREATE OR REPLACE FUNCTION public.tg_beats_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.beat_audit_log(beat_id, action, metadata, performed_by)
    VALUES (NEW.beat_id, 'BEAT_CREATED',
            jsonb_build_object('beat_name', NEW.beat_name), COALESCE(NEW.created_by, auth.uid()));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.beat_name IS DISTINCT FROM OLD.beat_name
       OR NEW.category IS DISTINCT FROM OLD.category
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.territory_id IS DISTINCT FROM OLD.territory_id THEN
      INSERT INTO public.beat_audit_log(beat_id, action, metadata, performed_by)
      VALUES (NEW.beat_id, 'BEAT_UPDATED',
              jsonb_build_object(
                'old', jsonb_build_object('beat_name', OLD.beat_name, 'category', OLD.category, 'owner_id', OLD.owner_id, 'territory_id', OLD.territory_id),
                'new', jsonb_build_object('beat_name', NEW.beat_name, 'category', NEW.category, 'owner_id', NEW.owner_id, 'territory_id', NEW.territory_id)
              ),
              auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS beats_audit_trg ON public.beats;
CREATE TRIGGER beats_audit_trg
AFTER INSERT OR UPDATE ON public.beats
FOR EACH ROW EXECUTE FUNCTION public.tg_beats_audit();
