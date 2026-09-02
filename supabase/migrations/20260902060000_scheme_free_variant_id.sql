-- The Scheme Master "Free Product (Y)" picker offers base products AND product
-- variants from one combined list. Selecting a variant saved the variant's id
-- into product_schemes.free_product_id (FK -> products.id), so every such save
-- failed with product_schemes_free_product_id_fkey. Store the variant properly:
-- free_product_id keeps the parent product, free_variant_id pins the variant.
ALTER TABLE public.product_schemes
  ADD COLUMN IF NOT EXISTS free_variant_id uuid REFERENCES public.product_variants(id);

COMMENT ON COLUMN public.product_schemes.free_variant_id IS
  'When the free item (Y) is a product variant: the variant id. free_product_id then holds its parent product.';
