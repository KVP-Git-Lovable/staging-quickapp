-- AI summary add-on for the Notification Center.
-- Additive only: new columns default OFF, so every existing rule behaves exactly as before.
--
-- Applied to staging via MCP on 2026-08-12 and recorded in
-- supabase_migrations.schema_migrations as 20260812171210. This file exists so the
-- repository and the database timeline agree — without it a rebuild from source
-- would not know the feature exists. Idempotent: safe to re-run.

ALTER TABLE public.notification_rules
  ADD COLUMN IF NOT EXISTS ai_enabled       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_dataset_key   text     REFERENCES public.reportable_datasets(key) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_prompt        text,
  ADD COLUMN IF NOT EXISTS ai_lookback_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS ai_scope         text    NOT NULL DEFAULT 'actor';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_rules_ai_lookback_chk') THEN
    ALTER TABLE public.notification_rules
      ADD CONSTRAINT notification_rules_ai_lookback_chk CHECK (ai_lookback_days BETWEEN 1 AND 90);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_rules_ai_scope_chk') THEN
    ALTER TABLE public.notification_rules
      ADD CONSTRAINT notification_rules_ai_scope_chk CHECK (ai_scope IN ('actor','hierarchy','all'));
  END IF;
  -- A rule may only claim to be AI-enabled if it actually has a dataset and a prompt.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_rules_ai_complete_chk') THEN
    ALTER TABLE public.notification_rules
      ADD CONSTRAINT notification_rules_ai_complete_chk
      CHECK (ai_enabled = false OR (ai_dataset_key IS NOT NULL AND btrim(coalesce(ai_prompt,'')) <> ''));
  END IF;
END $$;

COMMENT ON COLUMN public.notification_rules.ai_enabled IS
  'When true, an AI summary paragraph is appended to the notification message asynchronously. The deterministic template text is never replaced.';
COMMENT ON COLUMN public.notification_rules.ai_scope IS
  'actor = only the acting user''s rows; hierarchy = the recipient''s reporting tree; all = org-wide (admins only).';

-- Observability. Without this, a failed AI call is invisible.
CREATE TABLE IF NOT EXISTS public.notification_ai_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid,
  rule_id         uuid,
  dataset_key     text,
  scope_user_id   uuid,
  status          text NOT NULL DEFAULT 'pending',
  row_count       integer,
  model           text,
  duration_ms     integer,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS notification_ai_log_notification_idx ON public.notification_ai_log (notification_id);
CREATE INDEX IF NOT EXISTS notification_ai_log_created_idx      ON public.notification_ai_log (created_at DESC);

ALTER TABLE public.notification_ai_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notification_ai_log' AND policyname='Admins can view AI log') THEN
    CREATE POLICY "Admins can view AI log" ON public.notification_ai_log
      FOR SELECT TO authenticated USING (public.is_admin_or_manager());
  END IF;
END $$;

GRANT SELECT ON public.notification_ai_log TO authenticated;
