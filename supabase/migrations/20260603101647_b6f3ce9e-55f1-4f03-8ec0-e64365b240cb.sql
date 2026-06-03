DROP POLICY IF EXISTS "Profile-based beat edit" ON beats;

CREATE POLICY "beats_update" ON beats
FOR UPDATE TO authenticated
USING (
  user_has_permission(auth.uid(), 'action_beat_edit', 'can_edit')
  AND (
    auth.uid() = user_id
    OR user_has_beat_access(auth.uid(), beat_id)
  )
)
WITH CHECK (
  user_has_permission(auth.uid(), 'action_beat_edit', 'can_edit')
  AND (
    auth.uid() = user_id
    OR user_has_beat_access(auth.uid(), beat_id)
  )
);

DROP POLICY IF EXISTS "Profile-based beat delete" ON beats;

CREATE POLICY "beats_delete" ON beats
FOR DELETE TO authenticated
USING (
  user_has_permission(auth.uid(), 'action_beat_delete', 'can_delete')
  AND auth.uid() = user_id
);

DROP POLICY IF EXISTS "Users can update their own visits" ON visits;

CREATE POLICY "visits_update" ON visits
FOR UPDATE TO authenticated
USING (
  user_has_permission(auth.uid(), 'action_visit_edit', 'can_edit')
  AND auth.uid() = user_id
)
WITH CHECK (
  user_has_permission(auth.uid(), 'action_visit_edit', 'can_edit')
  AND auth.uid() = user_id
);