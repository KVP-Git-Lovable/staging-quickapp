-- Restore public.notification_rules, dropped from the Supabase Dashboard on
-- 2026-07-30 06:44 UTC. Its absence made emit_notification_event() raise, and because
-- trg_notification_orders / trg_notification_visits are unguarded AFTER triggers, every
-- order and visit INSERT aborted. Schema reproduced from the original migrations
-- (20260408112754 + 20260515085102 + 20260722075236) = 17 columns.

CREATE TABLE IF NOT EXISTS public.notification_rules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code            text NOT NULL,
  source_table          text NOT NULL,
  title_template        text NOT NULL DEFAULT '',
  message_template      text NOT NULL DEFAULT '',
  receiver_type         text NOT NULL DEFAULT 'employee',
  receiver_user_id      uuid,
  notification_channel  text NOT NULL DEFAULT 'in_app',
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  name                  text,
  receiver_role         text,
  retailer_target_type  text,
  retailer_target_ids   uuid[],
  created_by            uuid,
  timezone              text NOT NULL DEFAULT 'Asia/Kolkata'
);

CREATE INDEX IF NOT EXISTS idx_notification_rules_event_code
  ON public.notification_rules (event_code, is_active);

ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view notification rules" ON public.notification_rules;
CREATE POLICY "Authenticated users can view notification rules"
  ON public.notification_rules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage notification rules" ON public.notification_rules;
CREATE POLICY "Authenticated users can manage notification rules"
  ON public.notification_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON public.notification_rules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_rules TO authenticated;
GRANT ALL ON public.notification_rules TO service_role;

-- Re-seed the baseline rules, matching pre-production exactly.
INSERT INTO public.notification_rules
  (event_code, source_table, receiver_type, notification_channel, is_active, name,
   title_template, message_template)
VALUES
  ('AUTO_DAY_CLOSED','attendance','self','in_app',true,'Day Auto-Closed',
   'Your Day Was Auto-Closed',
   'Your day on {date} has been automatically ended. Last activity detected at {last_activity}.'),
  ('AUTO_DAY_WARNING','attendance','self','in_app',true,'Auto End Day Warning',
   'Reminder: End Your Day','Please End Your Day before log out'),
  ('RECORD_CREATED','leave_applications','employee','in_app',true,'Leave Applied by user',
   'Leave applied on {date}',
   '{user_name} applied leave on {date},Request is sent to the Manager.'),
  ('RECORD_CREATED','leave_applications','manager','in_app',true,
   'Leave Request Notification for Manager','Leave Request - {user_name}',
   '{user_name} has applied for leave. Please review the request.');