import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProcessRequirement } from '@/hooks/useProcessRequirement';

/**
 * Returns whether check-in is mandatory before placing an order.
 *
 * Resolution:
 * 1. New Feature Management system flag `visit_check_in_mandatory` (per user/role/company).
 * 2. Falls back to legacy global flag `check_in_mandatory_for_order` when the new flag is missing.
 */
export const useCheckInMandatory = () => {
  // New unified flag (per-user/role/company aware)
  const { required, isLoading: newLoading } = useProcessRequirement('visit_check_in_mandatory');

  // Legacy global fallback
  const { data: legacy, isLoading: legacyLoading } = useQuery({
    queryKey: ['feature-flag', 'check_in_mandatory_for_order'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('is_enabled')
        .eq('feature_key', 'check_in_mandatory_for_order')
        .maybeSingle();
      if (error) {
        console.error('Error loading check-in mandatory settings:', error);
        return false;
      }
      return data?.is_enabled ?? false;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  return {
    isCheckInMandatory: required || (legacy ?? false),
    loading: newLoading || legacyLoading,
  };
};
