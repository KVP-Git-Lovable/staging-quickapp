-- log_deleted_record() referenced profiles.email, which doesn't exist
-- (profiles uses recovery_email). This broke every DELETE on any table using
-- this audit trigger (confirmed: retailers) with
-- "column profiles.email does not exist". Fixed to use recovery_email.
CREATE OR REPLACE FUNCTION public.log_deleted_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_name text;
  v_record_id text;
BEGIN
  v_user_id := auth.uid();

  SELECT COALESCE(full_name, username, recovery_email, v_user_id::text)
  INTO v_user_name
  FROM public.profiles
  WHERE id = v_user_id;

  v_record_id := COALESCE(
    (OLD::jsonb->>'id'),
    (OLD::jsonb->>'beat_id'),
    (OLD::jsonb->>'order_id'),
    'unknown'
  );

  INSERT INTO public.deleted_records_audit (
    table_name,
    record_id,
    record_data,
    deleted_by,
    deleted_by_name,
    deleted_at
  ) VALUES (
    TG_TABLE_NAME,
    v_record_id,
    row_to_json(OLD)::jsonb,
    v_user_id,
    v_user_name,
    now()
  );

  RETURN OLD;
END;
$function$;