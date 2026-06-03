-- ============================================================
-- SECTION 1: user_has_permission
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_has_permission(
  _user_id UUID,
  _object  TEXT,
  _perm    TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result BOOLEAN := false;
BEGIN
  IF _perm NOT IN ('can_read','can_create','can_edit','can_delete','can_view_all','can_modify_all') THEN
    RAISE EXCEPTION 'Invalid permission: %', _perm;
  END IF;

  IF is_system_admin(_user_id) THEN RETURN true; END IF;

  EXECUTE format(
    'SELECT COALESCE(%I, false) FROM user_object_permissions
     WHERE user_id = $1 AND object_name = $2 LIMIT 1', _perm)
  INTO result USING _user_id, _object;
  IF result THEN RETURN true; END IF;

  EXECUTE format(
    'SELECT EXISTS (
       SELECT 1 FROM coverage_permission_assignments cpa
       JOIN permission_set_group_permissions psgp ON psgp.group_id = cpa.permission_set_id
       WHERE cpa.user_id = $1
         AND psgp.object_name = $2
         AND psgp.%I = true
         AND cpa.is_active = true
         AND cpa.start_date <= CURRENT_DATE
         AND cpa.end_date >= CURRENT_DATE
     )', _perm)
  INTO result USING _user_id, _object;
  IF result THEN RETURN true; END IF;

  EXECUTE format(
    'SELECT EXISTS (
       SELECT 1 FROM permission_set_group_users psgu
       JOIN permission_set_group_permissions psgp ON psgp.group_id = psgu.group_id
       WHERE psgu.user_id = $1
         AND psgp.object_name = $2
         AND psgp.%I = true
     )', _perm)
  INTO result USING _user_id, _object;
  IF result THEN RETURN true; END IF;

  EXECUTE format(
    'SELECT EXISTS (
       SELECT 1 FROM user_profiles up
       JOIN profile_object_permissions pop ON pop.profile_id = up.profile_id
       WHERE up.user_id = $1
         AND pop.object_name = $2
         AND pop.%I = true
     )', _perm)
  INTO result USING _user_id, _object;
  RETURN COALESCE(result, false);
END;
$$;

-- ============================================================
-- SECTION 2: beats columns + backfill (skip user triggers)
-- ============================================================
ALTER TABLE beats
  ADD COLUMN IF NOT EXISTS transferred_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS transferred_by  UUID        DEFAULT NULL;

SET LOCAL session_replication_role = 'replica';

UPDATE beats
SET owner_id   = user_id,
    owner_name = (
      SELECT COALESCE(p.full_name, p.username, 'Unknown')
      FROM profiles p WHERE p.id = beats.user_id
    )
WHERE owner_id IS NULL AND user_id IS NOT NULL;

-- ============================================================
-- SECTION 3: orders.beat_name_snapshot + backfill
-- ============================================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS beat_name_snapshot TEXT DEFAULT NULL;

UPDATE orders o
SET beat_name_snapshot = b.beat_name
FROM beats b
WHERE b.beat_id = o.beat_id
  AND o.beat_name_snapshot IS NULL;

SET LOCAL session_replication_role = 'origin';

-- ============================================================
-- SECTION 4: beat_user_access
-- ============================================================
CREATE TABLE IF NOT EXISTS beat_user_access (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id        TEXT        NOT NULL,
  user_id        UUID        NOT NULL,
  granted_by     UUID        NOT NULL,
  access_type    TEXT        NOT NULL
                 CHECK (access_type IN ('OWNER','CO_OWNER','VIEW_ONLY','COVERAGE')),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to   TIMESTAMPTZ DEFAULT NULL,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_beat_user_access UNIQUE (beat_id, user_id, access_type)
);
CREATE INDEX IF NOT EXISTS idx_bua_beat_id  ON beat_user_access (beat_id);
CREATE INDEX IF NOT EXISTS idx_bua_user_id  ON beat_user_access (user_id);
CREATE INDEX IF NOT EXISTS idx_bua_active   ON beat_user_access (user_id, beat_id) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.beat_user_access TO authenticated;
GRANT ALL ON public.beat_user_access TO service_role;

ALTER TABLE beat_user_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bua_select" ON beat_user_access;
DROP POLICY IF EXISTS "bua_insert" ON beat_user_access;
DROP POLICY IF EXISTS "bua_update" ON beat_user_access;
CREATE POLICY "bua_select" ON beat_user_access FOR SELECT TO authenticated USING (true);
CREATE POLICY "bua_insert" ON beat_user_access FOR INSERT TO authenticated WITH CHECK (user_has_permission(auth.uid(),'action_beat_share','can_create'));
CREATE POLICY "bua_update" ON beat_user_access FOR UPDATE TO authenticated USING (user_has_permission(auth.uid(),'action_beat_share','can_edit')) WITH CHECK (user_has_permission(auth.uid(),'action_beat_share','can_edit'));

-- ============================================================
-- SECTION 5: beat_ownership_history
-- ============================================================
CREATE TABLE IF NOT EXISTS beat_ownership_history (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id        TEXT        NOT NULL,
  beat_name      TEXT        NOT NULL,
  old_owner_id   UUID        NOT NULL,
  old_owner_name TEXT,
  new_owner_id   UUID        NOT NULL,
  new_owner_name TEXT,
  transferred_by UUID        NOT NULL,
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_boh_beat_id ON beat_ownership_history (beat_id);
CREATE INDEX IF NOT EXISTS idx_boh_old_owner ON beat_ownership_history (old_owner_id);

GRANT SELECT, INSERT ON public.beat_ownership_history TO authenticated;
GRANT ALL ON public.beat_ownership_history TO service_role;

ALTER TABLE beat_ownership_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boh_select" ON beat_ownership_history;
DROP POLICY IF EXISTS "boh_insert" ON beat_ownership_history;
CREATE POLICY "boh_select" ON beat_ownership_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "boh_insert" ON beat_ownership_history FOR INSERT TO authenticated WITH CHECK (user_has_permission(auth.uid(),'action_beat_transfer','can_create'));

-- ============================================================
-- SECTION 6: beat_coverage_assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS beat_coverage_assignments (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id          TEXT    NOT NULL,
  beat_name        TEXT    NOT NULL,
  primary_user_id  UUID    NOT NULL,
  coverage_user_id UUID    NOT NULL,
  assigned_by      UUID    NOT NULL,
  start_date       DATE    NOT NULL,
  end_date         DATE    NOT NULL,
  reason           TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_coverage_dates CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_bca_beat_id      ON beat_coverage_assignments (beat_id);
CREATE INDEX IF NOT EXISTS idx_bca_coverage_user ON beat_coverage_assignments (coverage_user_id);
CREATE INDEX IF NOT EXISTS idx_bca_active        ON beat_coverage_assignments (coverage_user_id, start_date, end_date) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.beat_coverage_assignments TO authenticated;
GRANT ALL ON public.beat_coverage_assignments TO service_role;

ALTER TABLE beat_coverage_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bca_select" ON beat_coverage_assignments;
DROP POLICY IF EXISTS "bca_insert" ON beat_coverage_assignments;
DROP POLICY IF EXISTS "bca_update" ON beat_coverage_assignments;
CREATE POLICY "bca_select" ON beat_coverage_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "bca_insert" ON beat_coverage_assignments FOR INSERT TO authenticated WITH CHECK (user_has_permission(auth.uid(),'action_beat_coverage','can_create'));
CREATE POLICY "bca_update" ON beat_coverage_assignments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- SECTION 7: coverage_permission_assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS coverage_permission_assignments (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID    NOT NULL,
  permission_set_id UUID    NOT NULL REFERENCES permission_set_groups(id),
  start_date        DATE    NOT NULL,
  end_date          DATE    NOT NULL,
  granted_by        UUID    NOT NULL,
  reason            TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_cpa_dates CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_cpa_user_id ON coverage_permission_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_cpa_active  ON coverage_permission_assignments (user_id, start_date, end_date) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coverage_permission_assignments TO authenticated;
GRANT ALL ON public.coverage_permission_assignments TO service_role;

ALTER TABLE coverage_permission_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cpa_select" ON coverage_permission_assignments;
DROP POLICY IF EXISTS "cpa_insert" ON coverage_permission_assignments;
DROP POLICY IF EXISTS "cpa_update" ON coverage_permission_assignments;
CREATE POLICY "cpa_select" ON coverage_permission_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "cpa_insert" ON coverage_permission_assignments FOR INSERT TO authenticated WITH CHECK (is_system_admin(auth.uid()));
CREATE POLICY "cpa_update" ON coverage_permission_assignments FOR UPDATE TO authenticated USING (is_system_admin(auth.uid())) WITH CHECK (is_system_admin(auth.uid()));

-- ============================================================
-- SECTION 8: user_has_beat_access
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_has_beat_access(_user_id UUID, _beat_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM beats WHERE beat_id = _beat_id AND user_id = _user_id
    UNION ALL
    SELECT 1 FROM beat_user_access
    WHERE beat_id = _beat_id AND user_id = _user_id AND is_active = true
      AND (effective_to IS NULL OR effective_to > now())
    UNION ALL
    SELECT 1 FROM beat_coverage_assignments
    WHERE beat_id = _beat_id AND coverage_user_id = _user_id AND is_active = true
      AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE
  );
$$;

-- ============================================================
-- SECTION 9: Seed beat action permissions
-- ============================================================
DO $$
DECLARE
  p RECORD;
  objects TEXT[] := ARRAY[
    'action_beat_share','action_beat_transfer','action_beat_coverage',
    'action_beat_reactivate','action_beat_clone','action_beat_create'
  ];
  obj TEXT;
BEGIN
  FOR p IN SELECT id, is_system FROM security_profiles LOOP
    FOREACH obj IN ARRAY objects LOOP
      INSERT INTO profile_object_permissions
        (profile_id, object_name, permission_type, parent_module,
         can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
      VALUES
        (p.id, obj, 'action', 'my_beats',
         p.is_system, p.is_system, p.is_system, p.is_system, false, false)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

-- ============================================================
-- SECTION 10: beats RLS rebuild
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view all beats for analytics" ON beats;
DROP POLICY IF EXISTS "beats_select" ON beats;
DROP POLICY IF EXISTS "beats_insert" ON beats;

CREATE POLICY "beats_select" ON beats
  FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'module_my_beats', 'can_read'));

CREATE POLICY "beats_insert" ON beats
  FOR INSERT TO authenticated
  WITH CHECK (user_has_permission(auth.uid(), 'action_beat_create', 'can_create'));

-- ============================================================
-- SECTION 11: retailers RLS rebuild
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view all retailers for analytics" ON retailers;
DROP POLICY IF EXISTS "Admins can view all retailers" ON retailers;
DROP POLICY IF EXISTS "Users can view their own retailers" ON retailers;
DROP POLICY IF EXISTS "Users can view retailers they have visits for" ON retailers;
DROP POLICY IF EXISTS "Users can create their own retailers" ON retailers;
DROP POLICY IF EXISTS "Users can update their own retailers" ON retailers;
DROP POLICY IF EXISTS "Admins can update retailer verification status" ON retailers;
DROP POLICY IF EXISTS "Users can delete their own retailers" ON retailers;
DROP POLICY IF EXISTS "retailers_select" ON retailers;
DROP POLICY IF EXISTS "retailers_insert" ON retailers;
DROP POLICY IF EXISTS "retailers_update" ON retailers;
DROP POLICY IF EXISTS "retailers_delete" ON retailers;

CREATE POLICY "retailers_select" ON retailers
  FOR SELECT TO authenticated
  USING (
    user_has_permission(auth.uid(), 'module_my_retailers', 'can_read')
    AND (
      auth.uid() = user_id
      OR user_has_beat_access(auth.uid(), beat_id)
      OR user_has_permission(auth.uid(), 'module_my_retailers', 'can_view_all')
    )
  );

CREATE POLICY "retailers_insert" ON retailers
  FOR INSERT TO authenticated
  WITH CHECK (user_has_permission(auth.uid(), 'action_retailer_create', 'can_create'));

CREATE POLICY "retailers_update" ON retailers
  FOR UPDATE TO authenticated
  USING (
    user_has_permission(auth.uid(), 'action_retailer_edit', 'can_edit')
    AND (auth.uid() = user_id OR user_has_beat_access(auth.uid(), beat_id))
  )
  WITH CHECK (
    user_has_permission(auth.uid(), 'action_retailer_edit', 'can_edit')
    AND (auth.uid() = user_id OR user_has_beat_access(auth.uid(), beat_id))
  );

CREATE POLICY "retailers_delete" ON retailers
  FOR DELETE TO authenticated
  USING (
    user_has_permission(auth.uid(), 'action_retailer_delete', 'can_delete')
    AND auth.uid() = user_id
  );

-- ============================================================
-- SECTION 12: orders RLS rebuild
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated insert orders for portal" ON orders;
DROP POLICY IF EXISTS "Admins can insert all orders" ON orders;
DROP POLICY IF EXISTS "Allow anon insert orders for portal" ON orders;
DROP POLICY IF EXISTS "Users can create their own orders" ON orders;
DROP POLICY IF EXISTS "Users can insert their own orders" ON orders;
DROP POLICY IF EXISTS "Allow anon read orders for portal" ON orders;
DROP POLICY IF EXISTS "Authenticated users can view orders for reporting" ON orders;
DROP POLICY IF EXISTS "Users can view orders for accessible retailers" ON orders;
DROP POLICY IF EXISTS "Users can view their own orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "orders_select" ON orders;
DROP POLICY IF EXISTS "orders_insert" ON orders;

CREATE POLICY "orders_select" ON orders
  FOR SELECT TO authenticated
  USING (
    user_has_permission(auth.uid(), 'module_orders', 'can_read')
    AND (
      auth.uid() = user_id
      OR user_has_beat_access(auth.uid(), beat_id)
      OR user_has_permission(auth.uid(), 'module_orders', 'can_view_all')
    )
  );

CREATE POLICY "orders_insert" ON orders
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_permission(auth.uid(), 'action_order_create', 'can_create')
    AND (auth.uid() = user_id)
    AND user_has_beat_access(auth.uid(), beat_id)
  );

-- ============================================================
-- SECTION 13: visits RLS rebuild (no beat_id column; derive via retailer)
-- ============================================================
DROP POLICY IF EXISTS "Allow anon select visits for portal" ON visits;
DROP POLICY IF EXISTS "Authenticated users can view visits for reporting" ON visits;
DROP POLICY IF EXISTS "Users can view their own visits" ON visits;
DROP POLICY IF EXISTS "Admins can view all visits" ON visits;
DROP POLICY IF EXISTS "Allow anon insert visits for portal" ON visits;
DROP POLICY IF EXISTS "Users can create their own visits" ON visits;
DROP POLICY IF EXISTS "visits_select" ON visits;
DROP POLICY IF EXISTS "visits_insert" ON visits;

CREATE POLICY "visits_select" ON visits
  FOR SELECT TO authenticated
  USING (
    user_has_permission(auth.uid(), 'module_visits', 'can_read')
    AND (
      auth.uid() = user_id
      OR user_has_permission(auth.uid(), 'module_visits', 'can_view_all')
      OR EXISTS (
        SELECT 1 FROM retailers r
        WHERE r.id = visits.retailer_id
          AND user_has_beat_access(auth.uid(), r.beat_id)
      )
    )
  );

CREATE POLICY "visits_insert" ON visits
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_permission(auth.uid(), 'action_visit_create', 'can_create')
    AND auth.uid() = user_id
  );

-- ============================================================
-- SECTION 14: product_schemes RLS rebuild + seed
-- ============================================================
DROP POLICY IF EXISTS "Admins can manage product schemes" ON product_schemes;
DROP POLICY IF EXISTS "schemes_select" ON product_schemes;
DROP POLICY IF EXISTS "schemes_insert" ON product_schemes;
DROP POLICY IF EXISTS "schemes_update" ON product_schemes;
DROP POLICY IF EXISTS "schemes_delete" ON product_schemes;

CREATE POLICY "schemes_select" ON product_schemes
  FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'module_schemes', 'can_read'));

