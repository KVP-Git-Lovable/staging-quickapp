CREATE OR REPLACE FUNCTION public.calculate_retailer_quality_score(p_retailer_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Floor: a manually-approved or WhatsApp-confirmed retailer is always >= 80
  IF (r.verified = true AND r.verification_status = 'verified')
     OR r.whatsapp_verified = true THEN
    IF score < 80 THEN score := 80; END IF;
  END IF;

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
END; $function$;

-- Backfill: recompute the score for the Kuvempunagar retailer and any other
-- already-verified retailers currently sitting below 80.
SELECT public.calculate_retailer_quality_score(id)
FROM public.retailers
WHERE (verified = true AND verification_status = 'verified')
   OR whatsapp_verified = true;
