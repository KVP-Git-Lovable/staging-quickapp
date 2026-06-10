
-- 1. Extend retailers
ALTER TABLE public.retailers
  ADD COLUMN IF NOT EXISTS verification_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quality_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS duplicate_risk_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.retailers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alternate_phone text,
  ADD COLUMN IF NOT EXISTS shop_front_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_visit_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_order_placed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retailer_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quality_last_calculated_at timestamptz;

-- 2. Change requests
CREATE TABLE IF NOT EXISTS public.retailer_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id uuid NOT NULL REFERENCES public.retailers(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  requested_by uuid,
  requested_by_name text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approval_status text NOT NULL DEFAULT 'pending',
  approved_by uuid,
  approved_by_name text,
  approved_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retailer_change_requests TO authenticated;
GRANT ALL ON public.retailer_change_requests TO service_role;
ALTER TABLE public.retailer_change_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rcr_select_authenticated" ON public.retailer_change_requests;
CREATE POLICY "rcr_select_authenticated" ON public.retailer_change_requests FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rcr_insert_authenticated" ON public.retailer_change_requests;
CREATE POLICY "rcr_insert_authenticated" ON public.retailer_change_requests FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "rcr_update_admin_or_requester" ON public.retailer_change_requests;
CREATE POLICY "rcr_update_admin_or_requester" ON public.retailer_change_requests
  FOR UPDATE TO authenticated USING (
    requested_by = auth.uid() OR public.has_role(auth.uid(), 'admin')
  );
CREATE INDEX IF NOT EXISTS idx_rcr_retailer ON public.retailer_change_requests(retailer_id);
CREATE INDEX IF NOT EXISTS idx_rcr_status ON public.retailer_change_requests(approval_status);

-- 3. Audit log
CREATE TABLE IF NOT EXISTS public.retailer_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id uuid NOT NULL REFERENCES public.retailers(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.retailer_audit_log TO authenticated;
GRANT ALL ON public.retailer_audit_log TO service_role;
ALTER TABLE public.retailer_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ral_select_authenticated" ON public.retailer_audit_log;
CREATE POLICY "ral_select_authenticated" ON public.retailer_audit_log FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_ral_retailer ON public.retailer_audit_log(retailer_id);
CREATE INDEX IF NOT EXISTS idx_ral_changed_at ON public.retailer_audit_log(changed_at DESC);

-- 4. Gamification points
CREATE TABLE IF NOT EXISTS public.retailer_creation_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id uuid NOT NULL REFERENCES public.retailers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  activity text NOT NULL,
  points integer NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  reversed boolean NOT NULL DEFAULT false,
  reversed_at timestamptz,
  reversal_reason text,
  UNIQUE (retailer_id, user_id, activity)
);
GRANT SELECT ON public.retailer_creation_points TO authenticated;
GRANT ALL ON public.retailer_creation_points TO service_role;
ALTER TABLE public.retailer_creation_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rcp_select_own_or_admin" ON public.retailer_creation_points;
CREATE POLICY "rcp_select_own_or_admin" ON public.retailer_creation_points
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
  );
CREATE INDEX IF NOT EXISTS idx_rcp_user ON public.retailer_creation_points(user_id);
CREATE INDEX IF NOT EXISTS idx_rcp_retailer ON public.retailer_creation_points(retailer_id);

