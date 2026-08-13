-- Let the report author decide what a System Administrator receives when
-- "Respect reporting hierarchy" is on.
--
-- Until now admins were unconditionally exempt: they always got the
-- organisation-wide file. That is right for an oversight report and wrong for a
-- "how is MY team doing" report, where an admin who also runs a team wants their
-- own subtree like everybody else.
--
--   global        -> admin receives the organisation-wide report (previous behaviour)
--   own_hierarchy -> admin is scoped to their own reporting tree, same as anyone else
--
-- Defaults to 'global' so every existing subscription behaves exactly as before.
ALTER TABLE public.report_subscriptions
  ADD COLUMN IF NOT EXISTS admin_scope text NOT NULL DEFAULT 'global';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_subscriptions_admin_scope_chk') THEN
    ALTER TABLE public.report_subscriptions
      ADD CONSTRAINT report_subscriptions_admin_scope_chk
      CHECK (admin_scope IN ('global','own_hierarchy'));
  END IF;
END $$;

COMMENT ON COLUMN public.report_subscriptions.admin_scope IS
  'What a System Administrator recipient receives when respect_hierarchy is true: global = organisation-wide, own_hierarchy = only their own reporting tree. Ignored when respect_hierarchy is false.';
