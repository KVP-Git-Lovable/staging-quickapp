-- Live team view for Event Stock Tracking.
--
-- EventStockTracker subscribes to postgres_changes on event_stock_items,
-- but the table was never added to the supabase_realtime publication, so
-- the subscription received nothing. The rep making a change saw their
-- own screen update (local state); every other team member's tracker
-- stayed frozen until a manual reload. RLS already scopes rows to the
-- event team, so publishing the tables only delivers rows members can
-- read anyway.

ALTER TABLE public.event_stock_items REPLICA IDENTITY FULL;
ALTER TABLE public.event_stock_days REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'event_stock_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_stock_items;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'event_stock_days'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_stock_days;
  END IF;
END $$;
