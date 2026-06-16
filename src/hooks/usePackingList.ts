import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { reserveStockForPackingList, releaseReservedStock, aggregateOrderItems } from '@/utils/inventoryReservation';
import { dispatchStock, releaseAllocation, cancelPackingListReservations, releaseAllPackingListReservations } from '@/services/inventoryAllocationService';
import type { ApprovedItemMap, ManualBatchEntry } from '@/components/packing/OrderReviewApprovalDialog';

export interface PackingList {
  id: string;
  packing_list_number: string;
  delivery_date: string;
  distributor_id: string | null;
  created_by: string | null;
  status: 'draft' | 'picking' | 'packed' | 'ready' | 'dispatched' | 'delivered' | 'completed' | 'cancelled';
  order_type: 'primary' | 'secondary';
  total_items: number;
  total_value: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PackingListItem {
  id: string;
  packing_list_id: string;
  product_id: string;
  product_name: string;
  unit: string | null;
  ordered_qty: number;
  picked_qty: number;
  short_qty: number;
  batch_number: string | null;
  expiry_date: string | null;
  // UOM snapshot (Phase A columns) — null on legacy rows.
  uom_id?: string | null;
  uom_code?: string | null;
  conversion_to_base?: number | null;
  base_qty?: number | null;
}

export interface PackingListAssignment {
  id: string;
  packing_list_id: string;
  agent_id: string | null;
  van_id: string | null;
  beat_ids: string[] | null;
  territory_ids: string[] | null;
  order_count: number;
  total_load_qty: number;
  total_load_value: number;
  status: 'assigned' | 'in_transit' | 'completed';
  dispatched_at: string | null;
  completed_at: string | null;
}

export interface OrderForPacking {
  id: string;
  order_number?: string;
  order_date: string;
  delivery_date?: string;
  delivery_status?: string;
  order_status?: string;
  order_source?: string;
  retailer_id: string;
  retailer_name?: string;
  source_distributor_name?: string;
  beat_id?: string;
  beat_name?: string;
  territory_id?: string;
  territory_name?: string;
  total_amount: number;
  total_qty?: number;
  // Payment info for delivery agent
  is_credit_order?: boolean;
  payment_method?: string;
  credit_paid_amount?: number;
  credit_pending_amount?: number;
  items: Array<{
    id?: string; // real order_item_id for exact traceability
    product_id: string;
    product_name: string;
    quantity: number;
    unit?: string;
    price: number;
  }>;
}

export function usePackingList() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const ensurePackingListStatus = async (
    packingListId: string,
    expectedStatus: PackingList['status'],
    allowedStatuses: PackingList['status'][] = [expectedStatus]
  ) => {
    const { data, error } = await supabase
      .from('packing_lists')
      .select('status')
      .eq('id', packingListId)
      .limit(1);

    if (error) throw error;

    const row = data?.[0];
    if (!row) {
      throw new Error('Packing list not found while verifying status');
    }

    const actualStatus = row.status as PackingList['status'];
    if (!allowedStatuses.includes(actualStatus)) {
      throw new Error(`Packing list status did not persist. Expected ${expectedStatus}, found ${actualStatus}`);
    }

    return actualStatus;
  };

  const advancePackingListToStatus = async (
    packingListId: string,
    targetStatus: PackingList['status']
  ) => {
    const transitionOrder: PackingList['status'][] = ['draft', 'picking', 'packed', 'ready', 'dispatched', 'delivered', 'completed'];
    const currentStatus = await ensurePackingListStatus(packingListId, targetStatus, transitionOrder);

    if (currentStatus === targetStatus) return currentStatus;

    const startIdx = transitionOrder.indexOf(currentStatus);
    const targetIdx = transitionOrder.indexOf(targetStatus);
    if (startIdx === -1 || targetIdx === -1 || startIdx > targetIdx) {
      throw new Error(`Cannot advance packing list from ${currentStatus} to ${targetStatus}`);
    }

    for (let i = startIdx + 1; i <= targetIdx; i++) {
      const nextStatus = transitionOrder[i];
      const { error, count } = await supabase
        .from('packing_lists')
        .update(
          { status: nextStatus, updated_at: new Date().toISOString() },
          { count: 'exact' }
        )
        .eq('id', packingListId);

      if (error) throw error;

      // Some RLS configurations strip the returning row even when the update succeeds.
      // Re-read the row to verify the status actually persisted.
      const { data: verifyRow, error: verifyErr } = await supabase
        .from('packing_lists')
        .select('status')
        .eq('id', packingListId)
        .maybeSingle();
      if (verifyErr) throw verifyErr;

      if (!verifyRow) {
        throw new Error(`Packing list disappeared while moving to ${nextStatus}`);
      }
      if (verifyRow.status !== nextStatus) {
        if (count === 0) {
          throw new Error(
            `You don't have permission to move this packing list to "${nextStatus}". Please ask an admin or the owning distributor to confirm packing.`
          );
        }
        throw new Error(`Packing list status did not persist. Expected ${nextStatus}, found ${verifyRow.status}`);
      }

      if (nextStatus === 'packed') {
        const { error: releaseError } = await supabase.rpc('release_shortfall_on_packed' as any, {
          p_packing_list_id: packingListId,
        });
        if (releaseError) console.error('Shortfall release error:', releaseError);
      }
    }

    return targetStatus;
  };

