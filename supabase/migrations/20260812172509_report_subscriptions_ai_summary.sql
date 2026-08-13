-- AI summary for report subscriptions. The report already fetches exactly the right
-- rows for exactly the right period and recipient scope, so the AI works on that same
-- data -- no second query, no separate configuration of "which data".
--
-- Applied to staging via MCP on 2026-08-12, recorded as 20260812172509. This file
-- keeps the repository in step with the database timeline. Idempotent.

ALTER TABLE public.report_subscriptions
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_prompt  text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_subscriptions_ai_complete_chk') THEN
    ALTER TABLE public.report_subscriptions
      ADD CONSTRAINT report_subscriptions_ai_complete_chk
      CHECK (ai_enabled = false OR btrim(coalesce(ai_prompt,'')) <> '');
  END IF;
END $$;

COMMENT ON COLUMN public.report_subscriptions.ai_enabled IS
  'When true, generate-report asks the AI to summarise this run''s rows and puts the result in the notification, the summary_only body and the PDF. Never replaces the report data.';
COMMENT ON COLUMN public.report_subscriptions.ai_prompt IS
  'What the author wants summarised, e.g. "Call out the biggest drop versus usual and who needs attention."';
