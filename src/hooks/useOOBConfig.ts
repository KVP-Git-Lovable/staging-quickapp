import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type OOBVisibility = 'beat' | 'assigned' | 'territory' | 'all';
export type OOBCreditRule = 'collector' | 'owner';

export interface OOBConfig {
  oob_enabled: boolean;
  oob_visibility: OOBVisibility;
  oob_require_reason: boolean;
  oob_require_gps: boolean;
  oob_credit_rule: OOBCreditRule;
  oob_notify_manager: boolean;
}

const DEFAULT: OOBConfig = {
  oob_enabled: false,
  oob_visibility: 'beat',
  oob_require_reason: true,
  oob_require_gps: true,
  oob_credit_rule: 'collector',
  oob_notify_manager: true,
};

export function useOOBConfig() {
  return useQuery({
    queryKey: ['operations_config', 'oob'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OOBConfig> => {
      const { data, error } = await supabase
        .from('operations_config')
        .select('oob_enabled, oob_visibility, oob_require_reason, oob_require_gps, oob_credit_rule, oob_notify_manager')
        .eq('id', 1)
        .maybeSingle();
      if (error || !data) return DEFAULT;
      return {
        oob_enabled: !!data.oob_enabled,
        oob_visibility: (data.oob_visibility as OOBVisibility) || 'beat',
        oob_require_reason: data.oob_require_reason !== false,
        oob_require_gps: data.oob_require_gps !== false,
        oob_credit_rule: (data.oob_credit_rule as OOBCreditRule) || 'collector',
        oob_notify_manager: data.oob_notify_manager !== false,
      };
    },
  });
}
