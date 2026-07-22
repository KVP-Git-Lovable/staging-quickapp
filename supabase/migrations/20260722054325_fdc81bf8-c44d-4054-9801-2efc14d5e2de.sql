
ALTER TABLE public.report_subscriptions
  ADD COLUMN IF NOT EXISTS recipient_mode text NOT NULL DEFAULT 'named_users';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_subscriptions_recipient_mode_check'
  ) THEN
    ALTER TABLE public.report_subscriptions
      ADD CONSTRAINT report_subscriptions_recipient_mode_check
      CHECK (recipient_mode IN ('named_users','all_managers'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_report_subscription(p_definition jsonb, p_subscription jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_def_id UUID;
  v_sub_id UUID;
  v_uid UUID := auth.uid();
BEGIN
  IF NOT public.is_admin_or_manager() THEN
    RAISE EXCEPTION 'Only admins/managers can create report subscriptions';
  END IF;

  INSERT INTO public.report_definitions (name, dataset_key, layout, config, created_by)
  VALUES (
    p_definition->>'name',
    p_definition->>'dataset_key',
    p_definition->>'layout',
    COALESCE(p_definition->'config', '{}'::jsonb),
    v_uid
  ) RETURNING id INTO v_def_id;

  INSERT INTO public.report_subscriptions (
    name, report_definition_id, cadence, fire_day, fire_time, timezone,
    recipient_user_ids, attachment_format, push_to_phone, scope, status, created_by,
    recipient_mode
  )
  VALUES (
    p_subscription->>'name',
    v_def_id,
    p_subscription->>'cadence',
    p_subscription->>'fire_day',
    COALESCE((p_subscription->>'fire_time')::time, '08:00'::time),
    COALESCE(p_subscription->>'timezone', 'Asia/Kolkata'),
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(p_subscription->'recipient_user_ids'))::uuid[],
      '{}'::uuid[]
    ),
    COALESCE(p_subscription->>'attachment_format', 'excel'),
    COALESCE((p_subscription->>'push_to_phone')::boolean, true),
    COALESCE(p_subscription->>'scope', 'shared'),
    COALESCE(p_subscription->>'status', 'active'),
    v_uid,
    COALESCE(p_subscription->>'recipient_mode', 'named_users')
  ) RETURNING id INTO v_sub_id;

  RETURN v_sub_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.report_all_managers()
RETURNS TABLE(user_id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT e.manager_id AS user_id,
         COALESCE(p.full_name, p.username, '')::text AS full_name
  FROM public.employees e
  JOIN public.employees me ON me.user_id = e.manager_id
  JOIN public.profiles p ON p.id = e.manager_id
  WHERE e.manager_id IS NOT NULL
    AND p.is_active = true
    AND (e.date_of_exit IS NULL OR e.date_of_exit > now())
    AND (me.date_of_exit IS NULL OR me.date_of_exit > now());
$function$;

GRANT EXECUTE ON FUNCTION public.report_all_managers() TO authenticated, service_role;
