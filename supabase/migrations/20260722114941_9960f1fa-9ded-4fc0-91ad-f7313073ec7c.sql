
-- Ensure RECORD_UPDATED event type exists
INSERT INTO public.notification_event_types (event_code, label, description, is_active)
VALUES ('RECORD_UPDATED', 'Record updated', 'Fired when an existing record changes state', true)
ON CONFLICT (event_code) DO UPDATE SET is_active = true;

-- Extend attendance trigger to emit RECORD_UPDATED on check-out
CREATE OR REPLACE FUNCTION public.trigger_notification_attendance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    BEGIN
      PERFORM public.emit_notification_event(
        'RECORD_CREATED','attendance', NEW.id::text, NEW.user_id,
        jsonb_build_object(
          'date',   to_char(COALESCE(NEW.date, (now() AT TIME ZONE 'Asia/Kolkata')::date),'DD-Mon-YYYY'),
          'time',   to_char((COALESCE(NEW.check_in_time, now()) AT TIME ZONE 'Asia/Kolkata'),'HH12:MI AM'),
          'status', INITCAP(COALESCE(NEW.status,'Present')),
          'sub_event','checked_in',
          'record_name','attendance'));
    EXCEPTION WHEN others THEN NULL;
    END;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.check_out_time IS NULL AND NEW.check_out_time IS NOT NULL) THEN
      BEGIN
        PERFORM public.emit_notification_event(
          'RECORD_UPDATED','attendance', NEW.id::text, NEW.user_id,
          jsonb_build_object(
            'date',   to_char(COALESCE(NEW.date, (now() AT TIME ZONE 'Asia/Kolkata')::date),'DD-Mon-YYYY'),
            'time',   to_char((NEW.check_out_time AT TIME ZONE 'Asia/Kolkata'),'HH12:MI AM'),
            'status', 'Checked out',
            'sub_event','checked_out',
            'record_name','attendance'));
      EXCEPTION WHEN others THEN NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Recreate trigger to include UPDATE OF check_out_time
DROP TRIGGER IF EXISTS trg_notification_attendance ON public.attendance;
CREATE TRIGGER trg_notification_attendance
AFTER INSERT OR UPDATE OF check_out_time ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.trigger_notification_attendance();
