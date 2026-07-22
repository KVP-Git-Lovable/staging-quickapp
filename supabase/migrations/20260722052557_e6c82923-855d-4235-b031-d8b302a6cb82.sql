-- Default {date} fallback in IST
CREATE OR REPLACE FUNCTION public.notif_fill(p_tmpl text, p_actor_name text, p_module text, p_meta jsonb)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    COALESCE(p_tmpl,''),
    '{user_name}',  COALESCE(p_actor_name,'Unknown')),
    '{module_name}',COALESCE(p_module,'')),
    '{record_name}',COALESCE(p_meta->>'record_name','')),
    '{date}',       COALESCE(p_meta->>'date', to_char((now() AT TIME ZONE 'Asia/Kolkata'),'DD-Mon-YYYY'))),
    '{time}',       COALESCE(p_meta->>'time', to_char((now() AT TIME ZONE 'Asia/Kolkata'),'HH12:MI AM'))),
    '{points}',     COALESCE(p_meta->>'points','0')),
    '{beat}',       COALESCE(p_meta->>'beat','')),
    '{status}',     COALESCE(p_meta->>'status',''));
$$;

-- Attendance: emit IST timestamps
CREATE OR REPLACE FUNCTION public.trigger_notification_attendance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  BEGIN
    PERFORM public.emit_notification_event(
      'RECORD_CREATED','attendance', NEW.id::text, NEW.user_id,
      jsonb_build_object(
        'date',   to_char(COALESCE(NEW.date, (now() AT TIME ZONE 'Asia/Kolkata')::date),'DD-Mon-YYYY'),
        'time',   to_char((COALESCE(NEW.check_in_time, now()) AT TIME ZONE 'Asia/Kolkata'),'HH12:MI AM'),
        'status', INITCAP(COALESCE(NEW.status,'Present')),
        'record_name','attendance'));
  EXCEPTION WHEN others THEN NULL;
  END;
  RETURN NEW;
END $$;