import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OrderEditPolicy {
  edit_enabled: boolean;
  edit_lock_price: boolean;
  edit_require_reason: boolean;
  entry_price_edit_enabled: boolean;
  entry_price_edit_direction: 'higher_only' | 'both';
  // Sub-toggle under edit_enabled: hides/shows the "Edit Order" entry point
  // specifically in the Visit Card, without affecting other edit surfaces
  // (e.g. the admin Operations table's own edit button).
  edit_visible_in_visit_card: boolean;
  loaded: boolean;
}

const DEFAULT: OrderEditPolicy = {
  edit_enabled: false,
  edit_lock_price: false,
  edit_require_reason: false,
  entry_price_edit_enabled: false,
  entry_price_edit_direction: 'both',
  edit_visible_in_visit_card: true,
  loaded: false,
};

/**
 * Reads the singleton operations_config (id=1) edit_* flags.
 * Values default to false until loaded — callers should treat `loaded=false`
 * as "policy unknown yet" if they need to distinguish.
 */
export function useOrderEditPolicy(): OrderEditPolicy {
  const [policy, setPolicy] = useState<OrderEditPolicy>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from('operations_config')
          .select('edit_enabled, edit_lock_price, edit_require_reason, entry_price_edit_enabled, entry_price_edit_direction, edit_visible_in_visit_card')
          .eq('id', 1)
          .maybeSingle();
        if (cancelled) return;
        setPolicy({
          edit_enabled: !!data?.edit_enabled,
          edit_lock_price: !!data?.edit_lock_price,
          edit_require_reason: !!data?.edit_require_reason,
          entry_price_edit_enabled: !!data?.entry_price_edit_enabled,
          entry_price_edit_direction: data?.entry_price_edit_direction === 'higher_only' ? 'higher_only' : 'both',
          edit_visible_in_visit_card: data?.edit_visible_in_visit_card !== false,
          loaded: true,
        });
      } catch {
        if (!cancelled) setPolicy({ ...DEFAULT, loaded: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return policy;
}
