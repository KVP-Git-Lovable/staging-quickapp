-- Replaces the SECURITY DEFINER impl approach, which was unreachable: the public
-- RPC is SECURITY INVOKER (so RLS on retailers decides visibility), and therefore
-- runs as `authenticated`, which had EXECUTE revoked on the impl.
--
-- Instead, express the rule where it belongs — as a policy. Collections were
-- visible only to whoever collected them, which made a per-retailer ledger
-- incomplete and its running balance non-reconciling. This ADDITIONAL permissive
-- SELECT policy says: you may read a collection if you can already read its
-- retailer. The inner EXISTS is itself subject to retailers RLS, so this stays
-- correct automatically if retailer visibility rules ever change.
--
-- NOTE: this deliberately widens read access to payment collections — a user who
-- can see a retailer now sees that retailer's full payment history, including
-- collections recorded by a colleague. That is required for the ledger to
-- reconcile. It grants SELECT only; INSERT/UPDATE/DELETE are unchanged.

DROP POLICY IF EXISTS rpc_view_collections_for_visible_retailer
  ON public.retailer_payment_collections;
CREATE POLICY rpc_view_collections_for_visible_retailer
  ON public.retailer_payment_collections
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.retailers r
                 WHERE r.id = retailer_payment_collections.retailer_id));

-- Whether a rendered PDF is already cached. storage.objects is not readable by
-- `authenticated`, and this only reveals the existence of a filename in an
-- already-public bucket.
CREATE OR REPLACE FUNCTION public.invoice_pdf_exists(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (SELECT 1 FROM storage.objects
                 WHERE bucket_id='invoices' AND name = p_path);
$fn$;
GRANT EXECUTE ON FUNCTION public.invoice_pdf_exists(text) TO authenticated;


-- Both RPCs now read directly under the caller's own RLS. No definer indirection.
CREATE OR REPLACE FUNCTION public.get_retailer_payment_ledger(p_retailer_id uuid)
RETURNS TABLE(
  entry_at timestamptz, entry_type text, reference text, detail text,
  debit numeric, credit numeric, running_balance numeric, payment_method text,
  order_id uuid, collection_id uuid, order_status text, payment_status text,
  is_credit_order boolean
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM retailers r WHERE r.id = p_retailer_id) THEN
    RAISE EXCEPTION 'Your profile does not have permission to view this retailer';
  END IF;

  RETURN QUERY
  WITH entries AS (
    SELECT COALESCE(o.order_date::timestamptz, o.created_at) AS e_at,
           'order'::text AS e_type,
           COALESCE(o.invoice_number, left(o.id::text,8)) AS e_ref,
           CASE WHEN COALESCE(o.is_credit_order,false) THEN 'Credit order'
                ELSE 'Cash order' END AS e_detail,
           CASE WHEN COALESCE(o.is_credit_order,false) THEN COALESCE(o.total_amount,0)
                ELSE 0 END AS e_debit,
           0::numeric AS e_credit, NULL::text AS e_method,
           o.id AS e_order, NULL::uuid AS e_coll,
           o.status AS e_ostatus, o.payment_status AS e_pstatus,
           COALESCE(o.is_credit_order,false) AS e_iscredit
    FROM orders o
    WHERE o.retailer_id = p_retailer_id
      AND COALESCE(o.status,'') NOT IN ('cancelled','replaced')
    UNION ALL
    SELECT COALESCE(c.collected_at, c.created_at), 'payment',
           COALESCE(NULLIF(c.upi_last_four,''), ''),
           COALESCE(NULLIF(c.notes,''), 'Payment received'),
           0::numeric, COALESCE(c.amount,0),
           COALESCE(c.payment_method,'unspecified'),
           NULL::uuid, c.id, NULL::text, NULL::text, NULL::boolean
    FROM retailer_payment_collections c
    WHERE c.retailer_id = p_retailer_id
  )
  SELECT e_at, e_type, e_ref, e_detail, e_debit, e_credit,
         SUM(e_debit - e_credit) OVER (ORDER BY e_at, e_type
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),
         e_method, e_order, e_coll, e_ostatus, e_pstatus, e_iscredit
  FROM entries
  ORDER BY e_at, e_type;
END $fn$;


CREATE OR REPLACE FUNCTION public.get_retailer_invoices(p_retailer_id uuid)
RETURNS TABLE(
  invoice_id uuid, invoice_number text, invoice_date timestamptz,
  total_amount numeric, status text, order_id uuid, order_status text,
  storage_path text, has_pdf boolean
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM retailers r WHERE r.id = p_retailer_id) THEN
    RAISE EXCEPTION 'Your profile does not have permission to view this retailer';
  END IF;

  RETURN QUERY
  SELECT i.id, i.invoice_number, i.created_at, i.total_amount, i.status,
         o.id, o.status,
         'invoice-'||i.invoice_number||'.pdf',
         public.invoice_pdf_exists('invoice-'||i.invoice_number||'.pdf')
  FROM invoices i
  JOIN orders o ON o.id = i.order_id
  WHERE o.retailer_id = p_retailer_id
  ORDER BY i.created_at DESC;
END $fn$;

DROP FUNCTION IF EXISTS public._retailer_payment_ledger_impl(uuid);
DROP FUNCTION IF EXISTS public._retailer_invoices_impl(uuid);

GRANT EXECUTE ON FUNCTION public.get_retailer_payment_ledger(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_retailer_invoices(uuid)       TO authenticated;

NOTIFY pgrst, 'reload schema';
