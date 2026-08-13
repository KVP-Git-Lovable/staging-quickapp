-- Fire-and-forget hand-off to the AI edge function, mirroring dispatch_push_for_notification.
-- Runs AFTER INSERT and uses net.http_post, so nothing here can slow an order/attendance save.
--
-- Applied to staging via MCP on 2026-08-12, recorded as 20260812171340. Idempotent.

CREATE OR REPLACE FUNCTION public.dispatch_ai_summary_for_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  IF COALESCE(NEW.metadata->>'ai_pending','') <> 'true' THEN
    RETURN NEW;
  END IF;

  SELECT function_url, trigger_secret INTO v_url, v_secret
  FROM public.push_config WHERE id = true LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  -- Same project, sibling function.
  v_url := regexp_replace(v_url, '/[^/]+$', '/notification-ai-summary');

  INSERT INTO public.notification_ai_log (notification_id, rule_id, status)
  VALUES (NEW.id, NULLIF(NEW.metadata->>'ai_rule_id','')::uuid, 'pending');

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-ai-secret', v_secret),
    body := jsonb_build_object('notification_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let enrichment break the notification itself.
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS notifications_ai_summary_dispatch ON public.notifications;
CREATE TRIGGER notifications_ai_summary_dispatch
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_ai_summary_for_notification();

-- Hold the phone push until the AI paragraph has landed, so the push text matches
-- what the user sees in-app. The edge function sends the push itself when it finishes,
-- on both the success and the failure path.
CREATE OR REPLACE FUNCTION public.dispatch_push_for_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url text;
  v_secret text;
  v_actor text;
  v_route text;
  v_push_to_phone text;
BEGIN
  IF NEW.user_id IS NULL
     OR (NEW.target_portal IS NOT NULL AND NEW.target_portal <> 'field_sales_app') THEN
    RETURN NEW;
  END IF;

  -- AI-enriched notifications are pushed by notification-ai-summary once the
  -- summary is appended; pushing here would send the pre-AI text.
  IF COALESCE(NEW.metadata->>'ai_pending','') = 'true' THEN
    RETURN NEW;
  END IF;

  v_actor := NEW.metadata->>'actor_id';
  IF v_actor IS NOT NULL AND v_actor = NEW.user_id::text THEN
    RETURN NEW;
  END IF;

  -- Honour per-notification opt-out (used by report_subscriptions.push_to_phone=false)
  v_push_to_phone := NEW.metadata->>'push_to_phone';
  IF v_push_to_phone IS NOT NULL AND lower(v_push_to_phone) = 'false' THEN
    RETURN NEW;
  END IF;

  SELECT function_url, trigger_secret INTO v_url, v_secret
  FROM public.push_config WHERE id = true LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  -- Deep-link: report deliveries always open the notification detail page
  IF NEW.type = 'report_delivery' THEN
    v_route := '/notifications/' || NEW.id::text;
  ELSE
    v_route := COALESCE(NEW.metadata->>'route', '/');
  END IF;

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
$function$;
