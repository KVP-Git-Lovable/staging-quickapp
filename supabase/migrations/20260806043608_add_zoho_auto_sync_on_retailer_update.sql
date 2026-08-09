-- Auto-sync retailer to Zoho Books whenever Zoho-relevant fields are edited.
-- Mirrors the existing INSERT trigger (trg_zoho_auto_sync_retailer), reusing the
-- same trigger function. Scoped to "OF <columns>" so it does NOT fire on every
-- update (e.g. visit counters, credit scores) and does NOT loop when the sync
-- function itself writes back zoho_contact_id / zoho_synced_at / zoho_sync_status.
CREATE TRIGGER trg_zoho_auto_sync_retailer_on_update
AFTER UPDATE OF name, legal_name, phone, email, address, city, state, pincode,
  country, gst_number, pan_no, currency
ON public.retailers
FOR EACH ROW
EXECUTE FUNCTION public.trg_zoho_auto_sync_retailer();