
DO $$
DECLARE
  mapping JSONB := '[
    {"keep":"8a2339ad-7d6c-41f5-b1fc-79ba8bd144a7","dup":"e921d871-d6d9-4412-9010-83078571b514"},
    {"keep":"b6ef30aa-a261-4ccc-b174-37ca7f6f0f81","dup":"b45b6b48-3ac8-458d-a42d-4980ee4aa7bc"},
    {"keep":"78ce9374-dbff-46d2-b499-54bdfaf6bab0","dup":"6894a33e-9172-45b1-9791-9edde6d8c9da"},
    {"keep":"ea1ad7c5-e363-470f-afe8-54667b6b90c9","dup":"0887af36-c287-4be6-a625-ba07f6c87594"},
    {"keep":"b1b8a413-6a7e-4de3-a462-e2e7f88d70d5","dup":"2cedafb6-a723-4a8a-8c6a-db3fa0fd0ef8"},
    {"keep":"0096187c-4d93-4d74-ad16-edd42cea1c0e","dup":"58820649-73f7-4479-a3f3-82a39df563d3"},
    {"keep":"c822b8a2-5283-4c7d-a817-dc7032565c82","dup":"602d0da1-b5a5-46bc-ae0f-82747a761763"},
    {"keep":"173ebf58-401f-4121-b621-01799e452d9a","dup":"17195a61-f0e7-4e31-9524-567a2c2443fb"}
  ]'::jsonb;
  m JSONB;
  dup_id UUID;
  keep_id UUID;
  rec RECORD;
  sql TEXT;
BEGIN
  FOR m IN SELECT * FROM jsonb_array_elements(mapping) LOOP
    dup_id := (m->>'dup')::uuid;
    keep_id := (m->>'keep')::uuid;

    DELETE FROM public.product_uom_mapping WHERE product_id = dup_id;

    FOR rec IN
      SELECT table_name, data_type
      FROM information_schema.columns
      WHERE table_schema='public'
        AND column_name='product_id'
        AND table_name NOT IN ('product_uom_mapping')
    LOOP
      IF rec.data_type = 'uuid' THEN
        sql := format('UPDATE public.%I SET product_id = %L::uuid WHERE product_id = %L::uuid', rec.table_name, keep_id, dup_id);
      ELSE
        sql := format('UPDATE public.%I SET product_id = %L WHERE product_id = %L', rec.table_name, keep_id::text, dup_id::text);
      END IF;
      BEGIN
        EXECUTE sql;
      EXCEPTION WHEN unique_violation THEN
        IF rec.data_type = 'uuid' THEN
          EXECUTE format('DELETE FROM public.%I WHERE product_id = %L::uuid', rec.table_name, dup_id);
        ELSE
          EXECUTE format('DELETE FROM public.%I WHERE product_id = %L', rec.table_name, dup_id::text);
        END IF;
      END;
    END LOOP;

    DELETE FROM public.products WHERE id = dup_id;
  END LOOP;
END $$;

ALTER TABLE public.products ADD CONSTRAINT products_sku_unique UNIQUE (sku);

DO $$ BEGIN
  CREATE POLICY "product_images_public_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'product-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "product_images_auth_write" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "product_images_auth_update" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'product-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "product_images_auth_delete" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'product-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
