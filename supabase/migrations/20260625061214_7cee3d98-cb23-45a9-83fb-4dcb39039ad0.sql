-- 1. Update the expense approval trigger so a "manager" workflow step expands
--    to ALL managers in the requester's reporting chain (parallel multi-level
--    approval, mirroring how leaves work). Specific-user and hierarchy_level
--    steps keep their existing single-approver behaviour.
CREATE OR REPLACE FUNCTION public.trigger_create_expense_approval_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workflow_id uuid;
  v_workflow RECORD;
  v_step RECORD;
  v_request_id uuid;
  v_approver_id uuid;
  v_chain RECORD;
  v_category_id uuid;
  v_step_inserted boolean;
BEGIN
  IF NEW.status != 'submitted' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'submitted' THEN
    RETURN NEW;
  END IF;

  -- Resolve workflow (amount → category → always → default)
  v_workflow_id := NULL;

  SELECT r.workflow_id INTO v_workflow_id
  FROM expense_approval_rules r
  WHERE r.is_active = true
    AND r.condition_type = 'amount_range'
    AND (r.condition_value->>'min')::numeric <= NEW.amount
    AND (r.condition_value->>'max')::numeric >= NEW.amount
  ORDER BY r.priority ASC LIMIT 1;

  IF v_workflow_id IS NULL THEN
    SELECT ec.id INTO v_category_id FROM expense_categories ec
    WHERE ec.name = NEW.category AND ec.is_active = true LIMIT 1;
    IF v_category_id IS NOT NULL THEN
      SELECT r.workflow_id INTO v_workflow_id
      FROM expense_approval_rules r
      WHERE r.is_active = true AND r.condition_type = 'category'
        AND (r.condition_value->>'category_id')::uuid = v_category_id
      ORDER BY r.priority ASC LIMIT 1;
    END IF;
  END IF;

  IF v_workflow_id IS NULL THEN
    SELECT r.workflow_id INTO v_workflow_id FROM expense_approval_rules r
    WHERE r.is_active = true AND r.condition_type = 'always'
    ORDER BY r.priority ASC LIMIT 1;
  END IF;

  IF v_workflow_id IS NULL THEN
    SELECT id INTO v_workflow_id FROM approval_workflows
    WHERE entity_type = 'expense' AND is_default = true AND is_active = true LIMIT 1;
  END IF;

  -- Ultimate fallback: legacy create_approval_request (full chain)
  IF v_workflow_id IS NULL THEN
    DECLARE v_mode text;
    BEGIN
      SELECT approval_mode INTO v_mode FROM approval_config WHERE entity_type = 'expense';
      IF v_mode = 'auto' THEN
        NEW.status := 'manager_approved'; NEW.approved_at := now(); RETURN NEW;
      END IF;
      PERFORM create_approval_request('expense', NEW.id, NEW.user_id);
      RETURN NEW;
    END;
  END IF;

  SELECT * INTO v_workflow FROM approval_workflows WHERE id = v_workflow_id;

  IF NOT EXISTS (SELECT 1 FROM workflow_steps WHERE workflow_id = v_workflow_id) THEN
    NEW.status := 'manager_approved'; NEW.approved_at := now(); RETURN NEW;
  END IF;

  -- We don't know the level count up-front (manager step expands to chain).
  -- Create the request first, then fix total_levels after inserting steps.
  INSERT INTO approval_requests (entity_type, entity_id, requester_id, current_level, total_levels, status)
  VALUES ('expense', NEW.id, NEW.user_id, 1, 1, 'pending')
  RETURNING id INTO v_request_id;

  v_step_inserted := false;

  FOR v_step IN
    SELECT * FROM workflow_steps WHERE workflow_id = v_workflow_id ORDER BY step_number ASC
  LOOP
    IF v_step.approver_type = 'specific_user' AND v_step.specific_user_id IS NOT NULL THEN
      INSERT INTO approval_steps (approval_request_id, level, approver_id, status)
      VALUES (v_request_id, v_step.step_number, v_step.specific_user_id, 'pending');
      v_step_inserted := true;
    ELSIF v_step.approver_type = 'hierarchy_level' THEN
      SELECT manager_id INTO v_approver_id
      FROM get_reporting_chain(NEW.user_id)
      WHERE level = COALESCE(v_step.hierarchy_level, v_step.step_number) LIMIT 1;
      IF v_approver_id IS NOT NULL THEN
        INSERT INTO approval_steps (approval_request_id, level, approver_id, status)
        VALUES (v_request_id, v_step.step_number, v_approver_id, 'pending');
        v_step_inserted := true;
      END IF;
    ELSIF v_step.approver_type = 'manager' THEN
      -- Expand to every manager in the reporting chain (parallel approval)
      FOR v_chain IN
        SELECT manager_id, level FROM get_reporting_chain(NEW.user_id) ORDER BY level
      LOOP
        IF v_chain.manager_id IS NOT NULL THEN
          INSERT INTO approval_steps (approval_request_id, level, approver_id, status)
          VALUES (v_request_id, v_chain.level, v_chain.manager_id, 'pending');
          v_step_inserted := true;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- If no step could be inserted (e.g. requester has no manager), auto-approve
  IF NOT v_step_inserted THEN
    DELETE FROM approval_requests WHERE id = v_request_id;
    NEW.status := 'manager_approved'; NEW.approved_at := now();
    RETURN NEW;
  END IF;

  -- Sync total_levels with the max level we actually inserted
  UPDATE approval_requests ar
  SET total_levels = COALESCE((
    SELECT MAX(level) FROM approval_steps WHERE approval_request_id = ar.id
  ), 1)
  WHERE id = v_request_id;

  INSERT INTO approval_audit_log (approval_request_id, entity_type, entity_id, action, performed_by, level, metadata)
  VALUES (v_request_id, 'expense', NEW.id, 'submitted', NEW.user_id, 0,
          jsonb_build_object('workflow_id', v_workflow_id, 'workflow_name', v_workflow.workflow_name));

  RETURN NEW;
END;
$function$;

-- 2. Backfill missing higher-level steps for already-pending expense requests
--    whose workflow contained a "manager" step that previously only added L1.
DO $$
DECLARE
  r RECORD;
  c RECORD;
BEGIN
  FOR r IN
    SELECT ar.id AS ar_id, ar.requester_id
    FROM approval_requests ar
    WHERE ar.entity_type = 'expense'
      AND ar.status = 'pending'
  LOOP
    FOR c IN
      SELECT manager_id, level FROM get_reporting_chain(r.requester_id) ORDER BY level
    LOOP
      IF c.manager_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM approval_steps
           WHERE approval_request_id = r.ar_id AND approver_id = c.manager_id
         )
      THEN
        INSERT INTO approval_steps (approval_request_id, level, approver_id, status)
        VALUES (r.ar_id, c.level, c.manager_id, 'pending');
      END IF;
    END LOOP;

    UPDATE approval_requests ar2
    SET total_levels = COALESCE((
      SELECT MAX(level) FROM approval_steps WHERE approval_request_id = ar2.id
    ), 1)
    WHERE ar2.id = r.ar_id;
  END LOOP;
END $$;