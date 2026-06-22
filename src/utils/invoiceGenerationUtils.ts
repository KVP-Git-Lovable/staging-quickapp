import { supabase } from '@/integrations/supabase/client';

/**
 * Invoice Generation Utilities for Order-Based Delivery Flow
 * 
 * Invoice Timing Rules:
 * - Pay Now: Invoice generated immediately at cart level
 * - COD / Partial / Pending: Invoice generated after bill submission at delivery
 */

interface InvoiceGenerationResult {
  success: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  error?: string;
}

/**
 * Check if invoice should be generated at cart level
 * Only for "Pay Now" orders in order-based delivery flow
 */
export function shouldGenerateInvoiceAtCart(
  isOrderBasedDelivery: boolean,
  deliveryPaymentMethod: 'cod' | 'pay_now' | ''
): boolean {
  if (!isOrderBasedDelivery) {
    // Legacy flow - always generate at cart
    return true;
  }
  
  // Order-based delivery: only generate immediately for "Pay Now"
  return deliveryPaymentMethod === 'pay_now';
}

/**
 * Check if invoice should be generated at delivery
 * For COD orders in order-based delivery flow
 */
export function shouldGenerateInvoiceAtDelivery(
  isOrderBasedDelivery: boolean,
  deliveryPaymentMethod: 'cod' | 'pay_now' | '',
  paymentStatus: 'pending' | 'partial' | 'paid'
): boolean {
  if (!isOrderBasedDelivery) {
    return false;
  }
  
  // Generate at delivery for COD orders when payment is collected
  return deliveryPaymentMethod === 'cod' && 
    (paymentStatus === 'paid' || paymentStatus === 'partial');
}

/**
 * Mark order as invoice generated.
 *
 * NOTE: `invoice_generated_at` is now the DISPATCH lock (see canEditOrder).
 * The invoice row itself is persisted automatically by a DB trigger when an
 * order is confirmed, so this helper must NOT be called at order
 * creation/confirmation. It is reserved for the dispatch step and is a no-op
 * by default to avoid burning the edit window.
 */
export async function markInvoiceGenerated(
  _orderId: string
): Promise<InvoiceGenerationResult> {
  // Intentional no-op. Setting `invoice_generated_at` is now done at dispatch only.
  return { success: true };
}

/**
 * Update order payment status after delivery collection.
 *
 * Does NOT touch `invoice_generated_at` — that field is reserved for dispatch
 * and controls the order edit lock.
 */
export async function updateOrderPaymentStatus(
  orderId: string,
  paymentStatus: 'pending' | 'partial' | 'paid',
  amountCollected: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: any = {
      payment_status: paymentStatus,
      amount_collected: amountCollected
    };

    const { error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error('Error updating payment status:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to update payment status'
    };
  }
}

/**
 * Get order payment summary
 */
export async function getOrderPaymentSummary(orderId: string): Promise<{
  totalAmount: number;
  amountCollected: number;
  amountPending: number;
  paymentStatus: string;
  isPaid: boolean;
} | null> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('total_amount, amount_collected, payment_status')
      .eq('id', orderId)
      .single();

    if (error) throw error;
    if (!data) return null;

    const totalAmount = data.total_amount || 0;
    const amountCollected = data.amount_collected || 0;
    const paymentStatus = data.payment_status || 'pending';

    return {
      totalAmount,
      amountCollected,
      amountPending: Math.max(0, totalAmount - amountCollected),
      paymentStatus,
      isPaid: paymentStatus === 'paid'
    };
  } catch (error) {
    console.error('Error getting payment summary:', error);
    return null;
  }
}

/**
 * Get confirmation message based on payment method
 */
export function getOrderConfirmationMessage(
  isOrderBasedDelivery: boolean,
  deliveryPaymentMethod: 'cod' | 'pay_now' | ''
): { title: string; description: string } {
  if (!isOrderBasedDelivery) {
    return {
      title: 'Order Confirmed',
      description: 'Your order has been placed successfully.'
    };
  }

  if (deliveryPaymentMethod === 'pay_now') {
    return {
      title: 'Order Confirmed & Paid',
      description: 'Thank you for your payment. Invoice has been sent.'
    };
  }

  // COD
  return {
    title: 'Order Received',
    description: 'Thank you for placing the order. Your order has been received and will be delivered tomorrow.'
  };
}
