import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ActivityType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_sales_activity: boolean;
  productivity_weight: number;
  requires_check_in: boolean;
  default_duration_minutes: number | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  is_category: boolean;
  parent_id: string | null;
  photo_required: boolean;
  location_required: boolean;
  show_in_picker: boolean;
}

export function useActivityTypes() {
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('activity_types' as any)
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (!error && data) setTypes(data as unknown as ActivityType[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { types, loading, refresh: load };
}
