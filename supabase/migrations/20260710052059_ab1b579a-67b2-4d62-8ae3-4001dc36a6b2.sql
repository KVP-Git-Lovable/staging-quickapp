-- Push device tokens for FCM (Android + PWA web)
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.push_device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  platform text NOT NULL CHECK (platform IN ('android','ios','web')),
  device_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_device_tokens_user ON public.push_device_tokens(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_device_tokens TO authenticated;
GRANT ALL ON public.push_device_tokens TO service_role;

ALTER TABLE public.push_device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push tokens"
  ON public.push_device_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_device_tokens_updated_at ON public.push_device_tokens;
CREATE TRIGGER push_device_tokens_updated_at
  BEFORE UPDATE ON public.push_device_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function invoked by AFTER INSERT trigger on notifications: fires an async
-- HTTP POST to the send-push edge function via pg_net. Skips when the row's
-- actor equals the recipient (self-suppression) or when user_id is null.
CREATE OR REPLACE FUNCTION public.dispatch_push_for_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text;
  v_route text;
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

  -- Config read from database settings (set via ALTER DATABASE ... SET app.*)
  v_url := current_setting('app.push_function_url', true);
  v_secret := current_setting('app.push_trigger_secret', true);

  IF v_url IS NULL OR v_url = '' THEN
    RETURN NEW; -- not configured yet
  END IF;

  v_route := NEW.metadata->>'route';

  v_body := jsonb_build_object(
    'user_id', NEW.user_id,
    'title', NEW.title,
    'body', NEW.message,
    'data', jsonb_build_object(
      'route', v_route,
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
  -- Never break the insert if push dispatch fails
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_push_dispatch ON public.notifications;
CREATE TRIGGER notifications_push_dispatch
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_for_notification();