-- 5. Quality score calculator
CREATE OR REPLACE FUNCTION public.calculate_retailer_quality_score(p_retailer_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.retailers%ROWTYPE;
  score integer := 0;
  new_status text;
  has_first_visit boolean := false;
  has_first_order boolean := false;
BEGIN
  SELECT * INTO r FROM public.retailers WHERE id = p_retailer_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF r.name IS NOT NULL AND length(trim(r.name)) > 1 THEN score := score + 5; END IF;
  IF r.phone IS NOT NULL AND length(regexp_replace(r.phone, '\D', '', 'g')) >= 10 THEN score := score + 10; END IF;
  IF r.address IS NOT NULL AND length(trim(r.address)) > 3 THEN score := score + 5; END IF;
  IF r.category IS NOT NULL AND length(trim(r.category)) > 0 THEN score := score + 5; END IF;
  IF r.gst_number IS NOT NULL AND length(trim(r.gst_number)) >= 10 THEN score := score + 5; END IF;

  IF r.latitude IS NOT NULL AND r.longitude IS NOT NULL THEN score := score + 5; END IF;
  IF r.verification_address = true THEN score := score + 5; END IF;
  IF r.photo_url IS NOT NULL AND length(trim(r.photo_url)) > 0 THEN score := score + 5; END IF;
  IF r.shop_front_visible = true THEN score := score + 5; END IF;

  IF r.owner_name IS NOT NULL AND length(trim(r.owner_name)) > 0 THEN score := score + 5; END IF;
  IF r.alternate_phone IS NOT NULL AND length(regexp_replace(r.alternate_phone, '\D', '', 'g')) >= 10 THEN score := score + 3; END IF;
  IF r.distributor_id IS NOT NULL THEN score := score + 5; END IF;
  IF r.beat_id IS NOT NULL AND length(trim(r.beat_id)) > 0 THEN score := score + 3; END IF;
  IF r.retail_type IS NOT NULL AND length(trim(r.retail_type)) > 0 THEN score := score + 4; END IF;

  IF r.whatsapp_verified = true THEN score := score + 10; END IF;
  IF r.retailer_confirmed = true OR r.verification_status = 'verified' THEN score := score + 10; END IF;

  has_first_visit := r.first_visit_completed
                    OR EXISTS (SELECT 1 FROM public.visits v WHERE v.retailer_id = r.id LIMIT 1);
  has_first_order := r.first_order_placed
                    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.retailer_id = r.id LIMIT 1);
  IF has_first_visit THEN score := score + 5; END IF;
  IF has_first_order THEN score := score + 5; END IF;

  IF score > 100 THEN score := 100; END IF;
  IF score < 0 THEN score := 0; END IF;

  IF score >= 90 THEN new_status := 'gold';
  ELSIF score >= 70 THEN new_status := 'verified';
  ELSIF score >= 40 THEN new_status := 'partial';
  ELSE new_status := 'unverified';
  END IF;

  UPDATE public.retailers
     SET verification_score = score,
         quality_status = new_status,
         quality_last_calculated_at = now()
   WHERE id = p_retailer_id;

  RETURN score;
END; $$;

