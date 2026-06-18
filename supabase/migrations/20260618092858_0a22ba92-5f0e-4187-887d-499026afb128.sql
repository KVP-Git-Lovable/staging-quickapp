-- 1. One-time backfill
UPDATE public.retailers r
SET beat_name = b.beat_name
FROM public.beats b
WHERE r.beat_id = b.beat_id
  AND (
    r.beat_name IS NULL
    OR r.beat_name = r.beat_id
    OR r.beat_name ~ '^beat_[0-9]+_[a-z0-9]+$'
  );

-- 2. Keep retailers.beat_name in sync with beats.beat_name on insert/update of beat_id
CREATE OR REPLACE FUNCTION public.sync_retailer_beat_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_name text;
BEGIN
  IF NEW.beat_id IS NULL OR NEW.beat_id = '' OR NEW.beat_id = 'unassigned' THEN
    RETURN NEW;
  END IF;

  -- If beat_name is missing or looks like a beat-id slug, resolve it from beats
  IF NEW.beat_name IS NULL
     OR NEW.beat_name = NEW.beat_id
     OR NEW.beat_name ~ '^beat_[0-9]+_[a-z0-9]+$'
     OR (TG_OP = 'UPDATE' AND NEW.beat_id IS DISTINCT FROM OLD.beat_id)
  THEN
    SELECT b.beat_name INTO resolved_name
    FROM public.beats b
    WHERE b.beat_id = NEW.beat_id
    LIMIT 1;

    IF resolved_name IS NOT NULL THEN
      NEW.beat_name := resolved_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_retailer_beat_name ON public.retailers;
CREATE TRIGGER trg_sync_retailer_beat_name
BEFORE INSERT OR UPDATE OF beat_id, beat_name
ON public.retailers
FOR EACH ROW
EXECUTE FUNCTION public.sync_retailer_beat_name();

-- 3. Propagate beat renames to all retailers under that beat
CREATE OR REPLACE FUNCTION public.propagate_beat_name_to_retailers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.beat_name IS DISTINCT FROM OLD.beat_name AND NEW.beat_id IS NOT NULL THEN
    UPDATE public.retailers
    SET beat_name = NEW.beat_name
    WHERE beat_id = NEW.beat_id
      AND (beat_name IS DISTINCT FROM NEW.beat_name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_beat_name_to_retailers ON public.beats;
CREATE TRIGGER trg_propagate_beat_name_to_retailers
AFTER UPDATE OF beat_name
ON public.beats
FOR EACH ROW
EXECUTE FUNCTION public.propagate_beat_name_to_retailers();