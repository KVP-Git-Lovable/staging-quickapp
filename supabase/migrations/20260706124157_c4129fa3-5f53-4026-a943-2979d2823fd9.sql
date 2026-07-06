CREATE OR REPLACE FUNCTION public.set_order_date()
RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(NEW.is_backdated, false) AND NEW.order_date IS NOT NULL THEN
    RETURN NEW;
  END IF;
  NEW.order_date := NEW.created_at::date;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;