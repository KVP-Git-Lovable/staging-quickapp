-- When true (the default), generate-report builds each recipient's file from
-- that recipient's own slice of the employees.manager_id tree: themselves plus
-- everyone beneath them, never anyone above or beside them. System admins
-- bypass it and continue to receive the org-wide file.
ALTER TABLE public.report_subscriptions
  ADD COLUMN IF NOT EXISTS respect_hierarchy boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.report_subscriptions.respect_hierarchy IS
  'Scope each recipient''s report to their own subtree in employees.manager_id. System admins bypass. Turn off only for deliberately org-wide reports.';

NOTIFY pgrst, 'reload schema';