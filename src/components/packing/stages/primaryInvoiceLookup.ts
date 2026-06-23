import { supabase } from '@/integrations/supabase/client';

export interface PrimaryInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  order_id: string;
  distributor_id: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  finalized_at: string | null;
}

export interface PrimaryOrderInfo {
  id: string;
  order_number: string;
  order_date: string;
  payment_terms: string | null;
  payment_term: string | null;
  credit_limit: number | null;
  available_credit_at_order: number | null;
  distributor_id: string | null;
}

export interface PrimaryInvoiceLookup {
  orders: PrimaryOrderInfo[];
  orderIds: string[];
  invoices: PrimaryInvoice[];
  expectedCount: number;
  finalizedCount: number;
  ready: boolean;
}

export async function getPrimaryPackingListInvoiceLookup(packingListId: string): Promise<PrimaryInvoiceLookup> {
  const { data: orders, error: ordersError } = await supabase
    .from('primary_orders')
    .select('id, order_number, order_date, payment_terms, payment_term, credit_limit, available_credit_at_order, distributor_id')
    .eq('packing_list_id', packingListId);

  if (ordersError) throw ordersError;

  const orderList = (orders || []) as PrimaryOrderInfo[];
  const orderIds = orderList.map((order) => order.id);

  let invoices: PrimaryInvoice[] = [];
  if (orderIds.length) {
    const { data, error: invoicesError } = await supabase
      .from('primary_invoices')
      .select('id, invoice_number, invoice_date, due_date, status, order_id, distributor_id, subtotal, discount_amount, tax_amount, total_amount, finalized_at')
      .in('order_id', orderIds);

    if (invoicesError) throw invoicesError;
    invoices = (data || []) as PrimaryInvoice[];
  }

  const finalizedOrderIds = new Set(
    invoices
      .filter((invoice) => invoice.status === 'finalized' && orderIds.includes(invoice.order_id))
      .map((invoice) => invoice.order_id)
  );
  const expectedCount = orderIds.length;
  const finalizedCount = finalizedOrderIds.size;

  return {
    orders: orderList,
    orderIds,
    invoices,
    expectedCount,
    finalizedCount,
    ready: expectedCount > 0 && finalizedCount === expectedCount,
  };
}