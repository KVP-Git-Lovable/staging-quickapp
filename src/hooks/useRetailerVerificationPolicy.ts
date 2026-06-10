import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RetailerVerificationPolicy {
  id: string;
  enabled: boolean;
  max_orders_unverified: number;
  block_after_limit: boolean;
  grace_days: number;
  require_verification_for_credit: boolean;
  auto_whatsapp_on_create: boolean;
}

const DEFAULT_POLICY: RetailerVerificationPolicy = {
  id: "",
  enabled: false,
  max_orders_unverified: 3,
  block_after_limit: false,
  grace_days: 0,
  require_verification_for_credit: false,
  auto_whatsapp_on_create: true,
};

export function useRetailerVerificationPolicy() {
  const [policy, setPolicy] = useState<RetailerVerificationPolicy>(DEFAULT_POLICY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("retailer_verification_policy")
      .select("*")
      .is("company_id", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) setPolicy(data as RetailerVerificationPolicy);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch: Partial<RetailerVerificationPolicy>) => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes?.user?.id ?? null;

    if (policy.id) {
      const { error } = await supabase
        .from("retailer_verification_policy")
        .update({ ...patch, updated_by: uid, updated_at: new Date().toISOString() })
        .eq("id", policy.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("retailer_verification_policy")
        .insert({ ...DEFAULT_POLICY, ...patch, id: undefined, company_id: null, updated_by: uid });
      if (error) throw error;
    }
    await load();
  };

  return { policy, loading, reload: load, save };
}

export async function canPlaceOrderForRetailer(retailerId: string): Promise<{
  allowed: boolean;
  verified?: boolean;
  used?: number;
  limit?: number;
  remaining?: number;
  reason?: string;
  warn?: boolean;
}> {
  const { data, error } = await supabase.rpc("can_place_order_for_retailer", {
    p_retailer_id: retailerId,
  });
  if (error) {
    console.error("can_place_order_for_retailer rpc error", error);
    return { allowed: true };
  }
  return (data as any) ?? { allowed: true };
}
