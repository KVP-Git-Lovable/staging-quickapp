## Goal
Replace the current `beats` table UPDATE and DELETE RLS policies with profile-based policies that check `profile_object_permissions` instead of ownership (`auth.uid() = user_id`).

## Approach

### 1. Create a SECURITY DEFINER helper function
To avoid repeating the join in every policy and to prevent any RLS recursion risk on `user_profiles` / `profile_object_permissions`:

```sql
CREATE OR REPLACE FUNCTION public.user_has_action_permission(
  _user_id uuid,
  _action text,
  _perm text  -- 'can_edit' | 'can_delete' | 'can_create' | 'can_read'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result boolean;
BEGIN
  EXECUTE format('
    SELECT EXISTS (
      SELECT 1
      FROM user_profiles up
      JOIN profile_object_permissions pop ON pop.profile_id = up.profile_id
      WHERE up.user_id = $1
        AND pop.object_name = $2
        AND pop.%I = true
    )', _perm)
  INTO result
  USING _user_id, _action;
  RETURN result;
END;
$$;
```

### 2. Replace beats UPDATE policy
Drop any existing UPDATE policy and create:

```sql
CREATE POLICY "Profile-based beat edit"
ON public.beats
FOR UPDATE
TO authenticated
USING (public.user_has_action_permission(auth.uid(), 'action_beat_edit', 'can_edit'))
WITH CHECK (public.user_has_action_permission(auth.uid(), 'action_beat_edit', 'can_edit'));
```

### 3. Replace beats DELETE policy

```sql
CREATE POLICY "Profile-based beat delete"
ON public.beats
FOR DELETE
TO authenticated
USING (public.user_has_action_permission(auth.uid(), 'action_beat_delete', 'can_delete'));
```

## Pre-flight checks before writing the migration
1. Read the current policies on `public.beats` to know exact names to drop.
2. Confirm `action_beat_edit` and `action_beat_delete` rows actually exist in `profile_object_permissions` for the 4 profiles you listed.
3. Confirm `user_profiles` and `profile_object_permissions` are readable by `authenticated` (the SECURITY DEFINER function bypasses RLS, so this only matters for grants — function runs as owner).

## What stays untouched
- SELECT, INSERT policies on `beats` (not part of this request).
- All other tables.
- Frontend code — UI already drives off the same permissions hook, so no app changes needed.

## Verification after apply
- As System Administrator / Sales Manager: edit + delete a test beat → succeeds.
- As Data Viewer: edit + delete attempt → blocked by RLS (PostgREST returns permission error).
- Toggle "Edit Beat" off for Sales Manager in Security UI → that user immediately loses edit ability without code redeploy.

Confirm and I'll switch to build mode and submit the migration.
