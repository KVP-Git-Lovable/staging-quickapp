ALTER TABLE public.employee_market_visits
  ADD COLUMN IF NOT EXISTS joint_visit_partner_id uuid,
  ADD COLUMN IF NOT EXISTS joint_visit_partner_name text,
  ADD COLUMN IF NOT EXISTS joint_sales_feedback jsonb NOT NULL DEFAULT '{}'::jsonb;