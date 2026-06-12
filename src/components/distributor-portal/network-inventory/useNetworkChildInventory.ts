// READ-ONLY: do not add mutations here
import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type StockStatus = 'critical' | 'low' | 'healthy' | 'overstock' | 'neutral';

export interface NetworkInventoryRow {
  product_id: string | null;
  product_name: string;
  variant_name: string | null;
  unit: string | null;
  available: number;
  reserved: number;
  damaged: number;
  expired: number;
  reorder_level: number;
  in_transit: number;
  avg_daily_sales: number;
  days_of_stock: number | null; // null = infinite (no movement)
  status: StockStatus;
  last_movement_at: string | null;
  expiring_soon: boolean;
  earliest_expiry: string | null;
  batches: Array<{
    id: string;
    batch_number: string | null;
    expiry_date: string | null;
    quantity: number;
    reserved_quantity: number;
  }>;
}

export interface MovementSummary {
  inward: number;
  outward: number;
  net: number;
  windowDays: number;
}

interface Filters {
  warehouseId: string | 'all';
  productSearch: string;
  status: StockStatus | 'all';
  movement: 'all' | 'active' | 'not_moving';
  windowDays: number; // for avg daily sales
}

const DEFAULT_FILTERS: Filters = {
  warehouseId: 'all',
  productSearch: '',
  status: 'all',
  movement: 'all',
  windowDays: 30,
};

const NEGATIVE_TYPES = new Set(['OUTWARD', 'DISPATCH']);
const POSITIVE_TYPES = new Set(['GRN', 'GRN_INWARD', 'OPENING_STOCK', 'inward']);

