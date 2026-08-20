-- Performance-only rewrite of the retailers SELECT policy.
-- The two row-INDEPENDENT user_has_permission(...) calls are wrapped in
-- scalar subselects so Postgres evaluates them once per statement (InitPlan)
-- instead of once per row (~0.78ms/call x 5k rows blew the authenticated
-- role's 8s statement_timeout for full-table scans such as the AI Beat
-- Planner's coverage query). Boolean structure, operands and semantics are
-- otherwise IDENTICAL to the previous definition; ALTER POLICY keeps the
-- policy's roles/cmd/permissive intact.
ALTER POLICY retailers_select ON public.retailers
USING (
  (SELECT user_has_permission(auth.uid(), 'module_my_retailers'::text, 'can_read'::text))
  AND (
    (auth.uid() = user_id)
    OR user_has_beat_access(auth.uid(), beat_id)
    OR (EXISTS ( SELECT 1
       FROM daily_beat_plans dbp
      WHERE ((dbp.beat_id = retailers.beat_id) AND (dbp.assigned_user_id = auth.uid()) AND (dbp.status = 'active'::text))))
    OR is_subordinate_of(auth.uid(), user_id)
    OR (SELECT user_has_permission(auth.uid(), 'module_my_retailers'::text, 'can_view_all'::text))
    OR retailer_in_user_oob_scope(id)
  )
);
