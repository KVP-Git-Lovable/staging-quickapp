-- The offline-first client queues local retailer creations with an internal
-- "_pendingSync" bookkeeping flag and sends it as part of the insert payload.
-- Postgres/PostgREST rejects inserts referencing unknown columns, so the retailer
-- was never actually created server-side. Adding this column (quoted to preserve
-- the exact camelCase the client sends) lets those inserts succeed.
ALTER TABLE public.retailers ADD COLUMN IF NOT EXISTS "_pendingSync" boolean DEFAULT false;

-- Make sure PostgREST picks up the new column immediately.
NOTIFY pgrst, 'reload schema';
