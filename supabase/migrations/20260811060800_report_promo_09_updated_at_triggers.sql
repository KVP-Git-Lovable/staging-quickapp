-- Report promotion 09/09 — updated_at maintenance on the report tables.
--
-- These three tables all carry an `updated_at` column with a default of now(),
-- but production has no trigger to advance it on UPDATE — so the value records
-- when a row was CREATED and then never moves again. Staging has the triggers;
-- this brings the two into line.
--
-- Small, but not purely cosmetic: `updated_at` on report_subscriptions is the
-- only record of when a schedule, recipient list or template was last changed.
-- Without the trigger it silently lies.
--
-- update_updated_at_column() already exists in both environments, so this adds
-- triggers only. Guarded so it replays cleanly where they are already present.

DROP TRIGGER IF EXISTS trg_report_subscriptions_updated ON public.report_subscriptions;
CREATE TRIGGER trg_report_subscriptions_updated
  BEFORE UPDATE ON public.report_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_report_definitions_updated ON public.report_definitions;
CREATE TRIGGER trg_report_definitions_updated
  BEFORE UPDATE ON public.report_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_reportable_datasets_updated ON public.reportable_datasets;
CREATE TRIGGER trg_reportable_datasets_updated
  BEFORE UPDATE ON public.reportable_datasets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
