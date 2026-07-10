CREATE TABLE IF NOT EXISTS public.push_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  function_url text NOT NULL,
  trigger_secret text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.push_config TO service_role;
ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated/anon: only service_role (which bypasses RLS) can read/write.

INSERT INTO public.push_config (id, function_url, trigger_secret)
VALUES (
  true,
  'https://aoxdosjkwqyuvccuwhzc.supabase.co/functions/v1/send-push',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.dispatch_push_for_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text;
  v_url text;
  v_secret text;
  v_body jsonb;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_actor := NEW.metadata->>'actor_id';
  IF v_actor IS NOT NULL AND v_actor = NEW.user_id::text THEN
    RETURN NEW;
  END IF;

  SELECT function_url, trigger_secret INTO v_url, v_secret FROM public.push_config WHERE id = true;

  IF v_url IS NULL OR v_url = '' THEN
    RETURN NEW;
  END IF;

  v_body := jsonb_build_object(
    'user_id', NEW.user_id,
    'title', NEW.title,
    'body', NEW.message,
    'data', jsonb_build_object(
      'route', NEW.metadata->>'route',
      'notification_id', NEW.id,
      'type', NEW.type,
      'related_table', NEW.related_table,
      'related_id', NEW.related_id
    )
  );

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', COALESCE(v_secret, '')
    ),
    body := v_body,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;