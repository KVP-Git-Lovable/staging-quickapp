-- Reverts the permissive policy added earlier. No table's visibility changes:
-- retailer_payment_collections goes back to exactly its previous rules
-- (collected_by_user_id / revenue_owner_id / system admin), so every existing
-- screen and query behaves precisely as before.
--
-- The payment history becomes a self-contained read instead: the RPC is
-- SECURITY DEFINER (so it can assemble a complete, reconciling ledger) and
-- carries its own explicit gate. Nothing else in the app gains any new access.
--
-- The gate deliberately does NOT depend on RLS on `retailers`: staging scopes
-- that per user, but production has "Authenticated users can view all retailers
-- for analytics" with qual = true, so an RLS-based gate would admit everyone
-- there. This predicate behaves identically in both databases, and every
-- function it uses exists in both.

DROP POLICY IF EXISTS rpc_view_collections_for_visible_retailer
  ON public.retailer_payment_collections;


CREATE OR REPLACE FUNCTION public.can_view_retailer_ledger(p_retailer_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT
    -- administrators / credit managers
    public.is_system_admin(auth.uid())
    OR public.user_has_permission(auth.uid(), 'admin_credit_mgmt', 'can_read')
    -- or a genuine working relationship with this retailer
    OR EXISTS (SELECT 1 FROM public.retailers r
               WHERE r.id = p_retailer_id
                 AND (r.user_id = auth.uid()
                      OR public.user_has_beat_access(auth.uid(), r.beat_id)))
    OR EXISTS (SELECT 1 FROM public.visits v
               WHERE v.retailer_id = p_retailer_id AND v.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.orders o
               WHERE o.retailer_id = p_retailer_id AND o.user_id = auth.uid());
$fn$;
GRANT EXECUTE ON FUNCTION public.can_view_retailer_ledger(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_retailer_payment_ledger(p_retailer_id uuid)
RETURNS TABLE(
  entry_at timestamptz, entry_type text, reference text, detail text,
  debit numeric, credit numeric, running_balance numeric, payment_method text,
  order_id uuid, collection_id uuid, order_status text, payment_status text,
  is_credit_order boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.can_view_retailer_ledger(p_retailer_id) THEN
    RAISE EXCEPTION 'Your profile does not have permission to view this payment history';
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.can_view_retailer_ledger(p_retailer_id) THEN
    RAISE EXCEPTION 'Your profile does not have permission to view this payment history';
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

GRANT EXECUTE ON FUNCTION public.get_retailer_payment_ledger(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_retailer_invoices(uuid)       TO authenticated;

NOTIFY pgrst, 'reload schema';
