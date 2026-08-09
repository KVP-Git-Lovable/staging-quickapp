-- Second latent bug in the same function: `OLD::jsonb` is not a valid direct
-- cast from a row type in this Postgres version -- it needs to go through
-- to_jsonb()/row_to_json() first (which the record_data column already did
-- correctly, just not this line). This also broke every DELETE that reached
-- this point.
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
  v_old_json jsonb;
BEGIN
  v_user_id := auth.uid();

  SELECT COALESCE(full_name, username, recovery_email, v_user_id::text)
  INTO v_user_name
  FROM public.profiles
  WHERE id = v_user_id;

  v_old_json := to_jsonb(OLD);

  v_record_id := COALESCE(
    (v_old_json->>'id'),
    (v_old_json->>'beat_id'),
    (v_old_json->>'order_id'),
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
    v_old_json,
    v_user_id,
    v_user_name,
    now()
  );

  RETURN OLD;
END;
$function$;