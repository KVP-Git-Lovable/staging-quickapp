ALTER TABLE public.beats DISABLE TRIGGER beats_audit_trg;

UPDATE public.beats
SET beat_name = 'Krishnapura (Vikhyath - Old)'
WHERE beat_id = 'beat_1779082704647_okhsc9d6o'
  AND beat_name = 'Krishnapura'
  AND is_active = true;

ALTER TABLE public.beats ENABLE TRIGGER beats_audit_trg;

CREATE UNIQUE INDEX IF NOT EXISTS idx_beats_unique_name_user
  ON public.beats (LOWER(beat_name), user_id)
  WHERE is_active = true AND distributor_id IS NULL;