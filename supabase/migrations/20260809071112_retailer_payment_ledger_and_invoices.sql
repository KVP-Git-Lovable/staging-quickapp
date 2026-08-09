-- Per-retailer payment ledger + invoice list for Retailer Overview.
--
-- Visibility model: retailer_payment_collections is restricted to the user who
-- collected it (collected_by_user_id / revenue_owner_id / system admin). A ledger
-- built under that policy would omit a colleague's collections and its running
-- balance would not reconcile — worse than showing nothing.
--
-- So: the public entry point is SECURITY INVOKER and checks that the caller can
-- SELECT the retailer (RLS on retailers applies, which is the real definition of
-- "may see this retailer"). Only once that passes does it call a SECURITY DEFINER
-- impl that reads the complete collection history. Net effect: if you can see the
-- retailer, you see its whole ledger; otherwise you see nothing.

CREATE OR REPLACE FUNCTION public._retailer_payment_ledger_impl(p_retailer_id uuid)
RETURNS TABLE(
  entry_at        timestamptz,
  entry_type      text,
  reference       text,
  detail          text,
  debit           numeric,
  credit          numeric,
  payment_method  text,
  order_id        uuid,
  collection_id   uuid,
  order_status    text,
  payment_status  text,
  is_credit_order boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT
    COALESCE(o.order_date::timestamptz, o.created_at)          AS entry_at,
    'order'::text                                              AS entry_type,
    COALESCE(o.invoice_number, left(o.id::text, 8))            AS reference,
    CASE WHEN COALESCE(o.is_credit_order,false)
         THEN 'Credit order' ELSE 'Cash order' END             AS detail,
    CASE WHEN COALESCE(o.is_credit_order,false)
         THEN COALESCE(o.total_amount,0) ELSE 0 END            AS debit,
    0::numeric                                                 AS credit,
    NULL::text                                                 AS payment_method,
    o.id                                                       AS order_id,
    NULL::uuid                                                 AS collection_id,
    o.status                                                   AS order_status,
    o.payment_status                                           AS payment_status,
    COALESCE(o.is_credit_order,false)                          AS is_credit_order
  FROM orders o
  WHERE o.retailer_id = p_retailer_id
    AND COALESCE(o.status,'') NOT IN ('cancelled','replaced')

  UNION ALL

  SELECT
    COALESCE(c.collected_at, c.created_at)                     AS entry_at,
    'payment'::text                                            AS entry_type,
    COALESCE(NULLIF(c.upi_last_four,''), '')                   AS reference,
    COALESCE(NULLIF(c.notes,''),
             'Payment received')                               AS detail,
    0::numeric                                                 AS debit,
    COALESCE(c.amount,0)                                       AS credit,
    COALESCE(c.payment_method,'unspecified')                   AS payment_method,
    NULL::uuid                                                 AS order_id,
    c.id                                                       AS collection_id,
    NULL::text                                                 AS order_status,
    NULL::text                                                 AS payment_status,
    NULL::boolean                                              AS is_credit_order
  FROM retailer_payment_collections c
  WHERE c.retailer_id = p_retailer_id

  ORDER BY 1, 2;
$fn$;

REVOKE EXECUTE ON FUNCTION public._retailer_payment_ledger_impl(uuid) FROM public, anon, authenticated;


CREATE OR REPLACE FUNCTION public.get_retailer_payment_ledger(p_retailer_id uuid)
RETURNS TABLE(
  entry_at        timestamptz,
  entry_type      text,
  reference       text,
  detail          text,
  debit           numeric,
  credit          numeric,
  running_balance numeric,
  payment_method  text,
  order_id        uuid,
  collection_id   uuid,
  order_status    text,
  payment_status  text,
  is_credit_order boolean
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $fn$
BEGIN
  -- RLS on retailers decides this. No row visible => no ledger.
  IF NOT EXISTS (SELECT 1 FROM retailers r WHERE r.id = p_retailer_id) THEN
    RAISE EXCEPTION 'Your profile does not have permission to view this retailer';
  END IF;

  RETURN QUERY
  SELECT l.entry_at, l.entry_type, l.reference, l.detail, l.debit, l.credit,
         SUM(l.debit - l.credit) OVER (ORDER BY l.entry_at, l.entry_type
                                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
           AS running_balance,
         l.payment_method, l.order_id, l.collection_id,
         l.order_status, l.payment_status, l.is_credit_order
  FROM public._retailer_payment_ledger_impl(p_retailer_id) l
  ORDER BY l.entry_at, l.entry_type;
END $fn$;


-- Invoices for a retailer, with whether a rendered PDF already exists in the
-- public `invoices` bucket. Files are named invoice-<invoice_number>.pdf, but
-- only 48 of 135 exist (uploads stopped ~16 Jul), so has_pdf drives whether the
-- UI links the cached file or regenerates it.
CREATE OR REPLACE FUNCTION public._retailer_invoices_impl(p_retailer_id uuid)
RETURNS TABLE(
  invoice_id     uuid,
  invoice_number text,
  invoice_date   timestamptz,
  total_amount   numeric,
  status         text,
  order_id       uuid,
  order_status   text,
  storage_path   text,
  has_pdf        boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT i.id, i.invoice_number, i.created_at, i.total_amount, i.status,
         o.id, o.status,
         'invoice-'||i.invoice_number||'.pdf',
         EXISTS (SELECT 1 FROM storage.objects so
                 WHERE so.bucket_id='invoices'
                   AND so.name = 'invoice-'||i.invoice_number||'.pdf')
  FROM invoices i
  JOIN orders o ON o.id = i.order_id
  WHERE o.retailer_id = p_retailer_id
  ORDER BY i.created_at DESC;
$fn$;

REVOKE EXECUTE ON FUNCTION public._retailer_invoices_impl(uuid) FROM public, anon, authenticated;


CREATE OR REPLACE FUNCTION public.get_retailer_invoices(p_retailer_id uuid)
RETURNS TABLE(
  invoice_id     uuid,
  invoice_number text,
  invoice_date   timestamptz,
  total_amount   numeric,
  status         text,
  order_id       uuid,
  order_status   text,
  storage_path   text,
  has_pdf        boolean
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM retailers r WHERE r.id = p_retailer_id) THEN
    RAISE EXCEPTION 'Your profile does not have permission to view this retailer';
  END IF;
  RETURN QUERY SELECT * FROM public._retailer_invoices_impl(p_retailer_id);
END $fn$;


GRANT EXECUTE ON FUNCTION public.get_retailer_payment_ledger(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_retailer_invoices(uuid)       TO authenticated;

NOTIFY pgrst, 'reload schema';
