-- New retailers get Zoho sync enabled by default (matches the bulk-enable already applied to existing rows)
ALTER TABLE public.retailers ALTER COLUMN zoho_sync_enabled SET DEFAULT true;

-- Fire the zoho-sync-customers edge function immediately after a retailer is created.
-- Wrapped in EXCEPTION so a Zoho/network hiccup can never block the retailer insert itself.
CREATE OR REPLACE FUNCTION public.trg_zoho_auto_sync_retailer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://aoxdosjkwqyuvccuwhzc.supabase.co/functions/v1/zoho-sync-customers',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('mode', 'sync', 'retailer_ids', jsonb_build_array(NEW.id::text))
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'zoho auto-sync trigger failed for retailer %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zoho_auto_sync_retailer ON public.retailers;
CREATE TRIGGER trg_zoho_auto_sync_retailer
AFTER INSERT ON public.retailers
FOR EACH ROW
EXECUTE FUNCTION public.trg_zoho_auto_sync_retailer();
