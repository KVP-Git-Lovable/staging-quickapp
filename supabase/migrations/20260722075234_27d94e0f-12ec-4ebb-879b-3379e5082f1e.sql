
-- Add timezone to notification rules and make notif_fill timezone-aware
ALTER TABLE public.notification_rules
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Kolkata';

-- Overloaded notif_fill accepting a timezone
CREATE OR REPLACE FUNCTION public.notif_fill(p_tmpl text, p_actor_name text, p_module text, p_meta jsonb, p_tz text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    COALESCE(p_tmpl,''),
    '{user_name}',  COALESCE(p_actor_name,'Unknown')),
    '{module_name}',COALESCE(p_module,'')),
    '{record_name}',COALESCE(p_meta->>'record_name','')),
    '{date}',       COALESCE(p_meta->>'date',      to_char((now() AT TIME ZONE COALESCE(p_tz,'Asia/Kolkata')),'DD-Mon-YYYY'))),
    '{time}',       COALESCE(p_meta->>'time',      to_char((now() AT TIME ZONE COALESCE(p_tz,'Asia/Kolkata')),'HH12:MI AM'))),
    '{time_24}',    COALESCE(p_meta->>'time_24',   to_char((now() AT TIME ZONE COALESCE(p_tz,'Asia/Kolkata')),'HH24:MI'))),
    '{timestamp}',  COALESCE(p_meta->>'timestamp', to_char((now() AT TIME ZONE COALESCE(p_tz,'Asia/Kolkata')),'DD-Mon-YYYY HH12:MI AM'))),
    '{datetime}',   COALESCE(p_meta->>'datetime',  to_char((now() AT TIME ZONE COALESCE(p_tz,'Asia/Kolkata')),'DD-Mon-YYYY HH12:MI AM'))),
    '{points}',     COALESCE(p_meta->>'points','0')),
    '{beat}',       COALESCE(p_meta->>'beat','')),
    '{status}',     COALESCE(p_meta->>'status',''));
$function$;

