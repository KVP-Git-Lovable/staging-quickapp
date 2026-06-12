import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Warehouse {
  id: string;
  name: string;
  code: string | null;
  is_default: boolean;
}

export const useWarehouses = (distributorId: string | null) => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [defaultWarehouse, setDefaultWarehouse] = useState<Warehouse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!distributorId) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .select('id, name, code, is_default')
        .eq('distributor_id', distributorId)
        .order('is_default', { ascending: false });
      if (error) throw error;
      const list = (data || []) as Warehouse[];
      setWarehouses(list);
      setDefaultWarehouse(list.find(w => w.is_default) || list[0] || null);
    } catch (err) {
      console.error('Error loading warehouses:', err);
    } finally {
      setLoading(false);
    }
  }, [distributorId]);

  useEffect(() => { load(); }, [load]);

  const createWarehouse = async (name: string, code: string | null, isDefault: boolean) => {
    if (!distributorId) throw new Error('No distributor ID');
    if (isDefault) {
      await supabase
        .from('warehouses')
        .update({ is_default: false })
        .eq('distributor_id', distributorId)
        .eq('is_default', true);
    }
    const { error } = await supabase.from('warehouses').insert({
      distributor_id: distributorId,
      name,
      code: code || null,
      is_default: isDefault,
    });
    if (error) throw error;
    await load();
  };

  const updateWarehouse = async (id: string, name: string, code: string | null, isDefault: boolean) => {
    if (!distributorId) throw new Error('No distributor ID');
    if (isDefault) {
      await supabase
        .from('warehouses')
        .update({ is_default: false })
        .eq('distributor_id', distributorId)
        .eq('is_default', true);
    }
    const { error } = await supabase
      .from('warehouses')
      .update({ name, code: code || null, is_default: isDefault })
      .eq('id', id);
    if (error) throw error;
    await load();
  };

  const deleteWarehouse = async (id: string) => {
    if (!distributorId) throw new Error('No distributor ID');
    // Check usage in inventory tables
    const [inv, batches, txn] = await Promise.all([
      supabase.from('distributor_inventory').select('id').eq('warehouse_id', id).limit(1),
      supabase.from('inventory_batches').select('id').eq('warehouse_id', id).limit(1),
      supabase.from('distributor_inventory_transactions').select('id').eq('warehouse_id', id).limit(1),
    ]);
    const hasUsage = (inv.data?.length || 0) > 0 || (batches.data?.length || 0) > 0 || (txn.data?.length || 0) > 0;
    if (hasUsage) {
      throw new Error('Cannot delete warehouse with existing inventory.');
    }
    const { error } = await supabase.from('warehouses').delete().eq('id', id);
    if (error) throw error;
    await load();
  };

  return { warehouses, defaultWarehouse, loading, reload: load, createWarehouse, updateWarehouse, deleteWarehouse };
};
