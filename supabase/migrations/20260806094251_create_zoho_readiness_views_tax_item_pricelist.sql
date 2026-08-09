CREATE OR REPLACE VIEW public.zoho_tax_sync_readiness AS
SELECT
  t.id, t.name, t.total_rate, t.zoho_tax_id, t.zoho_sync_status,
  CASE
    WHEN NOT t.zoho_sync_enabled THEN 'not enabled for sync'
    WHEN NOT t.is_active THEN 'inactive tax'
    WHEN t.name IS NULL OR btrim(t.name) = '' THEN 'missing name'
    WHEN t.total_rate IS NULL OR t.total_rate < 0 THEN 'missing/invalid total_rate'
    ELSE NULL
  END AS blocker,
  (
    t.zoho_sync_enabled AND t.is_active
    AND t.name IS NOT NULL AND btrim(t.name) <> ''
    AND t.total_rate IS NOT NULL AND t.total_rate >= 0
  ) AS is_ready
FROM public.tax_masters t;

CREATE OR REPLACE VIEW public.zoho_item_sync_readiness AS
SELECT
  p.id, p.name, p.sku, p.rate, p.zoho_item_id, p.zoho_sync_status,
  CASE
    WHEN NOT p.zoho_sync_enabled THEN 'not enabled for sync'
    WHEN NOT p.is_active THEN 'inactive product'
    WHEN p.name IS NULL OR btrim(p.name) = '' THEN 'missing name'
    WHEN p.rate IS NULL OR p.rate < 0 THEN 'missing/invalid rate'
    ELSE NULL
  END AS blocker,
  (
    p.zoho_sync_enabled AND p.is_active
    AND p.name IS NOT NULL AND btrim(p.name) <> ''
    AND p.rate IS NOT NULL AND p.rate >= 0
  ) AS is_ready
FROM public.products p;

CREATE OR REPLACE VIEW public.zoho_pricelist_sync_readiness AS
SELECT
  pb.id, pb.name, pb.zoho_pricebook_id, pb.zoho_sync_status,
  (SELECT count(*) FROM public.price_book_entries pbe
     JOIN public.products pr ON pr.id = pbe.product_id
     WHERE pbe.price_book_id = pb.id AND pbe.is_active AND pr.zoho_item_id IS NOT NULL) AS synced_item_entries,
  CASE
    WHEN NOT pb.zoho_sync_enabled THEN 'not enabled for sync'
    WHEN NOT pb.is_active THEN 'inactive price book'
    WHEN pb.name IS NULL OR btrim(pb.name) = '' THEN 'missing name'
    WHEN NOT EXISTS (
      SELECT 1 FROM public.price_book_entries pbe
      JOIN public.products pr ON pr.id = pbe.product_id
      WHERE pbe.price_book_id = pb.id AND pbe.is_active AND pr.zoho_item_id IS NOT NULL
    ) THEN 'no entries with a Zoho-synced product yet'
    ELSE NULL
  END AS blocker,
  (
    pb.zoho_sync_enabled AND pb.is_active
    AND pb.name IS NOT NULL AND btrim(pb.name) <> ''
    AND EXISTS (
      SELECT 1 FROM public.price_book_entries pbe
      JOIN public.products pr ON pr.id = pbe.product_id
      WHERE pbe.price_book_id = pb.id AND pbe.is_active AND pr.zoho_item_id IS NOT NULL
    )
  ) AS is_ready
FROM public.price_books pb;