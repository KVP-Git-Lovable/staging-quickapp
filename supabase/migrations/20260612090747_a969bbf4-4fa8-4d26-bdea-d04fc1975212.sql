
-- Recreate calculate_retailer_quality_score without verification_status reference
CREATE OR REPLACE FUNCTION public.calculate_retailer_quality_score(p_retailer_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF r.retailer_confirmed = true OR r.verified = true THEN score := score + 10; END IF;

  has_first_visit := r.first_visit_completed OR EXISTS (SELECT 1 FROM public.visits v WHERE v.retailer_id = r.id LIMIT 1);
  has_first_order := r.first_order_placed OR EXISTS (SELECT 1 FROM public.orders o WHERE o.retailer_id = r.id LIMIT 1);
  IF has_first_visit THEN score := score + 5; END IF;
  IF has_first_order THEN score := score + 5; END IF;

  score := greatest(0, least(100, score));

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
END;
$$;

-- Recreate trg_retailer_score_recalc without verification_status reference
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
     OR (NEW.verified IS DISTINCT FROM OLD.verified)
     OR (NEW.verification_address IS DISTINCT FROM OLD.verification_address)
     OR (NEW.first_visit_completed IS DISTINCT FROM OLD.first_visit_completed)
     OR (NEW.first_order_placed IS DISTINCT FROM OLD.first_order_placed)
  THEN
    PERFORM public.calculate_retailer_quality_score(NEW.id);
  END IF;
  RETURN NEW;
END; $$;

-- Recreate trg_retailer_audit_log without verification_status reference
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
  IF NEW.verified IS DISTINCT FROM OLD.verified THEN
    INSERT INTO public.retailer_audit_log(retailer_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'verified', OLD.verified::text, NEW.verified::text, uid, uname);
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.retailer_audit_log(retailer_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'status', OLD.status, NEW.status, uid, uname);
  END IF;
  RETURN NEW;
END; $$;
