CREATE POLICY "Users can view their own gamification points"
ON public.gamification_points
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);