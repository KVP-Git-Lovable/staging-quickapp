-- Phase 6: Preserve product/variant history by removing destructive cascade deletes.
-- Deleting a product or variant will now be blocked while related rows exist.

-- referencing products
ALTER TABLE public.distributor_business_plan_month_products
  DROP CONSTRAINT IF EXISTS distributor_business_plan_month_products_product_id_fkey;
ALTER TABLE public.distributor_business_plan_month_products
  ADD CONSTRAINT distributor_business_plan_month_products_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.distributor_company_return_items
  DROP CONSTRAINT IF EXISTS distributor_company_return_items_product_id_fkey;
ALTER TABLE public.distributor_company_return_items
  ADD CONSTRAINT distributor_company_return_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.distributor_return_items
  DROP CONSTRAINT IF EXISTS distributor_return_items_product_id_fkey;
ALTER TABLE public.distributor_return_items
  ADD CONSTRAINT distributor_return_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.price_book_entries
  DROP CONSTRAINT IF EXISTS price_book_entries_product_id_fkey;
ALTER TABLE public.price_book_entries
  ADD CONSTRAINT price_book_entries_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.product_price_list
  DROP CONSTRAINT IF EXISTS product_price_list_product_id_fkey;
ALTER TABLE public.product_price_list
  ADD CONSTRAINT product_price_list_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.product_schemes
  DROP CONSTRAINT IF EXISTS product_schemes_product_id_fkey;
ALTER TABLE public.product_schemes
  ADD CONSTRAINT product_schemes_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.product_uom_mapping
  DROP CONSTRAINT IF EXISTS product_uom_mapping_product_id_fkey;
ALTER TABLE public.product_uom_mapping
  ADD CONSTRAINT product_uom_mapping_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS product_variants_product_id_fkey;
ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.user_business_plan_month_products
  DROP CONSTRAINT IF EXISTS user_business_plan_month_products_product_id_fkey;
ALTER TABLE public.user_business_plan_month_products
  ADD CONSTRAINT user_business_plan_month_products_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.user_business_plan_products
  DROP CONSTRAINT IF EXISTS user_business_plan_products_product_id_fkey;
ALTER TABLE public.user_business_plan_products
  ADD CONSTRAINT user_business_plan_products_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

-- referencing product_variants
ALTER TABLE public.price_book_entries
  DROP CONSTRAINT IF EXISTS price_book_entries_variant_id_fkey;
ALTER TABLE public.price_book_entries
  ADD CONSTRAINT price_book_entries_variant_id_fkey
  FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;

ALTER TABLE public.tax_product_map
  DROP CONSTRAINT IF EXISTS tax_product_map_product_variant_id_fkey;
ALTER TABLE public.tax_product_map
  ADD CONSTRAINT tax_product_map_product_variant_id_fkey
  FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;