export function useNetworkChildInventory(childId: string) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [rawInventory, setRawInventory] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [inTransit, setInTransit] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updateFilters = useCallback((patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
  }, []);

  useEffect(() => {
    if (!childId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const since = new Date();
    since.setDate(since.getDate() - filters.windowDays);
    const sinceISO = since.toISOString();

    const invQuery = supabase
      .from('distributor_inventory')
      .select('id, product_id, product_name, variant_name, unit, quantity, reserved_quantity, damaged_quantity, expired_quantity, reorder_level, batch_number, expiry_date, warehouse_id')
      .eq('distributor_id', childId);

    if (filters.warehouseId !== 'all') {
      invQuery.eq('warehouse_id', filters.warehouseId);
    }

    const txQuery = supabase
      .from('distributor_inventory_transactions')
      .select('id, product_id, product_name, transaction_type, balance_qty, batch_number, expiry_date, created_at, warehouse_id, reference_id')
      .eq('distributor_id', childId)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(2000);

    if (filters.warehouseId !== 'all') {
      txQuery.eq('warehouse_id', filters.warehouseId);
    }

    const whQuery = supabase
      .from('warehouses')
      .select('id, name')
      .eq('distributor_id', childId)
      .order('name');

    const transitQuery = supabase
      .from('primary_orders')
      .select('id, status')
      .eq('target_distributor_id', childId)
      .in('status', ['submitted', 'confirmed', 'processing', 'dispatched']);

    Promise.all([invQuery, txQuery, whQuery, transitQuery])
      .then(async ([invRes, txRes, whRes, transitRes]) => {
        if (cancelled) return;
        if (invRes.error) throw invRes.error;
        if (txRes.error) throw txRes.error;
        if (whRes.error) throw whRes.error;

        setRawInventory(invRes.data || []);
        setTransactions(txRes.data || []);
        setWarehouses(whRes.data || []);

        // Fetch in-transit items
        const transitOrderIds = (transitRes.data || []).map((o: any) => o.id);
        if (transitOrderIds.length > 0) {
          const { data: items } = await supabase
            .from('primary_order_items')
            .select('product_id, product_name, quantity, received_quantity')
            .in('order_id', transitOrderIds);
          const map: Record<string, number> = {};
          (items || []).forEach((it: any) => {
            const key = it.product_id || it.product_name;
            if (!key) return;
            const pending = Math.max(0, (it.quantity || 0) - (it.received_quantity || 0));
            map[key] = (map[key] || 0) + pending;
          });
          if (!cancelled) setInTransit(map);
        } else if (!cancelled) {
          setInTransit({});
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load inventory');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [childId, filters.warehouseId, filters.windowDays]);

  // Aggregate inventory rows by product
  const rows = useMemo<NetworkInventoryRow[]>(() => {
    const map = new Map<string, NetworkInventoryRow>();
    const now = Date.now();
    const expiryThreshold = now + 30 * 24 * 60 * 60 * 1000;

    for (const inv of rawInventory) {
      const key = inv.product_id || `${inv.product_name}|${inv.variant_name || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          product_id: inv.product_id,
          product_name: inv.product_name,
          variant_name: inv.variant_name,
          unit: inv.unit,
          available: 0,
          reserved: 0,
          damaged: 0,
          expired: 0,
          reorder_level: inv.reorder_level || 0,
          in_transit: 0,
          avg_daily_sales: 0,
          days_of_stock: null,
          status: 'neutral',
          last_movement_at: null,
          expiring_soon: false,
          earliest_expiry: null,
          batches: [],
        });
      }
      const row = map.get(key)!;
      row.available += inv.quantity || 0;
      row.reserved += inv.reserved_quantity || 0;
      row.damaged += inv.damaged_quantity || 0;
      row.expired += inv.expired_quantity || 0;
      row.batches.push({
        id: inv.id,
        batch_number: inv.batch_number,
        expiry_date: inv.expiry_date,
        quantity: inv.quantity || 0,
        reserved_quantity: inv.reserved_quantity || 0,
      });
      if (inv.expiry_date) {
        const t = new Date(inv.expiry_date).getTime();
        if (!row.earliest_expiry || t < new Date(row.earliest_expiry).getTime()) {
          row.earliest_expiry = inv.expiry_date;
        }
        if (t <= expiryThreshold && (inv.quantity || 0) > 0) {
          row.expiring_soon = true;
        }
      }
    }

    // Compute movement metrics from transactions
    const txByProduct = new Map<string, { outward: number; lastAt: string | null }>();
    for (const tx of transactions) {
      const key = tx.product_id || tx.product_name;
      if (!key) continue;
      if (!txByProduct.has(key)) txByProduct.set(key, { outward: 0, lastAt: null });
      const agg = txByProduct.get(key)!;
      if (NEGATIVE_TYPES.has(tx.transaction_type)) {
        agg.outward += Math.abs(tx.balance_qty || 0);
      }
      if (!agg.lastAt || new Date(tx.created_at) > new Date(agg.lastAt)) {
        agg.lastAt = tx.created_at;
      }
    }

    for (const row of map.values()) {
      const key = row.product_id || `${row.product_name}|${row.variant_name || ''}`;
      const txAgg = txByProduct.get(key) || txByProduct.get(row.product_name);
      if (txAgg) {
        row.avg_daily_sales = txAgg.outward / filters.windowDays;
        row.last_movement_at = txAgg.lastAt;
      }
      row.in_transit = inTransit[row.product_id || row.product_name] || 0;

      if (row.avg_daily_sales > 0) {
        row.days_of_stock = row.available / row.avg_daily_sales;
        if (row.days_of_stock < 3) row.status = 'critical';
        else if (row.days_of_stock < 7) row.status = 'low';
        else if (row.days_of_stock <= 30) row.status = 'healthy';
        else row.status = 'overstock';
      } else {
        row.days_of_stock = null;
        row.status = row.available > 0 ? 'overstock' : 'neutral';
      }
    }

    return Array.from(map.values()).sort((a, b) => a.product_name.localeCompare(b.product_name));
  }, [rawInventory, transactions, inTransit, filters.windowDays]);

  // Apply UI filters
  const filteredRows = useMemo(() => {
    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return rows.filter((r) => {
      if (filters.productSearch) {
        const q = filters.productSearch.toLowerCase();
        if (!r.product_name.toLowerCase().includes(q) && !(r.variant_name || '').toLowerCase().includes(q)) {
          return false;
        }
      }
      if (filters.status !== 'all' && r.status !== filters.status) return false;
      if (filters.movement === 'active') {
        if (!r.last_movement_at || new Date(r.last_movement_at).getTime() < fourteenDaysAgo) return false;
      } else if (filters.movement === 'not_moving') {
        if (r.last_movement_at && new Date(r.last_movement_at).getTime() >= fourteenDaysAgo) return false;
      }
      return true;
    });
  }, [rows, filters]);

  // Summary metrics
  const summary = useMemo(() => {
    let available = 0, reserved = 0, damaged = 0, expired = 0;
    let lowStock = 0, overstock = 0, expiringSoon = 0, inTransitTotal = 0;
    for (const r of rows) {
      available += r.available;
      reserved += r.reserved;
      damaged += r.damaged;
      expired += r.expired;
      inTransitTotal += r.in_transit;
      if (r.status === 'critical' || r.status === 'low') lowStock++;
      if (r.status === 'overstock') overstock++;
      if (r.expiring_soon) expiringSoon++;
    }
    return { available, reserved, damaged, expired, lowStock, overstock, expiringSoon, inTransit: inTransitTotal };
  }, [rows]);

  // Alert counts
  const alerts = useMemo(() => {
    const notMovingCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    let notMoving = 0;
    for (const r of rows) {
      if (r.available > 0 && (!r.last_movement_at || new Date(r.last_movement_at).getTime() < notMovingCutoff)) {
        notMoving++;
      }
    }
    return {
      lowStock: summary.lowStock,
      notMoving,
      expiringSoon: summary.expiringSoon,
      overstock: summary.overstock,
    };
  }, [rows, summary]);

  // 7-day movement summary
  const movementSummary = useMemo<MovementSummary>(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let inward = 0, outward = 0;
    for (const tx of transactions) {
      if (new Date(tx.created_at).getTime() < cutoff) continue;
      const qty = Math.abs(tx.balance_qty || 0);
      if (POSITIVE_TYPES.has(tx.transaction_type)) inward += qty;
      else if (NEGATIVE_TYPES.has(tx.transaction_type)) outward += qty;
    }
    return { inward, outward, net: inward - outward, windowDays: 7 };
  }, [transactions]);

  return {
    loading,
    error,
    filters,
    updateFilters,
    warehouses,
    rows: filteredRows,
    allRows: rows,
    summary,
    alerts,
    movementSummary,
    transactions,
  };
}