-- Update emit_notification_event to pass the rule's timezone
CREATE OR REPLACE FUNCTION public.emit_notification_event(p_event_code text, p_source_table text, p_record_id text, p_actor_user_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rule RECORD; v_receiver_id uuid; v_title text; v_message text;
  v_actor_name text; v_module_name text; v_record_uuid uuid;
  v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_period_type text; v_top3 jsonb; v_notif_type text; v_is_leaderboard boolean;
  v_tz text;
BEGIN
  BEGIN v_record_uuid := p_record_id::uuid; EXCEPTION WHEN others THEN v_record_uuid := NULL; END;
  v_is_leaderboard := p_event_code IN ('WEEKLY_LEADERBOARD','MONTHLY_LEADERBOARD');
  IF v_is_leaderboard THEN
    v_period_type := CASE WHEN p_event_code='WEEKLY_LEADERBOARD' THEN 'weekly' ELSE 'monthly' END;
    SELECT jsonb_agg(jsonb_build_object('rank',s.rank,'user_id',s.user_id,'full_name',s.full_name,'profile_picture_url',s.profile_picture_url,'total_points',s.total_points,'period_label',s.period_label) ORDER BY s.rank)
    INTO v_top3 FROM (SELECT * FROM leaderboard_snapshots WHERE period_type=v_period_type AND captured_at >= now()-interval '10 minutes' ORDER BY captured_at DESC, rank ASC LIMIT 3) s;
    v_metadata := v_metadata || jsonb_build_object('top3', COALESCE(v_top3,'[]'::jsonb));
  END IF;
  INSERT INTO notification_event_log (event_code, source_table, record_id, actor_user_id, metadata)
  VALUES (p_event_code, p_source_table, p_record_id, p_actor_user_id, v_metadata);
  SELECT COALESCE(full_name, username, 'System') INTO v_actor_name FROM profiles WHERE id = p_actor_user_id;
  v_module_name := INITCAP(REPLACE(p_source_table,'_',' '));
  v_notif_type := CASE WHEN v_is_leaderboard THEN 'leaderboard_banner' ELSE p_event_code END;

  IF v_is_leaderboard THEN
    SELECT * INTO v_rule FROM notification_rules WHERE event_code=p_event_code AND source_table=p_source_table AND is_active=true LIMIT 1;
    v_title := COALESCE(v_rule.title_template,'🏆 Top performers');
    v_message := COALESCE(v_rule.message_template,'The leaderboard results are in.');
    v_title := REPLACE(v_title,'{record_name}', COALESCE(v_metadata->>'period_label',''));
    v_message := REPLACE(v_message,'{record_name}', COALESCE(v_metadata->>'period_label',''));
    INSERT INTO notifications (user_id, title, message, type, related_table, related_id, metadata)
    SELECT DISTINCT up.user_id, v_title, v_message, v_notif_type, p_source_table, v_record_uuid, v_metadata
    FROM user_profiles up WHERE up.user_id IS NOT NULL;
    RETURN;
  END IF;

  FOR v_rule IN SELECT * FROM notification_rules WHERE event_code=p_event_code AND source_table=p_source_table AND is_active=true LOOP
    v_tz := COALESCE(v_rule.timezone,'Asia/Kolkata');
    v_title := public.notif_fill(v_rule.title_template, v_actor_name, v_module_name, v_metadata, v_tz);
    v_message := public.notif_fill(v_rule.message_template, v_actor_name, v_module_name, v_metadata, v_tz);
    CASE v_rule.receiver_type
      WHEN 'employee' THEN
        INSERT INTO notifications (user_id,title,message,type,related_table,related_id,metadata)
        VALUES (p_actor_user_id, v_title, v_message, v_notif_type, p_source_table, v_record_uuid, v_metadata);
      WHEN 'manager' THEN
        SELECT manager_id INTO v_receiver_id FROM employees WHERE user_id=p_actor_user_id;
        IF v_receiver_id IS NOT NULL THEN
          INSERT INTO notifications (user_id,title,message,type,related_table,related_id,metadata)
          VALUES (v_receiver_id, v_title, v_message, v_notif_type, p_source_table, v_record_uuid, v_metadata);
        END IF;
      WHEN 'hierarchy' THEN
        FOR v_receiver_id IN SELECT public.notif_managers_up_chain(p_actor_user_id) LOOP
          INSERT INTO notifications (user_id,title,message,type,related_table,related_id,metadata)
          VALUES (v_receiver_id, v_title, v_message, v_notif_type, p_source_table, v_record_uuid, v_metadata);
        END LOOP;
      WHEN 'admin' THEN
        FOR v_receiver_id IN SELECT up.user_id FROM user_profiles up JOIN security_profiles sp ON sp.id=up.profile_id WHERE sp.name='System Administrator' LOOP
          INSERT INTO notifications (user_id,title,message,type,related_table,related_id,metadata)
          VALUES (v_receiver_id, v_title, v_message, v_notif_type, p_source_table, v_record_uuid, v_metadata);
        END LOOP;
      WHEN 'specific_user' THEN
        IF v_rule.receiver_user_id IS NOT NULL THEN
          INSERT INTO notifications (user_id,title,message,type,related_table,related_id,metadata)
          VALUES (v_rule.receiver_user_id, v_title, v_message, v_notif_type, p_source_table, v_record_uuid, v_metadata);
        END IF;
      WHEN 'role' THEN
        IF v_rule.receiver_role IS NOT NULL THEN
          FOR v_receiver_id IN SELECT up.user_id FROM user_profiles up JOIN security_profiles sp ON sp.id=up.profile_id WHERE sp.name=v_rule.receiver_role LOOP
            INSERT INTO notifications (user_id,title,message,type,related_table,related_id,metadata)
            VALUES (v_receiver_id, v_title, v_message, v_notif_type, p_source_table, v_record_uuid, v_metadata);
          END LOOP;
        END IF;
      ELSE NULL;
    END CASE;
  END LOOP;
END $function$;
