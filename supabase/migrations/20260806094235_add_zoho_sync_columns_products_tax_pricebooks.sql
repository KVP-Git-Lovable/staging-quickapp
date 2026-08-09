-- Purely additive: new nullable columns with safe defaults on products,
-- tax_masters, price_books. Mirrors the retailers.zoho_* pattern. Nothing
-- existing is altered, dropped, or renamed, so no existing workflow is
-- affected by this migration on its own.

ALTER TABLE public.tax_masters
  ADD COLUMN IF NOT EXISTS zoho_tax_id text,
  ADD COLUMN IF NOT EXISTS zoho_sync_status text NOT NULL DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS zoho_sync_error text,
  ADD COLUMN IF NOT EXISTS zoho_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS zoho_sync_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS zoho_item_id text,
  ADD COLUMN IF NOT EXISTS zoho_sync_status text NOT NULL DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS zoho_sync_error text,
  ADD COLUMN IF NOT EXISTS zoho_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS zoho_sync_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.price_books
  ADD COLUMN IF NOT EXISTS zoho_pricebook_id text,
  ADD COLUMN IF NOT EXISTS zoho_sync_status text NOT NULL DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS zoho_sync_error text,
  ADD COLUMN IF NOT EXISTS zoho_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS zoho_sync_enabled boolean NOT NULL DEFAULT true;

-- zoho_sync_log currently only has retailer_id. Add a generic nullable
-- record_id so tax/item/pricebook sync attempts can be logged the same way
-- without touching the existing retailer_id column or any existing rows.
ALTER TABLE public.zoho_sync_log
  ADD COLUMN IF NOT EXISTS record_id uuid;