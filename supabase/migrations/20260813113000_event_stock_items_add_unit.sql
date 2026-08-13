-- Persist the UOM chosen when recording event stock, so saved rows display
-- the unit the quantities were entered in (PIECE vs BOX etc.).
ALTER TABLE public.event_stock_items ADD COLUMN IF NOT EXISTS unit text;
