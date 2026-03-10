
-- Permission Set Groups table
CREATE TABLE public.permission_set_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.permission_set_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read permission set groups"
ON public.permission_set_groups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage permission set groups"
ON public.permission_set_groups FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Permission Set Group Users (assign users to groups)
CREATE TABLE public.permission_set_group_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.permission_set_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.permission_set_group_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read group users"
ON public.permission_set_group_users FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage group users"
ON public.permission_set_group_users FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Permission Set Group Permissions (module permissions per group)
CREATE TABLE public.permission_set_group_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.permission_set_groups(id) ON DELETE CASCADE,
  object_name TEXT NOT NULL,
  can_read BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  can_view_all BOOLEAN NOT NULL DEFAULT false,
  can_modify_all BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, object_name)
);

ALTER TABLE public.permission_set_group_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read group permissions"
ON public.permission_set_group_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage group permissions"
ON public.permission_set_group_permissions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Grant permissions to authenticated and anon roles (per project convention)
GRANT ALL ON public.permission_set_groups TO authenticated, anon;
GRANT ALL ON public.permission_set_group_users TO authenticated, anon;
GRANT ALL ON public.permission_set_group_permissions TO authenticated, anon;

-- Trigger for updated_at
CREATE TRIGGER update_permission_set_groups_updated_at
BEFORE UPDATE ON public.permission_set_groups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
