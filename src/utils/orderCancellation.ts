import { supabase } from "@/integrations/supabase/client";
import { visitStatusCache } from "@/lib/visitStatusCache";
import { removeOrderFromSnapshot } from "@/lib/myVisitsSnapshot";
import { offlineStorage, STORES } from "@/lib/offlineStorage";

/**
 * Order Cancellation Utility — Atomic RPC Version
 * 
 * All cancellation logic (order, invoice, credit, visit, gamification, loyalty)
 * is handled by a single database RPC for atomicity.
 * Frontend only does validation for fast UI feedback + cache cleanup.
 */

export interface CancelOrderOptions {
  settlement_method?: 'refund' | 'credit_note' | 'carry_forward' | null;
  settlement_amount?: number;
  van_stock_action?: 'collected' | 'damaged' | 'not_collected' | null;
}

export interface CancelOrderResult {
  success: boolean;
  error?: string;
  already_cancelled?: boolean;
  reversedData: {
    visitReverted: boolean;
    creditReversed: number;
    pointsRemoved: number;
    invoiceCancelled: boolean;
    loyaltyPointsRemoved: number;
    settlementMethod?: string | null;
    settlementAmount?: number;
    creditNoteNumber?: string | null;
    vanStockAction?: string | null;
  };
}

export interface OrderDetails {
  id: string;
  user_id: string;
  retailer_id: string;
  visit_id: string | null;
  order_date: string;
  created_at: string;
  total_amount: number;
  is_credit_order: boolean;
  credit_pending_amount: number;
  credit_paid_amount: number;
  status: string;
  delivery_status: string | null;
}

/**
 * Fetch order with all related data needed for cancellation
 */
async function fetchOrderWithDetails(orderId: string): Promise<OrderDetails | null> {
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, user_id, retailer_id, visit_id, order_date, created_at, total_amount, is_credit_order, credit_pending_amount, credit_paid_amount, status, delivery_status')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    console.error('[CancelOrder] Failed to fetch order:', error);
    return null;
  }

  return order;
}

/**
 * Validate that order can be cancelled (client-side for fast UI feedback)
 */
function validateCancellable(order: OrderDetails): { valid: boolean; reason?: string } {
  if (order.status === 'cancelled') {
    return { valid: false, reason: 'Order is already cancelled' };
  }

  if (order.status === 'delivered' || order.delivery_status === 'delivered') {
    return { valid: false, reason: 'Cannot cancel a delivered order. Please use the return process instead.' };
  }

  if (order.status !== 'confirmed' && order.status !== 'pending') {
    return { valid: false, reason: `Cannot cancel order with status: ${order.status}` };
  }

  return { valid: true };
}

/**
 * Clear local caches to reflect the cancellation
 */
async function clearLocalCaches(
  retailerId: string,
  userId: string,
  orderDate: string,
  orderId: string,
  visitReverted: boolean
): Promise<void> {
  // Remove cancelled order from IndexedDB offline storage so it doesn't get merged back
  try {
    await offlineStorage.delete(STORES.ORDERS, orderId);
    offlineStorage.invalidateCache(STORES.ORDERS);
    console.log('[CancelOrder] Removed cancelled order from offline storage:', orderId);
  } catch (e) {
    console.warn('[CancelOrder] Failed to remove order from offline storage:', e);
  }

  // Invalidate visit status cache
  await visitStatusCache.invalidate(retailerId, userId, orderDate);
  
  // Remove order from snapshot
  await removeOrderFromSnapshot(userId, orderDate, orderId);
  
  // Dispatch event for UI updates
  window.dispatchEvent(new CustomEvent('orderCancelled', {
    detail: { retailerId, orderId, orderDate }
  }));
  
  // Dispatch visitStatusChanged for visit card updates
  window.dispatchEvent(new CustomEvent('visitStatusChanged', {
    detail: { 
      retailerId, 
      status: visitReverted ? 'planned' : 'productive',
      orderValue: 0 
    }
  }));

  // Dispatch pointsEarned so gamification UI refreshes
  window.dispatchEvent(new CustomEvent('pointsEarned', {
    detail: { source: 'orderCancellation', retailerId, orderId }
  }));

  // Dispatch a global data refresh event
  window.dispatchEvent(new CustomEvent('globalDataRefresh', {
    detail: { source: 'orderCancellation', retailerId, orderId, orderDate }
  }));
}

/**
 * Main cancel order function — calls atomic RPC
 */
export async function cancelOrder(
  orderId: string,
  reason: string,
  cancelledByUserId: string
): Promise<CancelOrderResult> {
  console.log('[CancelOrder] Starting atomic cancellation for order:', orderId);

  const result: CancelOrderResult = {
    success: false,
    reversedData: {
      visitReverted: false,
      creditReversed: 0,
      pointsRemoved: 0,
      invoiceCancelled: false,
      loyaltyPointsRemoved: 0
    }
  };

  try {
    // 1. Client-side validation for fast UI feedback
    const order = await fetchOrderWithDetails(orderId);
    if (!order) {
      result.error = 'Order not found';
      return result;
    }

    const validation = validateCancellable(order);
    if (!validation.valid) {
      result.error = validation.reason;
      return result;
    }

    // 2. Call atomic RPC — single transaction handles everything
    const { data: rpcResult, error: rpcError } = await supabase.rpc('cancel_order_atomic', {
      p_order_id: orderId,
      p_reason: reason,
      p_cancelled_by: cancelledByUserId
    });

    if (rpcError) {
      console.error('[CancelOrder] RPC error:', rpcError);
      result.error = rpcError.message || 'Failed to cancel order';
      return result;
    }

    const rpcData = rpcResult as Record<string, unknown>;

    // 3. Handle RPC response
    if (!rpcData?.success) {
      result.error = (rpcData?.error as string) || 'Cancellation failed';
      return result;
    }

    if (rpcData?.already_cancelled) {
      result.success = true;
      result.already_cancelled = true;
      result.error = 'Order was already cancelled';
      return result;
    }

    // 4. Map RPC response to result
    result.success = true;
    result.reversedData = {
      visitReverted: (rpcData.visit_reverted as boolean) || false,
      creditReversed: Number(rpcData.credit_reversed) || 0,
      pointsRemoved: Number(rpcData.gamification_points_reversed) || 0,
      invoiceCancelled: (rpcData.invoice_cancelled as boolean) || false,
      loyaltyPointsRemoved: Number(rpcData.loyalty_points_reversed) || 0
    };

    // 5. Clear local caches (client-side only)
    const retailerId = (rpcData.retailer_id as string) || order.retailer_id;
    const orderDate = (rpcData.order_date as string) || order.order_date;
    
    await clearLocalCaches(
      retailerId,
      order.user_id,
      orderDate,
      orderId,
      result.reversedData.visitReverted
    );

    console.log('[CancelOrder] Atomic cancellation completed:', result.reversedData);
    return result;

  } catch (error: any) {
    console.error('[CancelOrder] Unexpected error:', error);
    result.error = error.message || 'An unexpected error occurred';
    return result;
  }
}

/**
 * Check if an order can be cancelled (for UI display)
 */
export async function canCancelOrder(orderId: string): Promise<{ canCancel: boolean; reason?: string }> {
  const order = await fetchOrderWithDetails(orderId);
  if (!order) {
    return { canCancel: false, reason: 'Order not found' };
  }

  const validation = validateCancellable(order);
  return { canCancel: validation.valid, reason: validation.reason };
}
