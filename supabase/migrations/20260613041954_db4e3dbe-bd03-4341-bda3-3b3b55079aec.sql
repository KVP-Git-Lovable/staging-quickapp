CREATE POLICY "retailers_update"
ON public.retailers
FOR UPDATE
TO authenticated
USING (
  user_has_permission(auth.uid(), 'module_my_retailers', 'can_edit')
  AND (
    auth.uid() = user_id
    OR user_has_beat_access(auth.uid(), beat_id)
    OR user_has_permission(auth.uid(), 'module_my_retailers', 'can_view_all')
  )
)
WITH CHECK (
  user_has_permission(auth.uid(), 'module_my_retailers', 'can_edit')
  AND (
    auth.uid() = user_id
    OR user_has_beat_access(auth.uid(), beat_id)
    OR user_has_permission(auth.uid(), 'module_my_retailers', 'can_view_all')
  )
);