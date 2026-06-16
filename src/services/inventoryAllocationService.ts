import { supabase } from "@/integrations/supabase/client";

export interface BatchAllocation {
  batch_id: string;
  batch_no: string;
  expiry_date: string | null;
  allocated_qty: number;
}

export interface AllocationResult {
  success: boolean;
  allocations?: BatchAllocation[];
  total_allocated?: number;
  shortfall_qty?: number;
  error?: string;
}

export type AllocationStrategy = 'FEFO' | 'FIFO' | 'LIFO';

export interface PreviewAllocation {
  batch_id: string;
  batch_no: string;
  expiry_date: string | null;
  allocated_qty: number;
  available_qty: number;
}

export interface PreviewResult {
  success: boolean;
  allocations: PreviewAllocation[];
  total_allocated: number;
  shortfall_qty: number;
  error?: string;
}

/**
 * Allocate inventory across batches using the specified strategy (default FEFO).
 * Supports partial allocation — returns shortfall_qty when stock is insufficient.
 * Optional warehouseId filters allocation to a specific warehouse.
 */
export async function allocateInventory(
  distributorId: string,
  productId: string,
  requiredQty: number,
  strategy: AllocationStrategy = 'FEFO',
  warehouseId?: string | null
): Promise<AllocationResult> {
  try {
    const rpcParams: any = {
      p_distributor_id: distributorId,
      p_product_id: productId,
      p_required_qty: requiredQty,
      p_strategy: strategy,
    };

    if (warehouseId) {
      rpcParams.p_warehouse_id = warehouseId;
    }

    const { data, error } = await supabase.rpc('allocate_inventory_batches', rpcParams);

    if (error) {
      return { success: false, error: error.message };
    }

    // New RPC returns {allocations, total_allocated, shortfall_qty}
    const result = data as any;
    const allocations: BatchAllocation[] = result?.allocations || [];
    const totalAllocated: number = result?.total_allocated || 0;
    const shortfallQty: number = result?.shortfall_qty || 0;

    return {
      success: true,
      allocations,
      total_allocated: totalAllocated,
      shortfall_qty: shortfallQty,
    };
  } catch (err) {
    console.error('Allocation failed:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Allocation failed' };
  }
}

/**
 * Preview available batches for allocation (read-only, no reservation).
 * Used for batch-level visibility in the approval dialog.
 */
export async function previewBatchAvailability(
  distributorId: string,
  productId: string,
  warehouseId?: string | null
): Promise<{ batches: Array<{ id: string; batch_no: string; expiry_date: string | null; available_qty: number; warehouse_id: string | null }>; total_available: number }> {
  try {
    // Inventory is scoped by warehouse (the parent distributor's warehouse
    // selected in the approval dialog). Do NOT filter by distributor_id here —
    // the warehouse already pins the inventory to the correct parent context.
    let query = supabase
      .from('inventory_batches')
      .select('id, batch_no, expiry_date, quantity, reserved_qty, warehouse_id')
      .eq('product_id', productId)
      .gt('quantity', 0)
      .or('expiry_date.is.null,expiry_date.gt.' + new Date().toISOString().split('T')[0])
      .order('expiry_date', { ascending: true, nullsFirst: false });

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to preview batches:', error);
      return { batches: [], total_available: 0 };
    }

    const batches = (data || [])
      .map((b: any) => ({
        id: b.id,
        batch_no: b.batch_no || '-',
        expiry_date: b.expiry_date,
        available_qty: Math.max(0, (b.quantity || 0) - (b.reserved_qty || 0)),
        warehouse_id: b.warehouse_id,
      }))
      .filter((b: any) => b.available_qty > 0);

    const total_available = batches.reduce((sum, b) => sum + b.available_qty, 0);

    return { batches, total_available };
  } catch (err) {
    console.error('Preview batch availability failed:', err);
    return { batches: [], total_available: 0 };
  }
}

/**
 * Release batch-level reservations (e.g., when a packing list is cancelled).
 */
export async function releaseAllocation(
  batchAllocations: Array<{ batch_id: string; qty: number }>
): Promise<{ success: boolean; error?: string }> {
  try {
    for (const alloc of batchAllocations) {
      const { error } = await supabase.rpc('release_batch_reservation', {
        p_batch_id: alloc.batch_id,
        p_qty: alloc.qty,
      });
      if (error) {
        console.error('Release failed for batch', alloc.batch_id, error);
      }
    }
    return { success: true };
  } catch (err) {
    console.error('Release allocation failed:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Release failed' };
  }
}

/**
 * Dispatch stock: deducts reserved qty from batches and creates ledger entries.
 */
export async function dispatchStock(
  distributorId: string,
  packingListId: string,
  pickedBatches: Array<{ product_id: string; batch_id: string; qty: number }>
): Promise<{ success: boolean; error?: string }> {
  try {
    for (const entry of pickedBatches) {
      const { error } = await supabase.rpc('dispatch_batch_stock', {
        p_distributor_id: distributorId,
        p_product_id: entry.product_id,
        p_batch_id: entry.batch_id,
        p_qty: entry.qty,
        p_packing_list_id: packingListId,
      });
      if (error) {
        console.error('Dispatch failed for batch', entry.batch_id, error);
      }
    }
    return { success: true };
  } catch (err) {
    console.error('Dispatch stock failed:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Dispatch failed' };
  }
}

/**
 * Preview allocation (read-only, NO DB writes).
 * Returns proposed batch allocations for UI display before confirming.
 */
export async function previewAllocation(
  distributorId: string,
  productId: string,
  requiredQty: number,
  strategy: AllocationStrategy = 'FEFO',
  warehouseId?: string | null
): Promise<PreviewResult> {
  try {
    const rpcParams: any = {
      p_distributor_id: distributorId,
      p_product_id: productId,
      p_required_qty: requiredQty,
      p_strategy: strategy,
    };

    if (warehouseId) {
      rpcParams.p_warehouse_id = warehouseId;
    }

    const { data, error } = await supabase.rpc('preview_inventory_allocation', rpcParams);

    if (error) {
      return { success: false, allocations: [], total_allocated: 0, shortfall_qty: requiredQty, error: error.message };
    }

    const result = data as any;
    return {
      success: true,
      allocations: result?.allocations || [],
      total_allocated: result?.total_allocated || 0,
      shortfall_qty: result?.shortfall_qty || 0,
    };
  } catch (err) {
    console.error('Preview allocation failed:', err);
    return { success: false, allocations: [], total_allocated: 0, shortfall_qty: requiredQty, error: err instanceof Error ? err.message : 'Preview failed' };
  }
}

/**
 * Cancel a packing list: releases all batch reservations and sets status to cancelled.
 */
export async function cancelPackingListReservations(
  packingListId: string
): Promise<{ success: boolean; total_released?: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('cancel_packing_list_reservations', {
      p_packing_list_id: packingListId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const result = data as any;
    return {
      success: result?.success ?? true,
      total_released: result?.total_released || 0,
      error: result?.error,
    };
  } catch (err) {
    console.error('Cancel packing list reservations failed:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Cancellation failed' };
  }
}

/**
 * Release all reservations for a packing list (for reallocation scenarios).
 */
export async function releaseAllPackingListReservations(
  packingListId: string
): Promise<{ success: boolean; total_released?: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('release_all_packing_list_reservations', {
      p_packing_list_id: packingListId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const result = data as any;
    return {
      success: result?.success ?? true,
      total_released: result?.total_released || 0,
      error: result?.error,
    };
  } catch (err) {
    console.error('Release all packing list reservations failed:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Release failed' };
  }
}
