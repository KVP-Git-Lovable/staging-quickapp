-- Root cause of "numeric field overflow" on retailer creation (e.g. Virat
-- Retailers, retry #4+): the client occasionally submits a latitude/longitude
-- value >= 1000 in absolute value (impossible for a real GPS coordinate --
-- valid range is +/-90 / +/-180). retailers.latitude/longitude are
-- numeric(9,6), so Postgres hard-rejects the whole INSERT/UPDATE with
-- "numeric field overflow". Since this is an offline-first app retry queue,
-- the same corrupted value gets resent forever -- the retailer can never be
-- created until manually fixed.
--
-- This trigger validates lat/long BEFORE they hit the column: if either is
-- outside the physically valid range, both are nulled out (rather than
-- failing the whole record) and the anomaly is logged to data_health_log so
-- the bad GPS capture on the client can still be traced and fixed at the
-- source. The retailer record itself is created successfully either way.
CREATE OR REPLACE FUNCTION public.guard_retailer_gps_coordinates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.latitude IS NOT NULL AND (NEW.latitude < -90 OR NEW.latitude > 90))
     OR (NEW.longitude IS NOT NULL AND (NEW.longitude < -180 OR NEW.longitude > 180))
  THEN
    INSERT INTO public.data_health_log (check_name, anomaly_count, sample_ids, checked_at)
    VALUES (
      'invalid_gps_coordinates_on_retailer_write',
      1,
      ARRAY[format('retailer_id=%s name=%s lat=%s lng=%s', NEW.id, NEW.name, NEW.latitude, NEW.longitude)],
      now()
    );
    NEW.latitude := NULL;
    NEW.longitude := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_guard_retailer_gps_coordinates
BEFORE INSERT OR UPDATE OF latitude, longitude ON public.retailers
FOR EACH ROW
EXECUTE FUNCTION public.guard_retailer_gps_coordinates();