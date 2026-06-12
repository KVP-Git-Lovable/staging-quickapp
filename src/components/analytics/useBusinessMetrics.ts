import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface BusinessSummary {
  totalBeats: number;
  totalRetailers: number;
  totalOrders: number;
  totalKg: number;
  totalPieces: number;
  totalRevenue: number;
  pendingPayments: number;
  quantityByUnit: { [unit: string]: number }; // Track quantities by actual unit
}

interface BeatDetail {
  beat_name: string;
  visits_count: number;
  orders_count: number;
  revenue: number;
}

interface RetailerDetail {
  id: string;
  name: string;
  beat_name: string;
  orders_count: number;
  revenue: number;
  pending_amount: number;
}

interface OrderDetail {
  id: string;
  order_date: string;
  retailer_name: string;
  total_amount: number;
  status: string;
}

interface ProductDetail {
  product_name: string;
  unit: string;
  quantity: number;
  revenue: number;
}

interface PendingPaymentDetail {
  retailer_name: string;
  order_date: string;
  order_id: string;
  pending_amount: number;
  user_id?: string;
  user_name?: string;
}

const getKgQuantity = (quantity: unknown, unit: unknown) => {
  const qty = Number(quantity || 0);
  const unitLower = String(unit || '').trim().toLowerCase();

  if (unitLower === 'kg' || unitLower.includes('kilo')) return qty;
  if (unitLower === 'grams' || unitLower === 'gram' || unitLower === 'g') return qty / 1000;
  return 0;
};

const getDisplayQuantity = (quantity: unknown, unit: unknown) => {
  const qty = Number(quantity || 0);
  const rawUnit = String(unit || '').trim();
  const unitLower = rawUnit.toLowerCase();

  if (unitLower === 'kg' || unitLower.includes('kilo')) return { quantity: qty, unit: 'KG' };
  if (unitLower === 'grams' || unitLower === 'gram' || unitLower === 'g') return { quantity: qty / 1000, unit: 'KG' };
  return { quantity: qty, unit: rawUnit || 'Unit' };
};

