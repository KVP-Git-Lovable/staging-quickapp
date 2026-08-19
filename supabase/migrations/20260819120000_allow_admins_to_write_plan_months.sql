-- Admins and managers can already create, update and delete a business plan for
-- any user, but the monthly rows belonging to that plan were restricted to the
-- plan's own owner. That made the monthly breakdown impossible to save for
-- anyone but yourself: the insert failed the row-level check every time, which
-- surfaced in the UI as "Could not save this month".
--
-- These mirror the grants already in place on user_business_plans, so nobody
-- gains access to anything they could not already reach through the parent row.

CREATE POLICY "Admins can create plan months for any user"
  ON public.user_business_plan_months
  FOR INSERT
  WITH CHECK (public.is_admin_or_manager());

CREATE POLICY "Admins can update any plan months"
  ON public.user_business_plan_months
  FOR UPDATE
  USING (public.is_admin_or_manager());

CREATE POLICY "Admins can delete any plan months"
  ON public.user_business_plan_months
  FOR DELETE
  USING (public.is_admin_or_manager());
