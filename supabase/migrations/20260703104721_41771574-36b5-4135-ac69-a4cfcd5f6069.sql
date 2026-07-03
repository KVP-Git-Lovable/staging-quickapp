
-- 1. Table
CREATE TABLE IF NOT EXISTS public.order_backdate_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  order_date date NOT NULL,
  reason text,
  approval_request_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.order_backdate_requests TO authenticated;
GRANT ALL ON public.order_backdate_requests TO service_role;

ALTER TABLE public.order_backdate_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS obr_select ON public.order_backdate_requests;
CREATE POLICY obr_select ON public.order_backdate_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.user_has_permission(auth.uid(),'order_backdate','can_view_all')
    OR EXISTS (
      SELECT 1 FROM public.approval_steps s
      WHERE s.approval_request_id = order_backdate_requests.approval_request_id
        AND s.approver_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS obr_insert ON public.order_backdate_requests;
CREATE POLICY obr_insert ON public.order_backdate_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.user_has_permission(auth.uid(),'order_backdate','can_create')
  );

-- 2. Seed approval_config for order_backdate (mirror credit_note shape but hierarchy-based, 1 level)
INSERT INTO public.approval_config (entity_type, use_full_hierarchy, max_levels, approval_mode, skip_levels)
SELECT 'order_backdate', false, 1, 'manager', false
WHERE NOT EXISTS (SELECT 1 FROM public.approval_config WHERE entity_type = 'order_backdate');

-- 3. request_backdate function
CREATE OR REPLACE FUNCTION public.request_backdate(p_date date, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_enabled boolean;
  v_req_id uuid;
  v_approval_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT backdate_enabled INTO v_enabled FROM public.operations_config WHERE id = 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RAISE EXCEPTION 'Backdated orders are disabled';
  END IF;

  IF NOT public.user_has_permission(v_uid,'order_backdate','can_create') THEN
    RAISE EXCEPTION 'You do not have permission to request a backdated order';
  END IF;

  INSERT INTO public.order_backdate_requests (user_id, order_date, reason)
  VALUES (v_uid, p_date, p_reason)
  RETURNING id INTO v_req_id;

  v_approval_id := public.create_approval_request('order_backdate', v_req_id, v_uid);

  IF v_approval_id IS NULL THEN
    RAISE EXCEPTION 'No approver could be resolved for this backdate request';
  END IF;

  UPDATE public.order_backdate_requests
     SET approval_request_id = v_approval_id
   WHERE id = v_req_id;

  RETURN v_req_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.request_backdate(date, text) TO authenticated;

-- 4. Trigger on approval_requests for order_backdate finalisation
CREATE OR REPLACE FUNCTION public.tg_order_backdate_approval_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.order_backdate_requests%ROWTYPE;
BEGIN
  IF NEW.entity_type <> 'order_backdate' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT * INTO v_req FROM public.order_backdate_requests WHERE id = NEW.entity_id FOR UPDATE;
    IF FOUND THEN
      INSERT INTO public.order_backdate_date_grants (user_id, order_date, reason)
      VALUES (v_req.user_id, v_req.order_date, v_req.reason)
      ON CONFLICT DO NOTHING;

      UPDATE public.order_backdate_requests SET status = 'approved' WHERE id = NEW.entity_id;
    END IF;
  ELSIF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.order_backdate_requests SET status = 'rejected' WHERE id = NEW.entity_id;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_order_backdate_approval_complete ON public.approval_requests;
CREATE TRIGGER trg_order_backdate_approval_complete
  AFTER UPDATE OF status ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_order_backdate_approval_complete();
