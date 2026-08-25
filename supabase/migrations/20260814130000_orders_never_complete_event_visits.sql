-- Orders must never complete an EVENT visit — close the two remaining paths.
--
-- 20260814051136_auto_visit_status_skip_activity_visits guarded
-- auto_update_visit_status_on_order (the orders trigger), but two more
-- paths still stamped event visits productive + checked-out on the first
-- sale, locking reps out of a running event ("Completed", Edit hidden):
--
--   1. auto_update_visit_status_on_order_items — trigger on order_items,
--      same logic, no guard.
--   2. sync_order_with_items_v2 — the online order submission RPC,
--      which updated the visit unconditionally (not even a status filter).
--
-- The retailer-visit behaviour ("took an order → call productive → check
-- out") is unchanged for both.

-- 1) order_items trigger: add the same activity guard.
CREATE OR REPLACE FUNCTION public.auto_update_visit_status_on_order_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  target_visit_id UUID;
  is_activity BOOLEAN;
BEGIN
  -- Look up the parent order
  SELECT id, status, visit_id, retailer_id, user_id, order_date, created_at
  INTO v_order
  FROM orders
  WHERE id = NEW.order_id;

  IF v_order.id IS NULL OR v_order.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Resolve target visit
  target_visit_id := v_order.visit_id;

  IF target_visit_id IS NULL AND v_order.retailer_id IS NOT NULL AND v_order.user_id IS NOT NULL THEN
    SELECT id INTO target_visit_id
    FROM visits
    WHERE retailer_id = v_order.retailer_id
      AND user_id = v_order.user_id
      AND planned_date = v_order.order_date
      AND status IN ('planned', 'in-progress', 'unproductive')
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF target_visit_id IS NOT NULL THEN
    -- Events and other activities run on their own clock: a sale must not
    -- check the visit out. Same guard as auto_update_visit_status_on_order.
    SELECT (COALESCE(v.visit_type, '') = 'activity' OR v.activity_event_id IS NOT NULL)
      INTO is_activity
      FROM visits v WHERE v.id = target_visit_id;

    IF is_activity THEN
      RETURN NEW;
    END IF;

    UPDATE visits
    SET
      status = 'productive',
      check_out_time = COALESCE(check_out_time, v_order.created_at),
      no_order_reason = NULL,
      updated_at = NOW()
    WHERE id = target_visit_id
      AND status IN ('planned', 'in-progress', 'unproductive');
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) sync_order_with_items_v2: patch the live definition in place. The
-- function is large and actively maintained, so rather than restating a
-- possibly stale copy, replace exactly the unguarded visit UPDATE block.
-- Fails loudly if the block is not found (already patched is fine).
DO $do$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'sync_order_with_items_v2';

  IF v_def IS NULL THEN
    RAISE NOTICE 'sync_order_with_items_v2 not found; skipping';
    RETURN;
  END IF;

  IF v_def LIKE '%activity_event_id IS NULL%' THEN
    RAISE NOTICE 'sync_order_with_items_v2 already guarded; skipping';
    RETURN;
  END IF;

  v_new := replace(
    v_def,
    'UPDATE public.visits
       SET status = ''productive'',
           check_out_time = COALESCE(check_out_time, now()),
           updated_at = now()
     WHERE id = v_visit_id;',
    'UPDATE public.visits
       SET status = ''productive'',
           check_out_time = COALESCE(check_out_time, now()),
           updated_at = now()
     WHERE id = v_visit_id
       AND COALESCE(visit_type, '''') <> ''activity''
       AND activity_event_id IS NULL;');

  IF v_new = v_def THEN
    RAISE EXCEPTION 'sync_order_with_items_v2: visit-update block not found — patch manually';
  END IF;

  EXECUTE v_new;
END
$do$;

-- 3) Repair: put back event visits the unguarded paths already closed.
-- Same narrow scope as the morning fix — never checked in, event still
-- open, has confirmed orders — so a genuinely completed event is untouched.
UPDATE public.visits v
   SET status = 'planned',
       check_out_time = null,
       updated_at = now()
  FROM public.activity_events ae
 WHERE ae.visit_id = v.id
   AND ae.activity_type = 'Event'
   AND v.status = 'productive'
   AND v.check_in_time IS NULL
   AND COALESCE(ae.status, '') <> 'closed'
   AND EXISTS (
     SELECT 1 FROM public.orders o
      WHERE o.visit_id = v.id AND o.status = 'confirmed'
   );
