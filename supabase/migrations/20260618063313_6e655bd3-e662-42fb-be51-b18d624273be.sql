ALTER TABLE public.distributor_payment_config
  ADD COLUMN IF NOT EXISTS allowed_payment_terms text[] NOT NULL DEFAULT ARRAY['immediate']::text[];

UPDATE public.distributor_payment_config
SET allowed_payment_terms = ARRAY[default_payment_term]::text[]
WHERE default_payment_term IS NOT NULL
  AND (allowed_payment_terms IS NULL OR allowed_payment_terms = ARRAY['immediate']::text[]);

CREATE OR REPLACE FUNCTION public.validate_distributor_payment_modes()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.allowed_payment_modes IS NULL OR array_length(NEW.allowed_payment_modes, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one allowed payment mode is required';
  END IF;
  IF NEW.default_payment_mode IS NOT NULL AND NOT (NEW.default_payment_mode = ANY(NEW.allowed_payment_modes)) THEN
    RAISE EXCEPTION 'default_payment_mode must be one of allowed_payment_modes';
  END IF;
  IF NEW.allowed_payment_terms IS NULL OR array_length(NEW.allowed_payment_terms, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one allowed payment term is required';
  END IF;
  IF NEW.default_payment_term IS NOT NULL AND NOT (NEW.default_payment_term = ANY(NEW.allowed_payment_terms)) THEN
    RAISE EXCEPTION 'default_payment_term must be one of allowed_payment_terms';
  END IF;
  RETURN NEW;
END;
$$;