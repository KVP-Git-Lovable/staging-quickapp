
-- ========== V2 SYNC: AUDIT & DLQ TABLES + IDEMPOTENCY UNIQUE ==========

-- 1. Backfill missing idempotency_key with order id
UPDATE public.orders SET idempotency_key = id::text WHERE idempotency_key IS NULL;

-- 2. Unique index on idempotency_key (NOT NULL after backfill)
ALTER TABLE public.orders ALTER COLUMN idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_unique ON public.orders (idempotency_key);

-- 3. Audit log of every sync attempt outcome
CREATE TABLE IF NOT EXISTS public.sync_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  idempotency_key text,
  user_id uuid,
  device_id text,
  payload jsonb,
  retry_count integer DEFAULT 0,
  status text NOT NULL, -- ok | duplicate | validation_error | drift | error
  error text,
  reconciliation jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_audit_log_created ON public.sync_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_audit_log_order ON public.sync_audit_log (order_id);
CREATE INDEX IF NOT EXISTS idx_sync_audit_log_idem ON public.sync_audit_log (idempotency_key);

ALTER TABLE public.sync_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_admin_read" ON public.sync_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

-- 4. Dead-letter queue for poison payloads
CREATE TABLE IF NOT EXISTS public.failed_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text UNIQUE NOT NULL,
  payload jsonb NOT NULL,
  error text,
  retry_count integer NOT NULL DEFAULT 0,
  device_id text,
  user_id uuid,
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  last_failed_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);
CREATE INDEX IF NOT EXISTS idx_failed_sync_unresolved ON public.failed_sync_log (last_failed_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE public.failed_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "failed_sync_admin_all" ON public.failed_sync_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

-- 5. Retailer pending mutation audit
CREATE TABLE IF NOT EXISTS public.retailer_pending_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id uuid NOT NULL,
  order_id uuid,
  delta numeric NOT NULL,
  before_amount numeric,
  after_amount numeric,
  reason text,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_retailer_pending_audit_retailer ON public.retailer_pending_audit (retailer_id, created_at DESC);

ALTER TABLE public.retailer_pending_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retailer_pending_audit_admin_read" ON public.retailer_pending_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR actor_user_id = auth.uid());
