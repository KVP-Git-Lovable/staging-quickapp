-- Visits is a selectable target metric alongside Quantity and Revenue, and the
-- annual plan already carries a visits figure, but the monthly rows had nowhere
-- to put one — so a plan tracking visits could not be broken down by month.
--
-- Additive and defaulted, so every existing row reads as zero visits.

ALTER TABLE public.user_business_plan_months
  ADD COLUMN IF NOT EXISTS visits_target numeric NOT NULL DEFAULT 0;

-- The annual plan tracks a quantity and a revenue target but never a visits
-- one, even though Productive Visits is a selectable target metric. Without it
-- there is no annual figure for the monthly visits rows to be a share of.

ALTER TABLE public.user_business_plans
  ADD COLUMN IF NOT EXISTS visits_target numeric NOT NULL DEFAULT 0;
