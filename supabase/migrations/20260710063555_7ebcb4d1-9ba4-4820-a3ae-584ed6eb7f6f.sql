
CREATE OR REPLACE FUNCTION public.dispatch_push_for_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_secret text;
  v_actor text;
  v_route text;
BEGIN
  IF NEW.user_id IS NULL
     OR (NEW.target_portal IS NOT NULL AND NEW.target_portal <> 'field_sales_app') THEN
    RETURN NEW;
  END IF;

  v_actor := NEW.metadata->>'actor_id';
  IF v_actor IS NOT NULL AND v_actor = NEW.user_id::text THEN
    RETURN NEW;
  END IF;

  SELECT function_url, trigger_secret INTO v_url, v_secret
  FROM public.push_config WHERE id = true LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  v_route := COALESCE(NEW.metadata->>'route', '/');

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_secret
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', COALESCE(NEW.title, 'Notification'),
      'body', COALESCE(NEW.message, ''),
      'data', jsonb_build_object(
        'route', v_route,
        'notification_id', NEW.id,
        'type', NEW.type
      )
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_push_token(
  p_token text,
  p_platform text,
  p_device_info jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  DELETE FROM public.push_device_tokens
  WHERE token = p_token AND user_id <> v_uid;

  INSERT INTO public.push_device_tokens (user_id, token, platform, device_info, last_seen_at)
  VALUES (v_uid, p_token, p_platform, COALESCE(p_device_info, '{}'::jsonb), now())
  ON CONFLICT (token) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        device_info = EXCLUDED.device_info,
        last_seen_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.claim_push_token(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_push_token(text, text, jsonb) TO authenticated;
