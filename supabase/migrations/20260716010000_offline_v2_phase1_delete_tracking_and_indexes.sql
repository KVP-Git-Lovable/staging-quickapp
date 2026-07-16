-- Offline Architecture v2 · Phase 1 — delta backbone completion.
-- (sync_pull / sync_counts RPCs already existed.) Adds tombstone triggers + updated_at indexes.
-- Applied to staging DB aoxdosjkwqyuvccuwhzc 2026-07-16.

CREATE OR REPLACE FUNCTION public.track_sync_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.sync_deletions(table_name, row_id, user_id, deleted_at)
  VALUES (TG_TABLE_NAME, (to_jsonb(OLD)->>'id'), auth.uid(), now());
  RETURN OLD;
END; $$;

CREATE OR REPLACE TRIGGER trg_syncdel_products            AFTER DELETE ON public.products             FOR EACH ROW EXECUTE FUNCTION public.track_sync_deletion();
CREATE OR REPLACE TRIGGER trg_syncdel_product_variants    AFTER DELETE ON public.product_variants     FOR EACH ROW EXECUTE FUNCTION public.track_sync_deletion();
CREATE OR REPLACE TRIGGER trg_syncdel_product_uom_mapping AFTER DELETE ON public.product_uom_mapping  FOR EACH ROW EXECUTE FUNCTION public.track_sync_deletion();
CREATE OR REPLACE TRIGGER trg_syncdel_uom_master          AFTER DELETE ON public.uom_master           FOR EACH ROW EXECUTE FUNCTION public.track_sync_deletion();
CREATE OR REPLACE TRIGGER trg_syncdel_product_schemes     AFTER DELETE ON public.product_schemes      FOR EACH ROW EXECUTE FUNCTION public.track_sync_deletion();
CREATE OR REPLACE TRIGGER trg_syncdel_product_categories  AFTER DELETE ON public.product_categories   FOR EACH ROW EXECUTE FUNCTION public.track_sync_deletion();
CREATE OR REPLACE TRIGGER trg_syncdel_retailers           AFTER DELETE ON public.retailers            FOR EACH ROW EXECUTE FUNCTION public.track_sync_deletion();
CREATE OR REPLACE TRIGGER trg_syncdel_beats               AFTER DELETE ON public.beats                FOR EACH ROW EXECUTE FUNCTION public.track_sync_deletion();
CREATE OR REPLACE TRIGGER trg_syncdel_tax_masters         AFTER DELETE ON public.tax_masters          FOR EACH ROW EXECUTE FUNCTION public.track_sync_deletion();
CREATE OR REPLACE TRIGGER trg_syncdel_tax_components      AFTER DELETE ON public.tax_components       FOR EACH ROW EXECUTE FUNCTION public.track_sync_deletion();

CREATE INDEX IF NOT EXISTS idx_products_updated_at            ON public.products(updated_at);
CREATE INDEX IF NOT EXISTS idx_product_variants_updated_at    ON public.product_variants(updated_at);
CREATE INDEX IF NOT EXISTS idx_product_uom_mapping_updated_at ON public.product_uom_mapping(updated_at);
CREATE INDEX IF NOT EXISTS idx_uom_master_updated_at          ON public.uom_master(updated_at);
CREATE INDEX IF NOT EXISTS idx_enabled_units_updated_at       ON public.enabled_units(updated_at);
CREATE INDEX IF NOT EXISTS idx_product_schemes_updated_at     ON public.product_schemes(updated_at);
CREATE INDEX IF NOT EXISTS idx_product_categories_updated_at  ON public.product_categories(updated_at);
CREATE INDEX IF NOT EXISTS idx_tax_masters_updated_at         ON public.tax_masters(updated_at);
CREATE INDEX IF NOT EXISTS idx_tax_components_updated_at      ON public.tax_components(updated_at);
CREATE INDEX IF NOT EXISTS idx_retailers_updated_at           ON public.retailers(updated_at);
CREATE INDEX IF NOT EXISTS idx_beats_updated_at               ON public.beats(updated_at);
CREATE INDEX IF NOT EXISTS idx_sync_deletions_deleted_at      ON public.sync_deletions(deleted_at);

GRANT EXECUTE ON FUNCTION public.sync_pull(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_counts() TO authenticated;
