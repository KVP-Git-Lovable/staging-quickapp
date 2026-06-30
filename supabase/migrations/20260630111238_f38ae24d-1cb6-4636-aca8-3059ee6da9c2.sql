CREATE OR REPLACE FUNCTION public.create_approval_request(p_entity_type text, p_entity_id uuid, p_requester_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_chain RECORD; v_config RECORD; v_request_id uuid; v_levels integer := 0;
BEGIN
  SELECT * INTO v_config FROM approval_config WHERE entity_type = p_entity_type;

  IF v_config.approval_mode = 'specific' THEN
    IF v_config.specific_approver_id IS NULL THEN
      RETURN NULL;
    END IF;
    INSERT INTO approval_requests (entity_type, entity_id, requester_id, current_level, total_levels, status)
    VALUES (p_entity_type, p_entity_id, p_requester_id, 1, 1, 'pending') RETURNING id INTO v_request_id;
    INSERT INTO approval_steps (approval_request_id, level, approver_id, status)
    VALUES (v_request_id, 1, v_config.specific_approver_id, 'pending');
    INSERT INTO approval_audit_log (approval_request_id, entity_type, entity_id, action, performed_by, level, metadata)
    VALUES (v_request_id, p_entity_type, p_entity_id, 'submitted', p_requester_id, 0, jsonb_build_object('mode','specific'));
    RETURN v_request_id;
  END IF;

  FOR v_chain IN SELECT manager_id, level FROM get_reporting_chain(p_requester_id) ORDER BY level
                 LIMIT COALESCE(v_config.max_levels,10) LOOP v_levels := v_levels + 1; END LOOP;
  IF v_levels = 0 THEN v_levels := 1; END IF;

  INSERT INTO approval_requests (entity_type, entity_id, requester_id, current_level, total_levels, status)
  VALUES (p_entity_type, p_entity_id, p_requester_id, 1, v_levels, 'pending') RETURNING id INTO v_request_id;

  FOR v_chain IN SELECT manager_id, level FROM get_reporting_chain(p_requester_id) ORDER BY level
                 LIMIT COALESCE(v_config.max_levels,10) LOOP
    INSERT INTO approval_steps (approval_request_id, level, approver_id, status)
    VALUES (v_request_id, v_chain.level, v_chain.manager_id, 'pending');
  END LOOP;

  INSERT INTO approval_audit_log (approval_request_id, entity_type, entity_id, action, performed_by, level, metadata)
  VALUES (v_request_id, p_entity_type, p_entity_id, 'submitted', p_requester_id, 0, jsonb_build_object('total_levels', v_levels));
  RETURN v_request_id;
END; $function$;