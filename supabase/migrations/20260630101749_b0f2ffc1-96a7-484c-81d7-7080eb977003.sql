create or replace function public.get_returnable_lines(p_retailer_id uuid, p_product_id uuid, p_variant_id uuid)
returns table(order_id uuid, invoice_number text, order_date date, sold_qty numeric,
              rate numeric, line_taxable numeric, cgst_amount numeric, sgst_amount numeric, returnable numeric)
language sql stable security definer set search_path to 'public' as $f$
  select o.id, o.invoice_number, o.order_date,
         oi.quantity, oi.rate, oi.total, oi.cgst_amount, oi.sgst_amount,
         public.returnable_qty(o.id, oi.product_id, oi.variant_id)
  from orders o
  join order_items oi on oi.order_id = o.id
  where o.retailer_id = p_retailer_id
    and oi.product_id = p_product_id
    and (p_variant_id is null or oi.variant_id = p_variant_id)
    and coalesce(o.status,'') <> 'cancelled'
    and public.returnable_qty(o.id, oi.product_id, oi.variant_id) > 0
  order by o.order_date desc nulls last;
$f$;

grant execute on function public.get_returnable_lines(uuid, uuid, uuid) to authenticated, service_role;