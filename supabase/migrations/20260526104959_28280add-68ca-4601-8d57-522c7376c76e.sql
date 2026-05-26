
ALTER TABLE public.order_items
  ALTER COLUMN product_id TYPE uuid USING product_id::uuid;

ALTER TABLE public.order_items
  ALTER COLUMN quantity TYPE numeric(12,3) USING quantity::numeric;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_quantity_positive;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0);

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_total_nonneg;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_total_nonneg CHECK (total_amount >= 0);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='order_items_product_fk') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_product_fk
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='order_items_variant_fk') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_variant_fk
      FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='order_items_order_fk') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_order_fk
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE NOT VALID;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant ON public.order_items (variant_id);
