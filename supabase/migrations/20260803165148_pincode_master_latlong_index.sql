CREATE INDEX IF NOT EXISTS idx_pincode_master_lat_long
  ON public.pincode_master (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;