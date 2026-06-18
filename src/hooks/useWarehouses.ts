import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatAddress } from '@/lib/addressFormat';

export interface Warehouse {
  id: string;
  name: string;
  code: string | null;
  is_default: boolean;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  landmark: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  latitude: number | null;
  longitude: number | null;
  formatted_address: string | null;
}

export type WarehouseInput = {
  name: string;
  code: string | null;
  is_default: boolean;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  landmark?: string | null;
  contact_person?: string | null;
  contact_phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

const SELECT_COLS = 'id, name, code, is_default, address_line1, address_line2, city, state, pincode, country, landmark, contact_person, contact_phone, latitude, longitude, formatted_address';

export const useWarehouses = (distributorId: string | null) => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [defaultWarehouse, setDefaultWarehouse] = useState<Warehouse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!distributorId) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .select(SELECT_COLS)
        .eq('distributor_id', distributorId)
        .order('is_default', { ascending: false });
      if (error) throw error;
      const list = (data || []) as unknown as Warehouse[];
      setWarehouses(list);
      setDefaultWarehouse(list.find(w => w.is_default) || list[0] || null);
    } catch (err) {
      console.error('Error loading warehouses:', err);
    } finally {
      setLoading(false);
    }
  }, [distributorId]);

  useEffect(() => { load(); }, [load]);

  const buildPayload = (input: WarehouseInput) => ({
    name: input.name,
    code: input.code || null,
    is_default: input.is_default,
    address_line1: input.address_line1 || null,
    address_line2: input.address_line2 || null,
    city: input.city || null,
    state: input.state || null,
    pincode: input.pincode || null,
    country: input.country || 'India',
    landmark: input.landmark || null,
    contact_person: input.contact_person || null,
    contact_phone: input.contact_phone || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    formatted_address: formatAddress(input) || null,
  });

  const createWarehouse = async (input: WarehouseInput) => {
    if (!distributorId) throw new Error('No distributor ID');
    if (input.is_default) {
      await supabase
        .from('warehouses')
        .update({ is_default: false })
        .eq('distributor_id', distributorId)
        .eq('is_default', true);
    }
    const { error } = await supabase.from('warehouses').insert({
      distributor_id: distributorId,
      ...buildPayload(input),
    } as any);
    if (error) throw error;
    await load();
  };

  const updateWarehouse = async (id: string, input: WarehouseInput) => {
    if (!distributorId) throw new Error('No distributor ID');
    if (input.is_default) {
      await supabase
        .from('warehouses')
        .update({ is_default: false })
        .eq('distributor_id', distributorId)
        .eq('is_default', true);
    }
    const { error } = await supabase
      .from('warehouses')
      .update(buildPayload(input) as any)
      .eq('id', id);
    if (error) throw error;
    await load();
  };

  const deleteWarehouse = async (id: string) => {
    if (!distributorId) throw new Error('No distributor ID');
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
