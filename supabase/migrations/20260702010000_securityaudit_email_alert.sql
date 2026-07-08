-- =====================================================================
-- Migration: securityaudit_email_alert
-- Sends an email alert (via Resend, through pg_net) every time a row
-- is inserted into public.securityaudit_events. The Resend API key is
-- read from Supabase Vault at call time (vault.decrypted_secrets,
-- secret name 'resend_api_key') — it is never stored in this file or
-- anywhere in git. Set/rotate it directly against the database via:
--   select vault.create_secret('<key>', 'resend_api_key', 'Resend API key for securityaudit_events alerts');
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_securityaudit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_api_key text;
  v_subject text := 'ALERT: Database modified with drop or alter';
  v_html    text;
BEGIN
  SELECT decrypted_secret INTO v_api_key
  FROM vault.decrypted_secrets
  WHERE name = 'resend_api_key'
  LIMIT 1;

  IF v_api_key IS NULL THEN
    RAISE WARNING 'securityaudit email alert skipped: resend_api_key not set in Vault';
    RETURN NEW;
  END IF;

  v_html := format(
    '<h2>%s</h2>' ||
    '<p>A destructive schema change was detected and logged in <code>public.securityaudit_events</code>.</p>' ||
    '<table cellpadding="6" style="border-collapse:collapse">' ||
    '<tr><td><b>Event time</b></td><td>%s</td></tr>' ||
    '<tr><td><b>Event type</b></td><td>%s</td></tr>' ||
    '<tr><td><b>DDL command</b></td><td>%s</td></tr>' ||
    '<tr><td><b>Schema</b></td><td>%s</td></tr>' ||
    '<tr><td><b>Table</b></td><td>%s</td></tr>' ||
    '<tr><td><b>Column</b></td><td>%s</td></tr>' ||
    '<tr><td><b>Policy</b></td><td>%s</td></tr>' ||
    '<tr><td><b>Object identity</b></td><td>%s</td></tr>' ||
    '<tr><td><b>Session user</b></td><td>%s</td></tr>' ||
    '<tr><td><b>Session ID</b></td><td>%s</td></tr>' ||
    '<tr><td><b>Backend PID</b></td><td>%s</td></tr>' ||
    '<tr><td><b>Client address</b></td><td>%s</td></tr>' ||
    '</table>',
    v_subject,
    to_char(NEW.event_time, 'YYYY-MM-DD HH24:MI:SS TZ'),
    NEW.event_type,
    NEW.ddl_command,
    coalesce(NEW.schema_name, '—'),
    coalesce(NEW.table_name, '—'),
    coalesce(NEW.column_name, '—'),
    coalesce(NEW.policy_name, '—'),
    NEW.object_identity,
    coalesce(NEW.session_user_name, '—'),
    coalesce(NEW.session_id, '—'),
    coalesce(NEW.backend_pid::text, '—'),
    coalesce(NEW.client_addr::text, '—')
  );

  PERFORM net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_api_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'QuickApp Security Audit <onboarding@resend.dev>',
      'to', jsonb_build_array('info@kvpcorp.com'),
      'subject', v_subject,
      'html', v_html
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS securityaudit_events_notify_trigger ON public.securityaudit_events;
CREATE TRIGGER securityaudit_events_notify_trigger
  AFTER INSERT ON public.securityaudit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_securityaudit_event();