  // Fetch packing lists with filters
  const fetchPackingLists = useCallback(async (filters?: {
    distributorId?: string;
    status?: string;
    deliveryDate?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => {
    setLoading(true);
    try {
      let query = supabase
        .from('packing_lists')
        .select('*')
        .order('delivery_date', { ascending: false });

      // Handle distributor filtering: 'direct' means null distributor_id
      if (filters?.distributorId === 'direct') {
        query = query.is('distributor_id', null);
      } else if (filters?.distributorId) {
        query = query.eq('distributor_id', filters.distributorId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.deliveryDate) {
        query = query.eq('delivery_date', filters.deliveryDate);
      }
      if (filters?.dateFrom) {
        query = query.gte('delivery_date', filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte('delivery_date', filters.dateTo);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as PackingList[];
    } catch (error) {
      console.error('Error fetching packing lists:', error);
      toast({
        title: "Error",
        description: "Failed to fetch packing lists",
        variant: "destructive"
      });
      return [];
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Fetch single packing list with items and assignments
  const fetchPackingListDetail = useCallback(async (packingListId: string) => {
    setLoading(true);
    try {
      const [packingListRes, itemsRes, assignmentsRes, ordersRes] = await Promise.all([
        supabase.from('packing_lists').select('*').eq('id', packingListId).single(),
        supabase.from('packing_list_items').select('*').eq('packing_list_id', packingListId),
        supabase.from('packing_list_assignments').select('*').eq('packing_list_id', packingListId),
        supabase.from('orders').select(`
          id, total_amount, delivery_status,
          retailers(id, name, beat_id, beat_name, territory_id),
          order_items(id, product_id, product_name, quantity, unit, rate)
        `).eq('packing_list_id', packingListId)
      ]);

      if (packingListRes.error) throw packingListRes.error;

      // Transform orders to include items in expected format
      const transformedOrders = (ordersRes.data || []).map((order: any) => ({
        ...order,
        items: (order.order_items || []).map((item: any) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
          price: item.rate
        }))
      }));

      return {
        packingList: packingListRes.data as PackingList,
        items: (itemsRes.data || []) as PackingListItem[],
        assignments: (assignmentsRes.data || []) as PackingListAssignment[],
        orders: transformedOrders
      };
    } catch (error) {
      console.error('Error fetching packing list detail:', error);
      toast({
        title: "Error",
        description: "Failed to fetch packing list details",
        variant: "destructive"
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Fetch orders available for packing (confirmed D-1 orders without packing list)
  const fetchOrdersForPacking = useCallback(async (filters: {
    distributorId?: string;
    orderDate?: string;
    dateFrom?: string;
    dateTo?: string;
    beatIds?: string[];
    territoryIds?: string[];
    deliveryStatus?: string;  // Filter by delivery_status
    deliveryDate?: string;    // Filter by delivery_date
  }) => {
    setLoading(true);
    try {
      // Fetch orders first - use retailer_name from orders table directly
      let query = supabase
        .from('orders')
        .select(`
          id,
          distributor_id,
          order_date,
          order_source,
          invoice_number,
          retailer_id,
          retailer_name,
          total_amount,
          delivery_date,
          delivery_status,
          is_credit_order,
          payment_method,
          credit_paid_amount,
          credit_pending_amount,
          order_items(
            id,
            product_id,
            product_name,
            quantity,
            unit,
            rate
          )
        `)
        .is('packing_list_id', null)
        .eq('status', 'confirmed')
        .order('order_date', { ascending: false });

      // Include both pending portal orders and D-1 orders ready for packing
      if (filters.deliveryStatus) {
        query = query.eq('delivery_status', filters.deliveryStatus);
      } else {
        query = query.in('delivery_status', ['pending', 'in_packing_list']);
      }

      // Filter by distributor — handled after fetch to support parent_name fallback
      // (many orders have distributor_id = NULL but belong to a distributor via retailer.parent_name)

      if (filters.deliveryDate) {
        query = query.eq('delivery_date', filters.deliveryDate);
      }
      if (filters.orderDate) {
        query = query.eq('order_date', filters.orderDate);
      }
      if (filters.dateFrom) {
        query = query.gte('order_date', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('order_date', filters.dateTo);
      }

      const { data, error } = await query;
      
      // If we have orders, fetch retailer details for beat filtering AND distributor matching
      let retailerMap: Record<string, { beat_id?: string; beat_name?: string; territory_id?: string; distributor_id?: string; parent_name?: string }> = {};
      if (data && data.length > 0) {
        const retailerIds = [...new Set(data.map((o: any) => o.retailer_id).filter(Boolean))];
        if (retailerIds.length > 0) {
          const { data: retailers } = await supabase
            .from('retailers')
            .select('id, beat_id, beat_name, territory_id, distributor_id, parent_name')
            .in('id', retailerIds);
          
          if (retailers) {
            retailerMap = retailers.reduce((acc, r) => {
              acc[r.id] = { beat_id: r.beat_id, beat_name: r.beat_name, territory_id: r.territory_id, distributor_id: r.distributor_id || undefined, parent_name: r.parent_name || undefined };
              return acc;
            }, {} as Record<string, { beat_id?: string; beat_name?: string; territory_id?: string; distributor_id?: string; parent_name?: string }>);
          }
        }
      }

      if (error) throw error;

      // Transform data to include retailer info and payment status
      let ordersWithRetailer = (data || []).map((order: any) => {
        const retailerInfo = retailerMap[order.retailer_id] || {};
        return {
          id: order.id,
          order_number: order.invoice_number || undefined,
          order_date: order.order_date,
          delivery_date: order.delivery_date,
          delivery_status: order.delivery_status,
          order_source: order.order_source || undefined,
          retailer_id: order.retailer_id,
          retailer_name: order.retailer_name || 'Unknown Retailer',
          beat_id: retailerInfo.beat_id,
          beat_name: retailerInfo.beat_name || 'No Beat',
          territory_id: retailerInfo.territory_id,
          total_amount: order.total_amount,
          // Payment info for delivery agent
          is_credit_order: order.is_credit_order,
          payment_method: order.payment_method,
          credit_paid_amount: order.credit_paid_amount,
          credit_pending_amount: order.credit_pending_amount,
          // Transform order_items to expected items format
          items: (order.order_items || []).map((item: any) => ({
            id: item.id, // real order_item_id
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit: item.unit,
            price: item.rate
          }))
        };
      });

      // Filter by distributor — supports orders with NULL distributor_id via retailer parent_name fallback
      if (filters.distributorId) {
        // Get distributor name for parent_name matching
        const { data: distRecord } = await supabase
          .from('distributors')
          .select('name')
          .eq('id', filters.distributorId)
          .single();
        const distName = distRecord?.name;

        ordersWithRetailer = ordersWithRetailer.filter((order: any) => {
          const originalOrder = (data || []).find((o: any) => o.id === order.id);
          // Direct distributor_id match
          if (originalOrder?.distributor_id === filters.distributorId) return true;
          // Fallback: retailer's distributor_id matches
          const rInfo = retailerMap[order.retailer_id];
          if (rInfo?.distributor_id === filters.distributorId) return true;
          // Fallback: retailer's parent_name matches distributor name
          if (distName && rInfo?.parent_name === distName) return true;
          return false;
        });
      }

      // Apply beat filter if specified
      if (filters.beatIds && filters.beatIds.length > 0) {
        ordersWithRetailer = ordersWithRetailer.filter(o => 
          o.beat_id && filters.beatIds!.includes(o.beat_id)
        );
      }

      return ordersWithRetailer as OrderForPacking[];
    } catch (error) {
      console.error('Error fetching orders for packing:', error);
      toast({
        title: "Error",
        description: "Failed to fetch orders",
        variant: "destructive"
      });
      return [];
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Fetch primary orders for packing (B2D orders from child distributors)
  const fetchPrimaryOrdersForPacking = useCallback(async (distributorId: string) => {
    setLoading(true);
    try {
      // Fetch primary orders targeting this distributor
      let query = supabase
        .from('primary_orders')
        .select(`
          id,
          order_number,
          order_date,
          expected_delivery_date,
          status,
          total_amount,
          source_distributor_id,
          target_distributor_id,
          primary_order_items(
            id,
            product_id,
            product_name,
            quantity,
            unit,
            unit_price
          )
        `)
        .is('packing_list_id', null)
        .in('status', ['confirmed', 'processing', 'submitted', 'approved', 'allocated']);

      // Determine if this distributor is OEM-type (top of hierarchy)
      const { data: distributorRecord, error: distributorError } = await supabase
        .from('distributors')
        .select('type_id')
        .eq('id', distributorId)
        .single();

      if (distributorError) throw distributorError;

      let isOEM = false;
      if (distributorRecord?.type_id) {
        const { data: typeRecord, error: typeError } = await supabase
          .from('distributor_types')
          .select('code, parent_type_code')
          .eq('id', distributorRecord.type_id)
          .single();

        if (typeError) throw typeError;
        isOEM = Boolean(typeRecord?.code && !typeRecord.parent_type_code);
      }

      if (isOEM) {
        // OEM distributors see orders routed to "Company" (target_distributor_id IS NULL)
        query = query.is('target_distributor_id', null);
      } else {
        // Non-OEM parents see orders explicitly targeting them
        query = query.eq('target_distributor_id', distributorId);
      }

      const { data, error } = await query.order('order_date', { ascending: false });
      if (error) throw error;

      // Fetch source distributor names and territory info
      const sourceIds = [...new Set((data || []).map((o: any) => o.source_distributor_id).filter(Boolean))];
      let sourceMap: Record<string, { name: string; territory_id?: string }> = {};
      if (sourceIds.length > 0) {
        const { data: sources } = await supabase
          .from('distributors')
          .select('id, name, territory_id')
          .in('id', sourceIds);
        if (sources) {
          sourceMap = sources.reduce((acc, s) => {
            acc[s.id] = { name: s.name, territory_id: s.territory_id || undefined };
            return acc;
          }, {} as Record<string, { name: string; territory_id?: string }>);
        }
      }

      // Fetch territory names
      const territoryIds = [...new Set(Object.values(sourceMap).map(s => s.territory_id).filter(Boolean))] as string[];
      let territoryMap: Record<string, string> = {};
      if (territoryIds.length > 0) {
        const { data: territories } = await supabase
          .from('territories')
          .select('id, name')
          .in('id', territoryIds);
        if (territories) {
          territoryMap = territories.reduce((acc, t) => { acc[t.id] = t.name; return acc; }, {} as Record<string, string>);
        }
      }

      const ordersForPacking: OrderForPacking[] = (data || []).map((order: any) => {
        const sourceInfo = sourceMap[order.source_distributor_id] || { name: 'Unknown Distributor' };
        const totalQty = (order.primary_order_items || []).reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
        const territoryName = sourceInfo.territory_id ? territoryMap[sourceInfo.territory_id] : undefined;
        return {
          id: order.id,
          order_number: order.order_number,
          order_date: order.order_date,
          delivery_date: order.expected_delivery_date,
          order_status: order.status,
          retailer_id: order.source_distributor_id || '',
          retailer_name: sourceInfo.name,
          source_distributor_name: sourceInfo.name,
          territory_id: sourceInfo.territory_id,
          territory_name: territoryName,
          total_amount: order.total_amount || 0,
          total_qty: totalQty,
          items: (order.primary_order_items || []).map((item: any) => ({
            id: item.id, // real primary_order_item_id
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit: item.unit,
            price: item.unit_price
          }))
        };
      });

      return ordersForPacking;
    } catch (error) {
      console.error('Error fetching primary orders for packing:', error);
      toast({
        title: "Error",
        description: "Failed to fetch primary orders",
        variant: "destructive"
      });
      return [];
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Create packing list from selected orders
  // Update picked qty for a specific batch row
  const updateBatchPickedQty = useCallback(async (
    batchRowId: string,
    pickedQty: number,
    _packingListItemId: string
  ) => {
    try {
      const { data, error } = await supabase.rpc('update_picking_atomic' as any, {
        p_batch_row_id: batchRowId,
        p_picked_qty: pickedQty,
      });

      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || 'Picking update failed');

      return { success: true, totalPicked: result.total_picked, shortQty: result.short_qty };
    } catch (error) {
      console.error('Error updating batch picked qty:', error);
      return { success: false, totalPicked: 0, shortQty: 0 };
    }
  }, []);

  const createPackingList = useCallback(async (
    deliveryDate: string,
    distributorId: string | null,
    orderIds: string[],
    orders: OrderForPacking[],
    orderType: 'primary' | 'secondary' = 'secondary',
    approvedItems?: ApprovedItemMap,
    warehouseId?: string | null,
    strategy?: string,
    manualAllocations?: Record<string, ManualBatchEntry[]>
  ) => {
    setLoading(true);
    try {
      const hasApproval = approvedItems && Object.keys(approvedItems).length > 0;

      // Build aggregated items based on approval or legacy path.
      // For multi-UOM lines we keep one row per (product_id, uom_code) so the
      // snapshot survives onto packing_list_items.
      let aggregatedItems: Array<{
        product_id: string;
        product_name: string;
        quantity: number;
        unit?: string;
        uom_id?: string | null;
        uom_code?: string | null;
        conversion_to_base?: number | null;
        base_qty?: number;
      }>;

      if (hasApproval) {
        const productMap = new Map<string, any>();
        Object.values(approvedItems!).forEach(item => {
          if (item.approved_qty <= 0) return;
          const key = `${item.product_id}::${item.uom_code || ''}`;
          const conv = item.conversion_to_base && item.conversion_to_base > 0 ? item.conversion_to_base : 1;
          const baseQty = item.approved_qty; // approved_qty already in base units
          const existing = productMap.get(key);
          if (existing) {
            existing.quantity += item.approved_qty / conv; // display qty in selected UOM
            existing.base_qty += baseQty;
          } else {
            productMap.set(key, {
              product_id: item.product_id,
              product_name: item.product_name,
              quantity: item.approved_qty / conv,
              unit: item.uom_code || item.unit,
              uom_id: item.uom_id ?? null,
              uom_code: item.uom_code ?? null,
              conversion_to_base: item.conversion_to_base ?? null,
              base_qty: baseQty,
            });
          }
        });
        aggregatedItems = Array.from(productMap.values());
      } else {
        aggregatedItems = aggregateOrderItems(orders);
      }

      if (aggregatedItems.length === 0) {
        toast({ title: 'No items to pack', description: 'All items were rejected or have zero approved quantity', variant: 'destructive' });
        setLoading(false);
        return null;
      }

      // Calculate totals
      const totalValue = hasApproval
        ? Object.values(approvedItems!).reduce((sum, i) => sum + (i.approved_qty * i.price), 0)
        : orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

      // Build approved order IDs
      const approvedOrderIds = hasApproval
        ? [...new Set(Object.values(approvedItems!).filter(i => i.approved_qty > 0).map(i => i.order_id))]
        : orderIds;

      // Build items JSONB — include UOM snapshot + base_qty when available
      const pItems = aggregatedItems.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        unit: item.unit || null,
        quantity: item.quantity,
        uom_id: item.uom_id ?? null,
        uom_code: item.uom_code ?? null,
        conversion_to_base: item.conversion_to_base ?? null,
        base_qty: item.base_qty ?? item.quantity,
      }));

      // Build batch allocations JSONB (aggregate by product for FEFO allocation inside RPC)
      // Reservation must always happen inside the atomic RPC, never in the review dialog.
      const hasBatchAllocations = Boolean(distributorId && aggregatedItems.length > 0);
      let pBatchAllocations: any[] | null = null;

      if (hasBatchAllocations) {
        if (strategy === 'MANUAL' && manualAllocations) {
          // Manual mode: send explicit batch selections per product
          const productQtyMap = new Map<string, number>();
          aggregatedItems.forEach(item => {
            productQtyMap.set(item.product_id, (productQtyMap.get(item.product_id) || 0) + item.quantity);
          });
          pBatchAllocations = Array.from(productQtyMap.entries()).map(([product_id, required_qty]) => ({
            product_id,
            required_qty,
            manual_batches: (manualAllocations[product_id] || [])
              .filter(b => b.allocate_qty > 0)
              .map(b => ({ batch_id: b.batch_id, allocate_qty: b.allocate_qty })),
          }));
        } else {
          // Auto mode: aggregate required qty per product for the RPC to allocate
          const productQtyMap = new Map<string, number>();
          aggregatedItems.forEach(item => {
            productQtyMap.set(item.product_id, (productQtyMap.get(item.product_id) || 0) + item.quantity);
          });
          pBatchAllocations = Array.from(productQtyMap.entries()).map(([product_id, required_qty]) => ({
            product_id,
            required_qty,
          }));
        }
      }

      // Build sources JSONB for traceability (includes backorder_qty for atomic backorder persistence)
      let pSources: any[] | null = null;
      if (hasApproval) {
        pSources = Object.entries(approvedItems!)
          .filter(([_, i]) => i.approved_qty > 0 || i.backorder_qty > 0)
          .map(([key, i]) => ({
            product_id: i.product_id,
            order_id: i.order_id,
            order_item_id: key, // real UUID from order_items.id
            allocated_qty: i.approved_qty,
            backorder_qty: i.backorder_qty > 0 ? i.backorder_qty : 0,
          }));
      }

      // ============================================================
      // SINGLE ATOMIC RPC CALL — all-or-nothing transaction
      // ============================================================
      const rpcStrategy = strategy === 'MANUAL' ? 'FEFO' : (strategy || 'FEFO');
      const { data, error } = await supabase.rpc('create_packing_list_atomic' as any, {
        p_distributor_id: distributorId,
        p_delivery_date: deliveryDate,
        p_order_type: orderType,
        p_warehouse_id: warehouseId || null,
        p_total_value: totalValue,
        p_items: pItems,
        p_order_ids: approvedOrderIds,
        p_batch_allocations: pBatchAllocations,
        p_sources: pSources,
        p_strategy: rpcStrategy,
      });

      if (error) throw error;

      const result = data as any;

      if (!result?.success) {
        throw new Error(result?.error || 'Atomic packing list creation failed');
      }

      // Backorders are now handled atomically inside the RPC via backorder_qty in sources

      toast({
        title: "Success",
        description: `Packing list ${result.packing_list_number} created with ${approvedOrderIds.length} orders`
      });

      return {
        id: result.packing_list_id,
        packing_list_number: result.packing_list_number,
        delivery_date: deliveryDate,
        distributor_id: distributorId,
        status: 'draft',
        order_type: orderType,
        total_value: totalValue,
        total_items: aggregatedItems.reduce((sum, i) => sum + i.quantity, 0),
      } as PackingList;
    } catch (error) {
      console.error('Error creating packing list:', error);
      // No manual rollback needed — the RPC is fully atomic
      const message = error instanceof Error ? error.message : 'Failed to create packing list';
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Create backorder from items with backorder_qty > 0
  const createBackorders = useCallback(async (
    approvedItems: ApprovedItemMap,
    originalOrders: OrderForPacking[],
    orderType: 'primary' | 'secondary'
  ) => {
    try {
      // Group backorder items by order
      const backordersByOrder = new Map<string, Array<{ product_id: string; product_name: string; quantity: number; unit?: string; price: number }>>();
      Object.values(approvedItems).forEach(item => {
        if (item.backorder_qty <= 0) return;
        if (!backordersByOrder.has(item.order_id)) {
          backordersByOrder.set(item.order_id, []);
        }
        backordersByOrder.get(item.order_id)!.push({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.backorder_qty,
          unit: item.unit,
          price: item.price,
        });
      });

      if (backordersByOrder.size === 0) return;

      for (const [originalOrderId, items] of backordersByOrder) {
        const originalOrder = originalOrders.find(o => o.id === originalOrderId);
        if (!originalOrder) continue;

        const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.price, 0);

        if (orderType === 'primary') {
          // Create backorder primary order
          const { data: backorder, error } = await (supabase as any)
            .from('primary_orders')
            .insert({
              source_distributor_id: originalOrder.retailer_id,
              order_date: new Date().toISOString().split('T')[0],
              total_amount: totalAmount,
              status: 'confirmed',
              parent_order_id: originalOrderId,
              is_backorder: true,
            })
            .select()
            .single();

          if (error || !backorder) {
            console.error('Failed to create primary backorder:', error);
            continue;
          }

          // Insert backorder items
          const boItems = items.map(i => ({
            primary_order_id: backorder.id,
            product_id: i.product_id,
            product_name: i.product_name,
            quantity: i.quantity,
            unit: i.unit,
            unit_price: i.price,
            total_price: i.quantity * i.price,
          }));
          await (supabase as any).from('primary_order_items').insert(boItems);
        } else {
          // Create backorder secondary order
          const { data: backorder, error } = await (supabase as any)
            .from('orders')
            .insert({
              retailer_id: originalOrder.retailer_id,
              retailer_name: originalOrder.retailer_name,
              order_date: new Date().toISOString().split('T')[0],
              total_amount: totalAmount,
              subtotal: totalAmount,
              status: 'confirmed',
              delivery_status: 'pending',
              parent_order_id: originalOrderId,
              is_backorder: true,
              order_source: 'manual',
              beat_id: originalOrder.beat_id,
              territory_id: originalOrder.territory_id,
            })
            .select()
            .single();

          if (error || !backorder) {
            console.error('Failed to create secondary backorder:', error);
            continue;
          }

          // Insert backorder items
          const boItems = items.map(i => ({
            order_id: backorder.id,
            product_id: i.product_id,
            product_name: i.product_name,
            quantity: i.quantity,
            unit: i.unit,
            rate: i.price,
            total: i.quantity * i.price,
            category: 'General',
          }));
          await (supabase as any).from('order_items').insert(boItems);
        }
      }
    } catch (error) {
      console.error('Error creating backorders:', error);
    }
  }, []);

  // Update packing list status
  // When marking as 'packed', auto-release shortfall (picked < allocated) on batch level
  const updatePackingListStatus = useCallback(async (
    packingListId: string,
    newStatus: 'draft' | 'picking' | 'packed' | 'ready' | 'dispatched' | 'delivered' | 'completed' | 'cancelled'
  ) => {
    setLoading(true);
    try {
      // For dispatch, the atomic RPC handles everything including status update
      if (newStatus === 'dispatched') {
        // handled below — skip the generic status update
      } else {
        const orderedStatuses: PackingList['status'][] = ['draft', 'picking', 'packed', 'ready', 'dispatched', 'delivered', 'completed'];
        const { data: currentRow, error: currentErr } = await supabase
          .from('packing_lists')
          .select('status')
          .eq('id', packingListId)
          .single();

        if (currentErr) throw currentErr;

        const currentStatus = currentRow.status as PackingList['status'];
        const currentIdx = orderedStatuses.indexOf(currentStatus);
        const nextIdx = orderedStatuses.indexOf(newStatus);

        if (currentIdx !== -1 && nextIdx !== -1 && nextIdx >= currentIdx) {
          await advancePackingListToStatus(packingListId, newStatus);
        } else {
          const { error, data } = await supabase
            .from('packing_lists')
            .update({
              status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq('id', packingListId)
            .select('id, status')
            .single();

          if (error) throw error;
          if (data.status !== newStatus) {
            throw new Error(`Packing list status did not persist. Expected ${newStatus}, found ${data.status}`);
          }
        }
      }

      // Dispatch batch stock deduction when status changes to dispatched
      if (newStatus === 'dispatched') {
        // The DB enforces strict status transitions (draft→picking→packed→ready→dispatched).
        // Auto-advance the packing list through any missing intermediate states so that
        // dispatching from an earlier state (e.g. draft) succeeds end-to-end.
        const { data: currentRow, error: currentErr } = await supabase
          .from('packing_lists')
          .select('status')
          .eq('id', packingListId)
          .maybeSingle();
        if (currentErr) throw currentErr;

        const currentStatus = (currentRow?.status as PackingList['status']) || 'draft';
        if (['draft', 'picking', 'packed'].includes(currentStatus)) {
          await advancePackingListToStatus(packingListId, 'ready');
        }

        // Use atomic dispatch RPC
        const { data: dispatchResult, error: dispatchError } = await supabase.rpc('dispatch_packing_list_atomic' as any, {
          p_packing_list_id: packingListId,
        });

        if (dispatchError) throw dispatchError;
        const dr = dispatchResult as any;
        if (!dr?.success) throw new Error(dr?.error || 'Dispatch failed');
        await ensurePackingListStatus(packingListId, 'dispatched');

        // The RPC already updated status and orders, so skip the generic status update below
        toast({
          title: "Success",
          description: `Dispatched ${dr.total_dispatched} units, released ${dr.total_released} shortfall, ${dr.total_backorder_added} added to backorder`
        });
        return true;
      }

      // Update related orders status
      let orderStatus = 'in_packing_list';
      if (newStatus === 'completed') orderStatus = 'delivered';

      await supabase
        .from('orders')
        .update({ delivery_status: orderStatus })
        .eq('packing_list_id', packingListId);

      toast({
        title: "Success",
        description: `Packing list status updated to ${newStatus}`
      });

      return true;
    } catch (error: any) {
      console.error('Error updating packing list status:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to update status",
        variant: "destructive"
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Update picked quantities
  const updatePickedQuantity = useCallback(async (
    itemId: string,
    pickedQty: number,
    shortQty: number
  ) => {
    try {
      const { error } = await supabase
        .from('packing_list_items')
        .update({
          picked_qty: pickedQty,
          short_qty: shortQty
        })
        .eq('id', itemId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating picked quantity:', error);
      return false;
    }
  }, []);

  // Assign agent/van to packing list
  const createAssignment = useCallback(async (
    packingListId: string,
    agentId: string,
    vanId: string | null,
    beatIds: string[],
    orderCount: number,
    totalLoadQty: number,
    totalLoadValue: number
  ) => {
    try {
      const { data, error } = await supabase
        .from('packing_list_assignments')
        .insert({
          packing_list_id: packingListId,
          agent_id: agentId,
          van_id: vanId,
          beat_ids: beatIds,
          order_count: orderCount,
          total_load_qty: totalLoadQty,
          total_load_value: totalLoadValue,
          status: 'assigned'
        })
        .select()
        .single();

      if (error) throw error;

      // CRITICAL FIX: Update all orders in this packing list with the assigned agent
      // This allows delivery agents to see their assigned orders via assigned_agent_id
      const { error: updateOrdersError } = await supabase
        .from('orders')
        .update({ 
          assigned_agent_id: agentId
        })
        .eq('packing_list_id', packingListId);

      if (updateOrdersError) {
        console.error('Error updating orders with agent:', updateOrdersError);
        // Don't fail the assignment, just log the error
      }

      toast({
        title: "Success",
        description: "Agent assigned successfully"
      });

      return data as PackingListAssignment;
    } catch (error) {
      console.error('Error creating assignment:', error);
      toast({
        title: "Error",
        description: "Failed to assign agent",
        variant: "destructive"
      });
      return null;
    }
  }, [toast]);

  // Delete packing list (only draft)
  const deletePackingList = useCallback(async (packingListId: string, distributorId: string | null) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('delete_packing_list_atomic' as any, {
        p_packing_list_id: packingListId,
      });

      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || 'Delete failed');

      toast({
        title: "Success",
        description: `Packing list deleted, ${result.total_released} units released`
      });

      return true;
    } catch (error) {
      console.error('Error deleting packing list:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete packing list",
        variant: "destructive"
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // ─── Stage-based execution helpers (Workflow refactor) ───────────────────

  // Mark a single batch as fully picked (picked_qty = allocated_qty)
  const markBatchPicked = useCallback(async (batchRowId: string, allocatedQty: number, packingListItemId: string) => {
    const { data, error } = await supabase.rpc('update_picking_atomic' as any, {
      p_batch_row_id: batchRowId,
      p_picked_qty: allocatedQty,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return { success: false };
    }
    const r = data as any;
    return { success: !!r?.success, totalPicked: r?.total_picked, shortQty: r?.short_qty };
  }, [toast]);

  // Persist packed_qty on a batch row
  const setBatchPackedQty = useCallback(async (batchRowId: string, packedQty: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('packing_list_item_batches' as any)
        .update({
          packed_qty: packedQty,
          packed_at: packedQty > 0 ? new Date().toISOString() : null,
          packed_by: packedQty > 0 ? user?.id || null : null,
        })
        .eq('id', batchRowId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      toast({ title: 'Pack failed', description: err?.message || 'Unable to update packed qty', variant: 'destructive' });
      return { success: false };
    }
  }, [toast]);

  // Confirm packing: validates every batch has packed_qty > 0 and ≤ picked_qty,
  // then advances the packing list status from picking → packed.
  const confirmPacking = useCallback(async (packingListId: string) => {
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from('packing_list_item_batches' as any)
        .select('id, picked_qty, packed_qty, packing_list_item_id')
        .in('packing_list_item_id', (
          await supabase.from('packing_list_items').select('id').eq('packing_list_id', packingListId)
        ).data?.map((r: any) => r.id) || []);
      if (error) throw error;
      const list = (rows || []) as any[];
      if (list.length === 0) throw new Error('No batches to pack');
      for (const b of list) {
        if ((b.packed_qty || 0) <= 0) throw new Error('All picked batches must have a packed quantity');
        if ((b.packed_qty || 0) > (b.picked_qty || 0)) throw new Error('Packed quantity cannot exceed picked');
      }
      await advancePackingListToStatus(packingListId, 'packed');
      await ensurePackingListStatus(packingListId, 'packed');
      toast({ title: 'Packing confirmed', description: 'Packing list moved to Packed state' });
      return { success: true };
    } catch (err: any) {
      toast({ title: 'Cannot confirm packing', description: err?.message || 'Validation failed', variant: 'destructive' });
      return { success: false };
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Generate an invoice from packed quantities and link via order_id (best-effort)
  const generateInvoiceFromPackingList = useCallback(async (packingListId: string) => {
    setLoading(true);
    try {
      const { data: pl, error: plErr } = await supabase.from('packing_lists').select('*').eq('id', packingListId).single();
      if (plErr) throw plErr;
      const { data: orderRows } = await supabase.from('orders').select('id').eq('packing_list_id', packingListId).limit(1);
      const orderId = orderRows?.[0]?.id || null;

      const invNumber = `INV-${Date.now()}`;
      const { data: { user } } = await supabase.auth.getUser();
      const { data: inv, error: invErr } = await (supabase as any)
        .from('invoices')
        .insert({
          invoice_number: invNumber,
          invoice_date: new Date().toISOString().split('T')[0],
          sub_total: pl.total_value,
          total_tax: 0,
          total_amount: pl.total_value,
          status: 'generated',
          order_id: orderId,
          created_by: user?.id || null,
        })
        .select()
        .single();
      if (invErr) throw invErr;

      // Populate invoice_items from packed batches
      const { data: items } = await supabase
        .from('packing_list_items')
        .select('id, product_name, unit, packing_list_item_batches(id, packed_qty, picked_qty)')
        .eq('packing_list_id', packingListId);
      const lines = (items || []).flatMap((it: any) =>
        (it.packing_list_item_batches || [])
          .filter((b: any) => (b.packed_qty || 0) > 0)
          .map((b: any) => ({
            invoice_id: inv.id,
            description: it.product_name,
            quantity: b.packed_qty,
            unit: it.unit,
            price_per_unit: 0,
            gst_rate: 0,
            taxable_amount: 0,
            cgst_amount: 0,
            sgst_amount: 0,
            total_amount: 0,
          }))
      );
      if (lines.length > 0) {
        await (supabase as any).from('invoice_items').insert(lines);
      }
      // Advance packing list status to 'ready' (dispatch ready) once invoice is generated
      await advancePackingListToStatus(packingListId, 'ready');
      toast({ title: 'Invoice generated', description: invNumber });
      return { success: true, invoice: inv };
    } catch (err: any) {
      toast({ title: 'Invoice failed', description: err?.message || 'Unable to generate invoice', variant: 'destructive' });
      return { success: false };
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Assign driver + create delivery run (Stage 3 in-screen action)
  const assignDriverAndCreateRun = useCallback(async (
    packingListId: string,
    payload: {
      agentId: string;
      vehicleNumber?: string;
      driverName?: string;
      transporterName?: string;
      deliveryMode?: string;
      notes?: string;
    }
  ) => {
    setLoading(true);
    try {
      // 1. Create assignment row (existing helper logic, inline)
      const { data: pl } = await supabase.from('packing_lists').select('total_value').eq('id', packingListId).single();
      const { data: items } = await supabase.from('packing_list_items').select('ordered_qty').eq('packing_list_id', packingListId);
      const totalQty = (items || []).reduce((s: number, i: any) => s + (i.ordered_qty || 0), 0);

      const { data: assign, error: aErr } = await supabase
        .from('packing_list_assignments')
        .insert({
          packing_list_id: packingListId,
          agent_id: payload.agentId,
          van_id: payload.vehicleNumber || null,
          beat_ids: [],
          order_count: 0,
          total_load_qty: totalQty,
          total_load_value: pl?.total_value || 0,
          status: 'assigned',
        })
        .select()
        .single();
      if (aErr) throw aErr;

      // 2. Create delivery run
      const runNumber = `DR-${Date.now()}`;
      const { data: run, error: rErr } = await (supabase as any)
        .from('delivery_runs')
        .insert({
          run_number: runNumber,
          agent_id: payload.agentId,
          vehicle_id: payload.vehicleNumber || null,
          vehicle_number: payload.vehicleNumber || null,
          driver_name: payload.driverName || null,
          transporter_name: payload.transporterName || null,
          delivery_mode: payload.deliveryMode || 'direct',
          status: 'assigned',
          dispatch_date: new Date().toISOString().split('T')[0],
          notes: payload.notes || null,
        })
        .select()
        .single();
      if (rErr) throw rErr;

      // 3. Link
      await (supabase as any).from('delivery_run_packing_lists').insert({
        delivery_run_id: run.id,
        packing_list_id: packingListId,
        sequence_order: 1,
      });

      // 4. Update orders with assigned agent
      await supabase.from('orders').update({ assigned_agent_id: payload.agentId }).eq('packing_list_id', packingListId);

      // 5. Ensure packing list status is at least 'ready' so dispatch can proceed
      await advancePackingListToStatus(packingListId, 'ready');

      toast({ title: 'Driver assigned', description: `Run ${runNumber} created` });
      return { success: true, assignment: assign, run };
    } catch (err: any) {
      toast({ title: 'Assignment failed', description: err?.message || 'Unable to assign driver', variant: 'destructive' });
      return { success: false };
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Update an existing driver/vehicle/route assignment for a packing list (pre-dispatch only).
  const updateDriverAssignment = useCallback(async (
    packingListId: string,
    payload: {
      agentId: string;
      vehicleNumber?: string;
      driverName?: string;
      transporterName?: string;
      deliveryMode?: string;
      notes?: string;
    }
  ) => {
    setLoading(true);
    try {
      // 1. Update assignment row
      const { data: existingAssign } = await supabase
        .from('packing_list_assignments')
        .select('id')
        .eq('packing_list_id', packingListId)
        .limit(1)
        .maybeSingle();

      let assignment: any = null;
      if (existingAssign?.id) {
        const { data, error } = await supabase
          .from('packing_list_assignments')
          .update({
            agent_id: payload.agentId,
            van_id: payload.vehicleNumber || null,
          })
          .eq('id', existingAssign.id)
          .select()
          .single();
        if (error) throw error;
        assignment = data;
      }

      // 2. Update linked delivery run (if any)
      const { data: link } = await (supabase as any)
        .from('delivery_run_packing_lists')
        .select('delivery_run_id')
        .eq('packing_list_id', packingListId)
        .limit(1)
        .maybeSingle();

      let run: any = null;
      if (link?.delivery_run_id) {
        const { data, error } = await (supabase as any)
          .from('delivery_runs')
          .update({
            agent_id: payload.agentId,
            vehicle_id: payload.vehicleNumber || null,
            vehicle_number: payload.vehicleNumber || null,
            driver_name: payload.driverName || null,
            transporter_name: payload.transporterName || null,
            delivery_mode: payload.deliveryMode || 'direct',
            notes: payload.notes || null,
          })
          .eq('id', link.delivery_run_id)
          .select()
          .single();
        if (error) throw error;
        run = data;
      }

      // 3. Update orders with new agent
      await supabase.from('orders').update({ assigned_agent_id: payload.agentId }).eq('packing_list_id', packingListId);

      // 4. Self-heal: ensure PL status is at least 'ready' so dispatch can proceed
      await advancePackingListToStatus(packingListId, 'ready');

      toast({ title: 'Assignment updated', description: 'Driver, vehicle and route updated' });
      return { success: true, assignment, run };
    } catch (err: any) {
      toast({ title: 'Update failed', description: err?.message || 'Unable to update assignment', variant: 'destructive' });
      return { success: false };
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Cancel packing list: releases all reservations, resets orders, sets status to cancelled
  const cancelPackingList = useCallback(async (packingListId: string) => {
    setLoading(true);
    try {
      const result = await cancelPackingListReservations(packingListId);

      if (!result.success) {
        toast({ title: 'Error', description: result.error || 'Failed to cancel packing list', variant: 'destructive' });
        return false;
      }

      // RPC already handles primary_orders reset — no duplicate needed

      toast({
        title: 'Packing List Cancelled',
        description: `Released ${result.total_released || 0} units back to inventory`,
      });

      return true;
    } catch (error) {
      console.error('Error cancelling packing list:', error);
      toast({ title: 'Error', description: 'Failed to cancel packing list', variant: 'destructive' });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return {
    loading,
    fetchPackingLists,
    fetchPackingListDetail,
    fetchOrdersForPacking,
    fetchPrimaryOrdersForPacking,
    createPackingList,
    updatePackingListStatus,
    updatePickedQuantity,
    updateBatchPickedQty,
    createAssignment,
    deletePackingList,
    cancelPackingList,
    // stage helpers
    markBatchPicked,
    setBatchPackedQty,
    confirmPacking,
    generateInvoiceFromPackingList,
    assignDriverAndCreateRun,
    updateDriverAssignment,
  };
}
