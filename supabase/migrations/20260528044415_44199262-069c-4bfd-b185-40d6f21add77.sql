ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_order_fk;
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_variant_fk;
NOTIFY pgrst, 'reload schema';