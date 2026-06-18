ALTER TABLE public.distributor_payment_config
  ADD COLUMN IF NOT EXISTS allowed_payment_modes text[] NOT NULL DEFAULT ARRAY['bank_transfer']::text[];

UPDATE public.distributor_payment_config
SET allowed_payment_modes = ARRAY[default_payment_mode]::text[]
WHERE default_payment_mode IS NOT NULL
  AND (allowed_payment_modes IS NULL OR allowed_payment_modes = ARRAY['bank_transfer']::text[]);

CREATE OR REPLACE FUNCTION public.validate_distributor_payment_modes()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.allowed_payment_modes IS NULL OR array_length(NEW.allowed_payment_modes, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one allowed payment mode is required';
  END IF;
  IF NEW.default_payment_mode IS NOT NULL AND NOT (NEW.default_payment_mode = ANY(NEW.allowed_payment_modes)) THEN
    RAISE EXCEPTION 'default_payment_mode must be one of allowed_payment_modes';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_distributor_payment_modes ON public.distributor_payment_config;
CREATE TRIGGER trg_validate_distributor_payment_modes
BEFORE INSERT OR UPDATE ON public.distributor_payment_config
FOR EACH ROW EXECUTE FUNCTION public.validate_distributor_payment_modes();