export const useBusinessMetrics = () => {
  const [summary, setSummary] = useState<BusinessSummary>({
    totalBeats: 0,
    totalRetailers: 0,
    totalOrders: 0,
    totalKg: 0,
    totalPieces: 0,
    totalRevenue: 0,
    pendingPayments: 0,
    quantityByUnit: {}
  });
  const [isLoading, setIsLoading] = useState(false);
  
  // Ref to prevent duplicate fetches
  const lastFetchKeyRef = useRef<string>('');
  const isFetchingRef = useRef(false);

  // Detail data states
  const [beatDetails, setBeatDetails] = useState<BeatDetail[]>([]);
  const [retailerDetails, setRetailerDetails] = useState<RetailerDetail[]>([]);
  const [orderDetails, setOrderDetails] = useState<OrderDetail[]>([]);
  const [productDetails, setProductDetails] = useState<ProductDetail[]>([]);
  const [pendingPaymentDetails, setPendingPaymentDetails] = useState<PendingPaymentDetail[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const fetchSummary = useCallback(async (userIds: string[], dateRange: { from: Date; to: Date }, userNames?: string[]) => {
    // Create a fetch key to prevent duplicate requests
    const fetchKey = `${userIds.slice().sort().join(',')}-${dateRange.from.getTime()}-${dateRange.to.getTime()}`;
    
    // Skip if already fetching with the same parameters
    if (isFetchingRef.current && fetchKey === lastFetchKeyRef.current) {
      return;
    }
    
    // Skip if this exact fetch was already completed
    if (fetchKey === lastFetchKeyRef.current && !isLoading) {
      return;
    }
    
    lastFetchKeyRef.current = fetchKey;
    isFetchingRef.current = true;
    setIsLoading(true);
    
    try {
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');

      // Fetch confirmed orders with items - paginated to avoid 1000-row default limit
      const BATCH_SIZE = 1000;
      let allOrders: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        let ordersQuery = supabase
          .from('orders')
          .select(`
            id,
            total_amount,
            credit_pending_amount,
            retailer_id,
            user_id,
            order_items(quantity, unit)
          `)
          .eq('status', 'confirmed')
          .gte('order_date', fromDate)
          .lte('order_date', toDate)
          .range(offset, offset + BATCH_SIZE - 1);

        if (userIds.length > 0) {
          ordersQuery = ordersQuery.in('user_id', userIds);
        }

        const { data: batch, error: ordersError } = await ordersQuery;
        if (ordersError) throw ordersError;

        if (batch && batch.length > 0) {
          allOrders = allOrders.concat(batch);
          offset += BATCH_SIZE;
          hasMore = batch.length === BATCH_SIZE;
        } else {
          hasMore = false;
        }
      }

      const orders = allOrders;

      // Fetch beats created by selected users within date range
      // Fetch beats and retailers in parallel
      const [beatsResult, retailersResult] = await Promise.all([
        (async () => {
          let beatsQuery = supabase
            .from('beats')
            .select('id, created_by')
            .gte('created_at', `${fromDate}T00:00:00`)
            .lte('created_at', `${toDate}T23:59:59`);
          if (userIds.length > 0) {
            beatsQuery = beatsQuery.in('created_by', userIds);
          }
          return beatsQuery;
        })(),
        (async () => {
          let retailersQuery = supabase
            .from('retailers')
            .select('id, user_id')
            .gte('created_at', `${fromDate}T00:00:00`)
            .lte('created_at', `${toDate}T23:59:59`);
          if (userIds.length > 0) {
            retailersQuery = retailersQuery.in('user_id', userIds);
          }
          return retailersQuery;
        })()
      ]);

      if (beatsResult.error) throw beatsResult.error;
      if (retailersResult.error) throw retailersResult.error;

      const beats = beatsResult.data;
      const retailers = retailersResult.data;

      const totalBeatsCount = beats?.length || 0;
      const totalRetailersCount = retailers?.length || 0;
      const totalOrders = orders?.length || 0;
      const totalRevenue = orders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;
      const pendingPayments = orders?.reduce((sum, o) => sum + Number(o.credit_pending_amount || 0), 0) || 0;
      
      // Calculate total KG and Revenue directly from order_items so analytics matches DB units.
      let totalKg = 0;
      let totalPieces = 0;
      const quantityByUnit: { [unit: string]: number } = {};

      orders?.forEach(order => {
        (order.order_items as any[])?.forEach((item: any) => {
          const unit = (item.unit || 'Unknown').trim();
          const qty = Number(item.quantity || 0);
          quantityByUnit[unit] = (quantityByUnit[unit] || 0) + qty;
          totalKg += getKgQuantity(qty, unit);
        });
      });
      totalPieces = Math.round(totalKg * 100) / 100;

      setSummary({
        totalBeats: totalBeatsCount,
        totalRetailers: totalRetailersCount,
        totalOrders,
        totalKg,
        totalPieces,
        totalRevenue,
        pendingPayments,
        quantityByUnit
      });
    } catch (error) {
      console.error('Error fetching business summary:', error);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  const fetchBeatDetails = useCallback(async (userIds: string[], dateRange: { from: Date; to: Date }) => {
    setDetailsLoading(true);
    try {
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');

      // Get orders with retailer and order beat data - paginated
      const BATCH_SIZE = 1000;
      let allOrders: any[] = [];
      let ordersOffset = 0;
      let ordersHasMore = true;
      while (ordersHasMore) {
        let ordersQuery = supabase
          .from('orders')
          .select('id, total_amount, user_id, order_date, retailer_id, beat_id, beat_name_snapshot, retailers(id, name, beat_name, beat_id)')
          .eq('status', 'confirmed')
          .gte('order_date', fromDate)
          .lte('order_date', toDate)
          .range(ordersOffset, ordersOffset + BATCH_SIZE - 1);
        if (userIds.length > 0) {
          ordersQuery = ordersQuery.in('user_id', userIds);
        }
        const { data: batch } = await ordersQuery;
        if (batch && batch.length > 0) {
          allOrders = allOrders.concat(batch);
          ordersOffset += BATCH_SIZE;
          ordersHasMore = batch.length === BATCH_SIZE;
        } else {
          ordersHasMore = false;
        }
      }
      const orders = allOrders;

      // Get visits for the date range to count visits per beat
      let visitsQuery = supabase
        .from('visits')
        .select('id, user_id, planned_date, retailer_id, retailers!inner(id, name, beat_name)')
        .gte('planned_date', fromDate)
        .lte('planned_date', toDate);

      if (userIds.length > 0) {
        visitsQuery = visitsQuery.in('user_id', userIds);
      }

      const { data: visits } = await visitsQuery;

      const orderBeatIds = [...new Set((orders || []).map((order: any) => order.beat_id).filter(Boolean))];
      const { data: orderBeats } = orderBeatIds.length > 0
        ? await supabase.from('beats').select('beat_id, beat_name').in('beat_id', orderBeatIds)
        : { data: [] as any[] };
      const orderBeatNameMap = new Map((orderBeats || []).map((beat: any) => [beat.beat_id, beat.beat_name]));

      // Group by beat using order snapshot first, then order beat_id/current retailer references.
      const beatMap = new Map<string, BeatDetail>();

      // Process visits to count visits per beat
      visits?.forEach(visit => {
        const beatName = (visit.retailers as any)?.beat_name || 'Unknown';
        if (!beatMap.has(beatName)) {
          beatMap.set(beatName, {
            beat_name: beatName,
            visits_count: 0,
            orders_count: 0,
            revenue: 0
          });
        }
        const beat = beatMap.get(beatName)!;
        beat.visits_count += 1;
      });

      // Process orders to count orders and revenue per beat
      orders?.forEach(order => {
        const beatName = order.beat_name_snapshot || orderBeatNameMap.get(order.beat_id) || (order.retailers as any)?.beat_name || 'Unassigned';
        if (!beatMap.has(beatName)) {
          beatMap.set(beatName, {
            beat_name: beatName,
            visits_count: 0,
            orders_count: 0,
            revenue: 0
          });
        }
        const beat = beatMap.get(beatName)!;
        beat.orders_count += 1;
        beat.revenue += Number(order.total_amount || 0);
      });

      setBeatDetails(Array.from(beatMap.values()).sort((a, b) => b.revenue - a.revenue));
    } catch (error) {
      console.error('Error fetching beat details:', error);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  const fetchRetailerDetails = useCallback(async (userIds: string[], dateRange: { from: Date; to: Date }) => {
    setDetailsLoading(true);
    try {
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');

      const BATCH_SIZE = 1000;
      let allOrders: any[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        let ordersQuery = supabase
          .from('orders')
          .select(`
            id,
            retailer_id,
            total_amount,
            credit_pending_amount,
            beat_name_snapshot,
            retailers(id, name, beat_name)
          `)
          .eq('status', 'confirmed')
          .gte('order_date', fromDate)
          .lte('order_date', toDate)
          .range(offset, offset + BATCH_SIZE - 1);
        if (userIds.length > 0) {
          ordersQuery = ordersQuery.in('user_id', userIds);
        }
        const { data: batch } = await ordersQuery;
        if (batch && batch.length > 0) {
          allOrders = allOrders.concat(batch);
          offset += BATCH_SIZE;
          hasMore = batch.length === BATCH_SIZE;
        } else {
          hasMore = false;
        }
      }
      const orders = allOrders;

      // Group by retailer
      const retailerMap = new Map<string, RetailerDetail>();
      
      orders?.forEach(order => {
        const retailer = order.retailers as any;
        if (!retailer?.id) return;
        
        if (!retailerMap.has(retailer.id)) {
          retailerMap.set(retailer.id, {
            id: retailer.id,
            name: retailer.name || 'Unknown',
            beat_name: order.beat_name_snapshot || retailer.beat_name || '-',
            orders_count: 0,
            revenue: 0,
            pending_amount: 0
          });
        }
        const r = retailerMap.get(retailer.id)!;
        r.orders_count++;
        r.revenue += Number(order.total_amount || 0);
        r.pending_amount += Number(order.credit_pending_amount || 0);
      });

      setRetailerDetails(Array.from(retailerMap.values()).sort((a, b) => b.revenue - a.revenue));
    } catch (error) {
      console.error('Error fetching retailer details:', error);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  const fetchOrderDetails = useCallback(async (userIds: string[], dateRange: { from: Date; to: Date }) => {
    setDetailsLoading(true);
    try {
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');

      const BATCH_SIZE = 1000;
      let allOrders: any[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        let query = supabase
          .from('orders')
          .select(`
            id,
            order_date,
            total_amount,
            status,
            user_id,
            retailers(name)
          `)
          .gte('order_date', fromDate)
          .lte('order_date', toDate)
          .order('order_date', { ascending: false })
          .range(offset, offset + BATCH_SIZE - 1);
        if (userIds.length > 0) {
          query = query.in('user_id', userIds);
        }
        const { data: batch } = await query;
        if (batch && batch.length > 0) {
          allOrders = allOrders.concat(batch);
          offset += BATCH_SIZE;
          hasMore = batch.length === BATCH_SIZE;
        } else {
          hasMore = false;
        }
      }
      const data = allOrders;

      // Fetch user names for all unique user_ids
      const uniqueUserIds = [...new Set((data || []).map(o => o.user_id).filter(Boolean))];
      let userNameMap = new Map<string, string>();
      if (uniqueUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', uniqueUserIds);
        profiles?.forEach(p => userNameMap.set(p.id, p.full_name || 'Unknown'));
      }

      setOrderDetails(
        (data || []).map(order => ({
          id: order.id,
          order_date: order.order_date,
          retailer_name: (order.retailers as any)?.name || 'Unknown',
          total_amount: Number(order.total_amount || 0),
          status: order.status || 'pending',
          user_id: order.user_id || '',
          user_name: userNameMap.get(order.user_id) || 'Unknown'
        }))
      );
    } catch (error) {
      console.error('Error fetching order details:', error);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  const fetchProductDetails = useCallback(async (userIds: string[], dateRange: { from: Date; to: Date }) => {
    setDetailsLoading(true);
    try {
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');

      let ordersQuery = supabase
        .from('orders')
        .select('id, user_id')
        .gte('order_date', fromDate)
        .lte('order_date', toDate);

      if (userIds.length > 0) {
        ordersQuery = ordersQuery.in('user_id', userIds);
      }

      const { data: orders } = await ordersQuery;
      const orderIds = orders?.map(o => o.id) || [];

      if (orderIds.length === 0) {
        setProductDetails([]);
        setDetailsLoading(false);
        return;
      }

      const { data: items } = await supabase
        .from('order_items')
        .select('product_name, unit, quantity, total')
        .in('order_id', orderIds);

      // Group by product and display weight quantities as KG, not PC/ML.
      const productMap = new Map<string, ProductDetail>();
      
      items?.forEach(item => {
        const displayQty = getDisplayQuantity(item.quantity, item.unit);
        const key = `${item.product_name}-${displayQty.unit}`;
        if (!productMap.has(key)) {
          productMap.set(key, {
            product_name: item.product_name || 'Unknown',
            unit: displayQty.unit,
            quantity: 0,
            revenue: 0
          });
        }
        const p = productMap.get(key)!;
        p.quantity += displayQty.quantity;
        p.revenue += Number(item.total || 0);
      });

      setProductDetails(Array.from(productMap.values()).sort((a, b) => b.quantity - a.quantity));
    } catch (error) {
      console.error('Error fetching product details:', error);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  const fetchPendingPaymentDetails = useCallback(async (userIds: string[], dateRange: { from: Date; to: Date }) => {
    setDetailsLoading(true);
    try {
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');

      let query = supabase
        .from('orders')
        .select(`
          id,
          order_date,
          credit_pending_amount,
          user_id,
          retailers(name)
        `)
        .gte('order_date', fromDate)
        .lte('order_date', toDate)
        .gt('credit_pending_amount', 0)
        .order('credit_pending_amount', { ascending: false });

      if (userIds.length > 0) {
        query = query.in('user_id', userIds);
      }

      const { data } = await query;

      // Fetch profile names separately since there's no FK from orders.user_id to profiles
      const orderUserIds = [...new Set((data || []).map(o => o.user_id).filter(Boolean))];
      let profilesMap: Record<string, string> = {};
      
      if (orderUserIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', orderUserIds);
        
        profilesMap = (profilesData || []).reduce((acc, p) => {
          acc[p.id] = p.full_name || 'Unknown User';
          return acc;
        }, {} as Record<string, string>);
      }

      setPendingPaymentDetails(
        (data || []).map(order => ({
          retailer_name: (order.retailers as any)?.name || 'Unknown',
          order_date: order.order_date,
          order_id: order.id,
          pending_amount: Number(order.credit_pending_amount || 0),
          user_id: order.user_id || '',
          user_name: profilesMap[order.user_id || ''] || 'Unknown User'
        }))
      );
    } catch (error) {
      console.error('Error fetching pending payment details:', error);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  return {
    summary,
    isLoading,
    fetchSummary,
    beatDetails,
    retailerDetails,
    orderDetails,
    productDetails,
    pendingPaymentDetails,
    detailsLoading,
    fetchBeatDetails,
    fetchRetailerDetails,
    fetchOrderDetails,
    fetchProductDetails,
    fetchPendingPaymentDetails
  };
};