-- 6. Score recompute trigger
CREATE OR REPLACE FUNCTION public.trg_retailer_score_recalc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR (NEW.name IS DISTINCT FROM OLD.name)
     OR (NEW.phone IS DISTINCT FROM OLD.phone)
     OR (NEW.address IS DISTINCT FROM OLD.address)
     OR (NEW.category IS DISTINCT FROM OLD.category)
     OR (NEW.gst_number IS DISTINCT FROM OLD.gst_number)
     OR (NEW.latitude IS DISTINCT FROM OLD.latitude)
     OR (NEW.longitude IS DISTINCT FROM OLD.longitude)
     OR (NEW.photo_url IS DISTINCT FROM OLD.photo_url)
     OR (NEW.shop_front_visible IS DISTINCT FROM OLD.shop_front_visible)
     OR (NEW.owner_name IS DISTINCT FROM OLD.owner_name)
     OR (NEW.alternate_phone IS DISTINCT FROM OLD.alternate_phone)
     OR (NEW.distributor_id IS DISTINCT FROM OLD.distributor_id)
     OR (NEW.beat_id IS DISTINCT FROM OLD.beat_id)
     OR (NEW.retail_type IS DISTINCT FROM OLD.retail_type)
     OR (NEW.whatsapp_verified IS DISTINCT FROM OLD.whatsapp_verified)
     OR (NEW.retailer_confirmed IS DISTINCT FROM OLD.retailer_confirmed)
     OR (NEW.verification_status IS DISTINCT FROM OLD.verification_status)
     OR (NEW.verification_address IS DISTINCT FROM OLD.verification_address)
     OR (NEW.first_visit_completed IS DISTINCT FROM OLD.first_visit_completed)
     OR (NEW.first_order_placed IS DISTINCT FROM OLD.first_order_placed)
  THEN
    PERFORM public.calculate_retailer_quality_score(NEW.id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS retailers_score_recalc ON public.retailers;
CREATE TRIGGER retailers_score_recalc
AFTER INSERT OR UPDATE ON public.retailers
FOR EACH ROW EXECUTE FUNCTION public.trg_retailer_score_recalc();

-- 7. Audit log trigger
CREATE OR REPLACE FUNCTION public.trg_retailer_audit_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
BEGIN
  SELECT COALESCE(full_name, username) INTO uname FROM public.profiles WHERE id = uid;

  IF NEW.name IS DISTINCT FROM OLD.name THEN
    INSERT INTO public.retailer_audit_log(retailer_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'name', OLD.name, NEW.name, uid, uname);
  END IF;
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    INSERT INTO public.retailer_audit_log(retailer_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'phone', OLD.phone, NEW.phone, uid, uname);
  END IF;
  IF NEW.address IS DISTINCT FROM OLD.address THEN
    INSERT INTO public.retailer_audit_log(retailer_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'address', OLD.address, NEW.address, uid, uname);
  END IF;
  IF NEW.owner_name IS DISTINCT FROM OLD.owner_name THEN
    INSERT INTO public.retailer_audit_log(retailer_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'owner_name', OLD.owner_name, NEW.owner_name, uid, uname);
  END IF;
  IF NEW.gst_number IS DISTINCT FROM OLD.gst_number THEN
    INSERT INTO public.retailer_audit_log(retailer_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'gst_number', OLD.gst_number, NEW.gst_number, uid, uname);
  END IF;
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    INSERT INTO public.retailer_audit_log(retailer_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'verification_status', OLD.verification_status, NEW.verification_status, uid, uname);
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.retailer_audit_log(retailer_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'status', OLD.status, NEW.status, uid, uname);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS retailers_audit_log ON public.retailers;
CREATE TRIGGER retailers_audit_log
AFTER UPDATE ON public.retailers
FOR EACH ROW EXECUTE FUNCTION public.trg_retailer_audit_log();

-- 8. Duplicate detection
CREATE OR REPLACE FUNCTION public.detect_retailer_duplicates(
  p_retailer_id uuid, p_phone text, p_gst text, p_lat numeric, p_lng numeric, p_name text, p_address text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  risk integer := 0;
  excl uuid := COALESCE(p_retailer_id, '00000000-0000-0000-0000-000000000000'::uuid);
  has_match boolean;
BEGIN
  IF p_phone IS NOT NULL AND length(regexp_replace(p_phone,'\D','','g')) >= 10 THEN
    has_match := EXISTS (
      SELECT 1 FROM public.retailers WHERE id <> excl
      AND regexp_replace(COALESCE(phone,''),'\D','','g') = regexp_replace(p_phone,'\D','','g')
    );
    IF has_match THEN risk := risk + 35; END IF;
  END IF;

  IF p_gst IS NOT NULL AND length(trim(p_gst)) >= 10 THEN
    has_match := EXISTS (
      SELECT 1 FROM public.retailers WHERE id <> excl
      AND upper(trim(COALESCE(gst_number,''))) = upper(trim(p_gst))
    );
    IF has_match THEN risk := risk + 30; END IF;
  END IF;

  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    has_match := EXISTS (
      SELECT 1 FROM public.retailers WHERE id <> excl
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND abs(latitude - p_lat) < 0.00045 AND abs(longitude - p_lng) < 0.00045
    );
    IF has_match THEN risk := risk + 20; END IF;
  END IF;

  IF p_name IS NOT NULL AND length(trim(p_name)) > 3 THEN
    has_match := EXISTS (
      SELECT 1 FROM public.retailers WHERE id <> excl
      AND lower(regexp_replace(COALESCE(name,''),'\s+',' ','g')) = lower(regexp_replace(p_name,'\s+',' ','g'))
    );
    IF has_match THEN risk := risk + 10; END IF;
  END IF;

  IF p_address IS NOT NULL AND length(trim(p_address)) > 5 THEN
    has_match := EXISTS (
      SELECT 1 FROM public.retailers WHERE id <> excl
      AND lower(regexp_replace(COALESCE(address,''),'\s+',' ','g')) = lower(regexp_replace(p_address,'\s+',' ','g'))
    );
    IF has_match THEN risk := risk + 5; END IF;
  END IF;

  IF risk > 100 THEN risk := 100; END IF;
  RETURN risk;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_retailer_duplicate_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.duplicate_risk_score := public.detect_retailer_duplicates(
    NEW.id, NEW.phone, NEW.gst_number, NEW.latitude, NEW.longitude, NEW.name, NEW.address
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS retailers_duplicate_check ON public.retailers;
CREATE TRIGGER retailers_duplicate_check
BEFORE INSERT OR UPDATE OF phone, gst_number, latitude, longitude, name, address ON public.retailers
FOR EACH ROW EXECUTE FUNCTION public.trg_retailer_duplicate_check();

-- 9. Award/reverse points
CREATE OR REPLACE FUNCTION public.award_retailer_points(p_retailer_id uuid, p_activity text, p_points integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rep uuid;
BEGIN
  SELECT COALESCE(created_by, user_id) INTO rep FROM public.retailers WHERE id = p_retailer_id;
  IF rep IS NULL THEN RETURN; END IF;
  INSERT INTO public.retailer_creation_points(retailer_id, user_id, activity, points)
  VALUES (p_retailer_id, rep, p_activity, p_points)
  ON CONFLICT (retailer_id, user_id, activity) DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.reverse_retailer_points(p_retailer_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.retailer_creation_points
     SET reversed = true, reversed_at = now(), reversal_reason = p_reason
   WHERE retailer_id = p_retailer_id AND reversed = false;
END; $$;

-- 10. Backfill scores for existing retailers
DO $$ DECLARE rid uuid;
BEGIN
  FOR rid IN SELECT id FROM public.retailers LIMIT 5000 LOOP
    PERFORM public.calculate_retailer_quality_score(rid);
  END LOOP;
END $$;
