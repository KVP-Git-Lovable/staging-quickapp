
INSERT INTO public.feature_flags (feature_key, feature_name, description, is_enabled)
SELECT 'visit_location_capture_enabled',
       'Capture Location on Visit Check-in',
       'Captures GPS coordinates of the rep when they Check-In / Check-Out on a retailer visit (My Visits → Visit card). Used for proximity validation and visit reports.',
       COALESCE((SELECT is_enabled FROM public.feature_flags WHERE feature_key = 'location_check_in_enabled'), true)
WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE feature_key = 'visit_location_capture_enabled');

INSERT INTO public.feature_flags (feature_key, feature_name, description, is_enabled)
SELECT 'visit_camera_capture_enabled',
       'Capture Selfie on Visit Check-in',
       'Requires the rep to take a front-camera selfie photo when Checking-In to a retailer visit. Photo is stored against the visit log.',
       COALESCE((SELECT is_enabled FROM public.feature_flags WHERE feature_key = 'location_check_in_enabled'), true)
WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE feature_key = 'visit_camera_capture_enabled');

UPDATE public.feature_flags
SET description = '(Legacy) Master Visit Check-in toggle — superseded by "Capture Location on Visit Check-in" and "Capture Selfie on Visit Check-in". Keep ON unless both new flags are OFF.'
WHERE feature_key = 'location_check_in_enabled';
