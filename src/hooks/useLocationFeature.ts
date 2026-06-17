import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const FLAG_KEYS = [
  'location_check_in_enabled', // legacy master toggle
  'visit_location_capture_enabled',
  'visit_camera_capture_enabled',
] as const;

type Flags = {
  legacy: boolean;
  location: boolean;
  camera: boolean;
};

export const useLocationFeature = () => {
  const queryClient = useQueryClient();

  const { data, isLoading: loading } = useQuery<Flags>({
    queryKey: ['feature-flag', 'visit-check-in-flags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('feature_key, is_enabled')
        .in('feature_key', FLAG_KEYS as unknown as string[]);

      if (error) {
        console.error('Error loading visit check-in feature flags:', error);
        return { legacy: false, location: false, camera: false };
      }
      const map = new Map((data || []).map((r: any) => [r.feature_key, !!r.is_enabled]));
      return {
        legacy: map.get('location_check_in_enabled') ?? false,
        location: map.get('visit_location_capture_enabled') ?? false,
        camera: map.get('visit_camera_capture_enabled') ?? false,
      };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Subscribe to realtime changes for any of the 3 keys
  useEffect(() => {
    const channel = supabase
      .channel('visit-check-in-flag-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'feature_flags',
          filter: `feature_key=in.(${FLAG_KEYS.join(',')})`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['feature-flag', 'visit-check-in-flags'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // If admin hasn't migrated, fall back to legacy flag for both location & camera.
  const legacy = data?.legacy ?? false;
  const isLocationEnabled = data?.location ?? legacy;
  const isCameraEnabled = data?.camera ?? legacy;
  const isCheckInEnabled = isLocationEnabled || isCameraEnabled;

  return {
    isLocationEnabled,
    isCameraEnabled,
    isCheckInEnabled,
    loading,
  };
};
