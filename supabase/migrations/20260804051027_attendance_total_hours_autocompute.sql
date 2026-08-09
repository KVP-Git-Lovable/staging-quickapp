-- total_hours was left NULL on 55 rows that have both timestamps, because it is
-- only set by the client on checkout. Compute it in the database instead, so it is
-- correct no matter which path writes the row (app, regularisation, admin edit).

CREATE OR REPLACE FUNCTION public.tg_attendance_compute_hours()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.check_in_time IS NOT NULL AND NEW.check_out_time IS NOT NULL THEN
    IF NEW.check_out_time > NEW.check_in_time THEN
      NEW.total_hours := round(
        (EXTRACT(EPOCH FROM (NEW.check_out_time - NEW.check_in_time)) / 3600.0)::numeric, 2);
    ELSE
      -- check-out at or before check-in is a data error (clock skew / bad edit).
      -- Leave NULL rather than storing a negative or fake zero.
      NEW.total_hours := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_compute_hours ON public.attendance;
CREATE TRIGGER trg_attendance_compute_hours
  BEFORE INSERT OR UPDATE OF check_in_time, check_out_time
  ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.tg_attendance_compute_hours();

-- Backfill every historic row that has both timestamps and a valid ordering.
UPDATE public.attendance
SET total_hours = round(
      (EXTRACT(EPOCH FROM (check_out_time - check_in_time)) / 3600.0)::numeric, 2)
WHERE check_in_time IS NOT NULL
  AND check_out_time IS NOT NULL
  AND check_out_time > check_in_time
  AND (total_hours IS NULL OR total_hours = 0);