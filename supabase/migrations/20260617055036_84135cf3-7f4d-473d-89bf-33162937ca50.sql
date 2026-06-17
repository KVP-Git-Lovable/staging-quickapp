
ALTER TABLE public.feature_flags
  ADD COLUMN IF NOT EXISTS feature_key TEXT,
  ADD COLUMN IF NOT EXISTS feature_name TEXT;

UPDATE public.feature_flags
SET feature_key = 'location_check_in_enabled',
    feature_name = 'Location Check-in',
    description = '(Legacy) Master Visit Check-in toggle — superseded by "Capture Location on Visit Check-in" and "Capture Selfie on Visit Check-in". Keep ON unless both new flags are OFF.'
WHERE id = 'd2b7ddf0-aeb4-4785-9145-6b146595b440';

UPDATE public.feature_flags
SET feature_key = 'visit_location_capture_enabled',
    feature_name = 'Capture Location on Visit Check-in'
WHERE id = 'd7983f86-7b43-4585-bd7a-69eb0e61b044';

DELETE FROM public.feature_flags WHERE id = 'a0e80714-ed9d-4f0b-8cba-67f28764434f';

CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_feature_key_key
  ON public.feature_flags(feature_key) WHERE feature_key IS NOT NULL;

INSERT INTO public.feature_flags (feature_key, feature_name, description, category, is_enabled)
SELECT 'visit_camera_capture_enabled',
       'Capture Selfie on Visit Check-in',
       'Requires the rep to take a front-camera selfie photo when Checking-In to a retailer visit. Photo is stored against the visit log.',
       'attendance',
       COALESCE((SELECT is_enabled FROM public.feature_flags WHERE feature_key = 'location_check_in_enabled'), true)
WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE feature_key = 'visit_camera_capture_enabled');
