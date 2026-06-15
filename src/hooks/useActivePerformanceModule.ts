import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PerformanceModuleType = 'gamification' | 'target_actual' | 'both' | 'none';

export const useActivePerformanceModule = () => {
  const { data: config, isLoading, error } = useQuery({
    queryKey: ['performance-module-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('performance_module_config')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching performance module config:', error);
        return null;
      }
      return data;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes - prevents repeated fetches
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Don't refetch on every focus
    refetchOnMount: false, // Use cached data if available
  });

  return {
    activeModule: (config?.active_module as PerformanceModuleType) || 'none',
    isGamificationActive: config?.active_module === 'gamification' || config?.active_module === 'both',
    isTargetActualActive: config?.active_module === 'target_actual' || config?.active_module === 'both',
    isLoading,
    error,
    config,
  };
};
