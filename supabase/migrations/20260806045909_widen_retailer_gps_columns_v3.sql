DROP TRIGGER IF EXISTS retailers_duplicate_check ON public.retailers;
DROP TRIGGER IF EXISTS trg_guard_retailer_gps_coordinates ON public.retailers;

ALTER TABLE public.retailers ALTER COLUMN latitude TYPE numeric;
ALTER TABLE public.retailers ALTER COLUMN longitude TYPE numeric;

CREATE TRIGGER trg_guard_retailer_gps_coordinates
BEFORE INSERT OR UPDATE OF latitude, longitude ON public.retailers
FOR EACH ROW
EXECUTE FUNCTION public.guard_retailer_gps_coordinates();

CREATE TRIGGER retailers_duplicate_check
BEFORE INSERT OR UPDATE ON public.retailers
FOR EACH ROW
EXECUTE FUNCTION public.trg_retailer_duplicate_check();