CREATE POLICY "schemes_insert" ON product_schemes
  FOR INSERT TO authenticated
  WITH CHECK (user_has_permission(auth.uid(), 'action_scheme_create', 'can_create'));

CREATE POLICY "schemes_update" ON product_schemes
  FOR UPDATE TO authenticated
  USING (user_has_permission(auth.uid(), 'action_scheme_edit', 'can_edit'))
  WITH CHECK (user_has_permission(auth.uid(), 'action_scheme_edit', 'can_edit'));

CREATE POLICY "schemes_delete" ON product_schemes
  FOR DELETE TO authenticated
  USING (user_has_permission(auth.uid(), 'action_scheme_delete', 'can_delete'));

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT id, is_system FROM security_profiles LOOP
    INSERT INTO profile_object_permissions
      (profile_id, object_name, permission_type, parent_module,
       can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
    VALUES
      (p.id, 'module_my_beats',     'module', 'my_beats',     true, false, false, false, p.is_system, p.is_system),
      (p.id, 'module_my_retailers', 'module', 'my_retailers', true, false, false, false, p.is_system, p.is_system),
      (p.id, 'module_orders',       'module', 'orders',       true, false, false, false, p.is_system, p.is_system),
      (p.id, 'module_visits',       'module', 'visits',       true, false, false, false, p.is_system, p.is_system),
      (p.id, 'module_schemes',      'module', 'schemes',      true, false, false, false, false, false),
      (p.id, 'action_scheme_create',  'action', 'schemes',      p.is_system, p.is_system, false,       false,       false, false),
      (p.id, 'action_scheme_edit',    'action', 'schemes',      p.is_system, p.is_system, p.is_system, false,       false, false),
      (p.id, 'action_scheme_delete',  'action', 'schemes',      p.is_system, p.is_system, p.is_system, p.is_system, false, false),
      (p.id, 'action_order_create',   'action', 'orders',       true,        p.is_system, false,       false,       false, false),
      (p.id, 'action_order_edit',     'action', 'orders',       true,        p.is_system, p.is_system, false,       false, false),
      (p.id, 'action_visit_create',   'action', 'visits',       true,        p.is_system, false,       false,       false, false),
      (p.id, 'action_visit_edit',     'action', 'visits',       true,        p.is_system, p.is_system, false,       false, false),
      (p.id, 'action_retailer_create','action', 'my_retailers', true,        p.is_system, false,       false,       false, false),
      (p.id, 'action_retailer_edit',  'action', 'my_retailers', true,        p.is_system, p.is_system, false,       false, false),
      (p.id, 'action_retailer_delete','action', 'my_retailers', true,        p.is_system, p.is_system, p.is_system, false, false)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;
