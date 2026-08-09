-- Mirrors trg_zoho_auto_sync_retailer exactly: fire-and-forget async call,
-- wrapped in EXCEPTION WHEN OTHERS so a Zoho/network failure can NEVER block
-- or fail the underlying insert/update on tax_masters, products, or
-- price_books. These are brand-new triggers with brand-new names -- no
-- existing trigger, function, or table behavior is modified.

CREATE OR REPLACE FUNCTION public.trg_zoho_auto_sync_tax()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://aoxdosjkwqyuvccuwhzc.supabase.co/functions/v1/zoho-sync-taxes',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('mode', 'sync', 'tax_ids', jsonb_build_array(NEW.id::text))
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'zoho auto-sync trigger failed for tax %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_zoho_auto_sync_tax_on_insert
AFTER INSERT ON public.tax_masters
FOR EACH ROW
EXECUTE FUNCTION public.trg_zoho_auto_sync_tax();

CREATE TRIGGER trg_zoho_auto_sync_tax_on_update
AFTER UPDATE OF name, total_rate, is_active ON public.tax_masters
FOR EACH ROW
EXECUTE FUNCTION public.trg_zoho_auto_sync_tax();


CREATE OR REPLACE FUNCTION public.trg_zoho_auto_sync_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://aoxdosjkwqyuvccuwhzc.supabase.co/functions/v1/zoho-sync-items',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('mode', 'sync', 'product_ids', jsonb_build_array(NEW.id::text))
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'zoho auto-sync trigger failed for product %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_zoho_auto_sync_product_on_insert
AFTER INSERT ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.trg_zoho_auto_sync_product();

CREATE TRIGGER trg_zoho_auto_sync_product_on_update
AFTER UPDATE OF name, sku, description, base_unit, rate, hsn_code, tax_master_id, is_active ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.trg_zoho_auto_sync_product();


CREATE OR REPLACE FUNCTION public.trg_zoho_auto_sync_pricebook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://aoxdosjkwqyuvccuwhzc.supabase.co/functions/v1/zoho-sync-pricelists',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('mode', 'sync', 'price_book_ids', jsonb_build_array(NEW.id::text))
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'zoho auto-sync trigger failed for price_book %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_zoho_auto_sync_pricebook_on_insert
AFTER INSERT ON public.price_books
FOR EACH ROW
EXECUTE FUNCTION public.trg_zoho_auto_sync_pricebook();

CREATE TRIGGER trg_zoho_auto_sync_pricebook_on_update
AFTER UPDATE OF name, is_active ON public.price_books
FOR EACH ROW
EXECUTE FUNCTION public.trg_zoho_auto_sync_pricebook();

-- Price book *entries* changing (a price edited) should also re-sync the
-- parent price book, since Zoho pricebook rates live inside the pricebook
-- payload, not on the entry itself.
CREATE OR REPLACE FUNCTION public.trg_zoho_auto_sync_pricebook_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_price_book_id uuid;
BEGIN
  v_price_book_id := COALESCE(NEW.price_book_id, OLD.price_book_id);
  BEGIN
    PERFORM net.http_post(
      url := 'https://aoxdosjkwqyuvccuwhzc.supabase.co/functions/v1/zoho-sync-pricelists',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('mode', 'sync', 'price_book_ids', jsonb_build_array(v_price_book_id::text))
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'zoho auto-sync trigger failed for price_book_entry (book %): %', v_price_book_id, SQLERRM;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE TRIGGER trg_zoho_auto_sync_pricebook_entry_on_change
AFTER INSERT OR UPDATE OF final_price, list_price, is_active OR DELETE ON public.price_book_entries
FOR EACH ROW
EXECUTE FUNCTION public.trg_zoho_auto_sync_pricebook_entry();