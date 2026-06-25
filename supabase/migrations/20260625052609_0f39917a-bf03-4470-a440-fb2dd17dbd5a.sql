-- =========================================================================
-- PART A1: Repoint orphaned batches for Joyicecream to its live warehouse
-- =========================================================================
UPDATE public.inventory_batches
SET warehouse_id = 'ba1be035-1391-41ba-b44d-a63c955c0291'
WHERE distributor_id = '405dd79f-c7e0-454b-81cc-715e2875900b'
  AND warehouse_id   = '84de9491-068b-4e7a-bd1b-dd9ba989a983';

-- =========================================================================
-- PART A2: Reconcile distributor_inventory summary with actual batches
-- for Joyicecream under the live warehouse. Derive qty from batches.
-- =========================================================================
WITH batch_totals AS (
  SELECT
    ib.distributor_id,
    ib.warehouse_id,
    ib.product_id,
    SUM(ib.quantity)        AS total_qty,
    SUM(ib.available_qty)   AS avail_qty,
    SUM(ib.reserved_qty)    AS reserved_qty
  FROM public.inventory_batches ib
  WHERE ib.distributor_id = '405dd79f-c7e0-454b-81cc-715e2875900b'
    AND ib.warehouse_id   = 'ba1be035-1391-41ba-b44d-a63c955c0291'
  GROUP BY ib.distributor_id, ib.warehouse_id, ib.product_id
)
-- Update existing summary rows to match batch totals
UPDATE public.distributor_inventory di
SET quantity = bt.total_qty,
    reserved_quantity = bt.reserved_qty,
    updated_at = now()
FROM batch_totals bt
WHERE di.distributor_id = bt.distributor_id
  AND di.warehouse_id   = bt.warehouse_id
  AND di.product_id     = bt.product_id;

-- Insert summary rows for products that have batches but no summary row
INSERT INTO public.distributor_inventory (
  distributor_id, warehouse_id, product_id, product_name,
  quantity, reserved_quantity, damaged_quantity, expired_quantity, unit
)
SELECT
  ib.distributor_id,
  ib.warehouse_id,
  ib.product_id,
  COALESCE(p.name, 'Unknown'),
  SUM(ib.quantity),
  SUM(ib.reserved_qty),
  0, 0,
  p.base_unit
FROM public.inventory_batches ib
LEFT JOIN public.products p ON p.id = ib.product_id
WHERE ib.distributor_id = '405dd79f-c7e0-454b-81cc-715e2875900b'
  AND ib.warehouse_id   = 'ba1be035-1391-41ba-b44d-a63c955c0291'
  AND NOT EXISTS (
    SELECT 1 FROM public.distributor_inventory di
    WHERE di.distributor_id = ib.distributor_id
      AND di.warehouse_id   = ib.warehouse_id
      AND di.product_id     = ib.product_id
  )
GROUP BY ib.distributor_id, ib.warehouse_id, ib.product_id, p.name, p.base_unit;

-- =========================================================================
-- PART B2: Add FK constraints with ON DELETE RESTRICT to prevent
-- a warehouse from being deleted while it still holds stock.
-- Pre-check (B1) ran clean: only Joyicecream batches were orphaned, now fixed.
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_batches_warehouse_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_batches
      ADD CONSTRAINT inventory_batches_warehouse_id_fkey
      FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'distributor_inventory_warehouse_id_fkey'
  ) THEN
    ALTER TABLE public.distributor_inventory
      ADD CONSTRAINT distributor_inventory_warehouse_id_fkey
      FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;
  END IF;
END $$;