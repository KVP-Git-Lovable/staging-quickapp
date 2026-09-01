-- gamification_actions had only an admin ALL policy, so non-admin users could
-- not read activity names: every row in the rep-facing Points Breakdown showed
-- "Unknown Action" (game names resolved fine — gamification_games already has a
-- public read policy). Activity name/points/description are display data shown
-- to reps across the app; grant read the same way games do. Management stays
-- admin-only via the existing policy.
CREATE POLICY "Authenticated can read gamification_actions"
ON public.gamification_actions
FOR SELECT
TO authenticated
USING (true);
