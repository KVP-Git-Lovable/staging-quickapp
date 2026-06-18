import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatAddress } from '@/lib/addressFormat';

export interface SavedAddress {
  id: string;
  distributor_id: string;
  label: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string | null;
  pincode: string;
  country: string;
  landmark: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  latitude: number | null;
  longitude: number | null;
  formatted_address: string | null;
  is_default: boolean;
}

export type SavedAddressInput = Omit<SavedAddress, 'id' | 'distributor_id' | 'formatted_address'> & {
  formatted_address?: string | null;
};

export const useSavedAddresses = (distributorId: string | null) => {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!distributorId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('distributor_saved_addresses' as any)
        .select('*')
        .eq('distributor_id', distributorId)
        .order('is_default', { ascending: false })
        .order('label', { ascending: true });
      if (error) throw error;
      setAddresses((data || []) as unknown as SavedAddress[]);
    } catch (err) {
      console.error('Error loading saved addresses:', err);
    } finally {
      setLoading(false);
    }
  }, [distributorId]);

  useEffect(() => { load(); }, [load]);

  const create = async (input: SavedAddressInput): Promise<SavedAddress> => {
    if (!distributorId) throw new Error('No distributor ID');
    if (input.is_default) {
      await supabase
        .from('distributor_saved_addresses' as any)
        .update({ is_default: false })
        .eq('distributor_id', distributorId)
        .eq('is_default', true);
    }
    const payload = {
      ...input,
      distributor_id: distributorId,
      formatted_address: input.formatted_address || formatAddress(input),
    };
    const { data, error } = await supabase
      .from('distributor_saved_addresses' as any)
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    await load();
    return data as unknown as SavedAddress;
  };

  const update = async (id: string, input: SavedAddressInput) => {
    if (!distributorId) throw new Error('No distributor ID');
    if (input.is_default) {
      await supabase
        .from('distributor_saved_addresses' as any)
        .update({ is_default: false })
        .eq('distributor_id', distributorId)
        .eq('is_default', true);
    }
    const payload = {
      ...input,
      formatted_address: input.formatted_address || formatAddress(input),
    };
    const { error } = await supabase
      .from('distributor_saved_addresses' as any)
      .update(payload)
      .eq('id', id);
    if (error) throw error;
    await load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase
      .from('distributor_saved_addresses' as any)
      .delete()
      .eq('id', id);
    if (error) throw error;
    await load();
  };

  return { addresses, loading, reload: load, create, update, remove };
};
