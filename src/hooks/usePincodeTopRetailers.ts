import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TopRetailer {
  id?: string;
  pincode: string;
  rank: number;
  place_id: string | null;
  name: string;
  address: string | null;
  rating: number | null;
  user_ratings_total: number | null;
  latitude: number | null;
  longitude: number | null;
  score: number | null;
  source: string;
  fetched_at?: string;
  opening_hours: {
    open_now?: boolean;
    weekday_text?: string[];
    periods?: any[];
  } | null;
  open_now: boolean | null;
}

interface Response {
  ok?: boolean;
  retailers: TopRetailer[];
  cached?: boolean;
  fetched_at?: string;
  error?: string;
}

export function usePincodeTopRetailers(pincode: string | undefined) {
  return useQuery({
    queryKey: ['pincode-top-retailers', pincode],
    enabled: !!pincode && /^\d{6}$/.test(pincode),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<Response> => {
      const { data, error } = await supabase.functions.invoke('get-pincode-top-retailers', {
        body: { pincode },
      });
      if (error) throw new Error(error.message || 'Failed to call edge function');
      if (data && data.ok === false) throw new Error(data.error || 'Failed to load retailers');
      return data as Response;
    },
  });
}
