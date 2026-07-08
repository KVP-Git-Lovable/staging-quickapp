-- =====================================================================
-- Migration: securityaudit_events
-- Adds a database-wide audit log for destructive DDL: DROP TABLE,
-- DROP COLUMN (via ALTER TABLE ... DROP COLUMN), and DROP POLICY.
-- Captured via a `sql_drop` event trigger, so it covers every schema
-- in this database, not just qa_* or any one app's tables.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.securityaudit_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_time        timestamptz NOT NULL DEFAULT clock_timestamp(),
  event_type        text NOT NULL,        -- 'DROP TABLE' | 'DROP COLUMN' | 'DROP POLICY'
  schema_name       text,
  table_name        text,                 -- table the drop occurred on
  column_name       text,                 -- populated only for DROP COLUMN
  policy_name       text,                 -- populated only for DROP POLICY
  object_identity   text NOT NULL,        -- full identity, e.g. "public.orders.customer_id"
  ddl_command       text NOT NULL,        -- actual command tag executed, e.g. 'ALTER TABLE'
  session_id        text,                 -- Postgres log-style session id: hex(backend_start_epoch).hex(pid)
  session_user_name text,                 -- session_user at the time of the drop
  backend_pid       integer,
  client_addr       inet
);

COMMENT ON TABLE public.securityaudit_events IS
  'Audit log of DROP TABLE, DROP COLUMN, and DROP POLICY DDL, captured project-wide via a sql_drop event trigger.';

CREATE INDEX IF NOT EXISTS securityaudit_events_event_time_idx ON public.securityaudit_events (event_time DESC);
CREATE INDEX IF NOT EXISTS securityaudit_events_table_name_idx ON public.securityaudit_events (schema_name, table_name);

-- ---------- Capture function ----------
-- Note on `original`: pg_event_trigger_dropped_objects() also reports
-- cascade side-effect objects (dependent types, toast tables, indexes,
-- constraints, default values) for a single DROP TABLE. Empirically,
-- none of those carry object_type 'table' / 'table column' / 'policy',
-- so filtering on object_type alone already excludes that noise —
-- deliberately NOT filtering on `original` here, so a table dropped
-- only as a CASCADE side-effect of another DROP TABLE is still logged
-- (it is still a real table deletion for audit purposes).
CREATE OR REPLACE FUNCTION public.log_securityaudit_drop_event()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  obj record;
  v_session_id text;
BEGIN
  SELECT to_hex(extract(epoch FROM backend_start)::bigint) || '.' || to_hex(pid)
    INTO v_session_id
  FROM pg_stat_activity
  WHERE pid = pg_backend_pid();

  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    CONTINUE WHEN obj.object_type NOT IN ('table', 'table column', 'policy');

    INSERT INTO public.securityaudit_events (
      event_type, schema_name, table_name, column_name, policy_name,
      object_identity, ddl_command, session_id, session_user_name,
      backend_pid, client_addr
    )
    VALUES (
      CASE obj.object_type
        WHEN 'table'        THEN 'DROP TABLE'
        WHEN 'table column' THEN 'DROP COLUMN'
        WHEN 'policy'        THEN 'DROP POLICY'
      END,
      obj.address_names[1],
      obj.address_names[2],
      CASE WHEN obj.object_type = 'table column' THEN obj.address_names[3] ELSE NULL END,
      CASE WHEN obj.object_type = 'policy'        THEN obj.address_names[3] ELSE NULL END,
      obj.object_identity,
      tg_tag,
      v_session_id,
      session_user,
      pg_backend_pid(),
      inet_client_addr()
    );
  END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS securityaudit_sql_drop_trigger;
CREATE EVENT TRIGGER securityaudit_sql_drop_trigger
  ON sql_drop
  EXECUTE FUNCTION public.log_securityaudit_drop_event();

-- ---------- Access control ----------
-- The audit log itself must not be writable through the client API:
-- rows are inserted exclusively by the SECURITY DEFINER trigger
-- function above (which runs as the table owner and so bypasses RLS
-- for its own inserts). Only admins may read it.
ALTER TABLE public.securityaudit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY securityaudit_events_admin_read
  ON public.securityaudit_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT ON public.securityaudit_events TO authenticated;
GRANT ALL ON public.securityaudit_events TO service_role;
