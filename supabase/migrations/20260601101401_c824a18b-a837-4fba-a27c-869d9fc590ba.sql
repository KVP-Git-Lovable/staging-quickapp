CREATE OR REPLACE FUNCTION public.sync_retailers_beat_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.beat_name IS DISTINCT FROM OLD.beat_name THEN
    UPDATE public.retailers
       SET beat_name = NEW.beat_name,
           updated_at = now()
     WHERE beat_id = NEW.beat_id
       AND beat_name IS DISTINCT FROM NEW.beat_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_retailers_beat_name ON public.beats;
CREATE TRIGGER trg_sync_retailers_beat_name
AFTER UPDATE OF beat_name ON public.beats
FOR EACH ROW
EXECUTE FUNCTION public.sync_retailers_beat_name();

-- One-time backfill for previously drifted rows
UPDATE public.retailers r
   SET beat_name = b.beat_name,
       updated_at = now()
  FROM public.beats b
 WHERE r.beat_id = b.beat_id
   AND r.beat_name IS DISTINCT FROM b.beat_name;