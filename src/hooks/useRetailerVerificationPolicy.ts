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

  // Verification requirements
  req_mobile: boolean;
  req_whatsapp: boolean;
  req_gps: boolean;
  req_shop_photo: boolean;
  req_owner_name: boolean;
  req_gst: boolean;
  req_first_visit: boolean;

  // Score engine
  pts_mobile: number;
  pts_whatsapp: number;
  pts_gps: number;
  pts_shop_photo: number;
  pts_address: number;
  pts_gst: number;
  pts_owner: number;
  pts_first_visit: number;
  pts_first_order: number;

  // Thresholds
  threshold_partial: number;
  threshold_verified: number;
  threshold_gold: number;

  // Duplicate detection
  dup_check_mobile: boolean;
  dup_check_gst: boolean;
  dup_check_name: boolean;
  dup_check_address: boolean;
  dup_check_gps: boolean;
  dup_action: "warn" | "require_approval" | "block";
  dup_risk_threshold: number;

  // Approval workflow
  approval_required: boolean;
  approval_level: "none" | "coordinator" | "manager" | "asm" | "multi";
  auto_approve_score: number;
  auto_reject_dup_risk: number;
  expire_pending_days: number;

  // Gamification
  gp_created: number;
  gp_mobile: number;
  gp_whatsapp: number;
  gp_gps: number;
  gp_photo: number;
  gp_first_visit: number;
  gp_first_order: number;
  gp_revoke_on_fraud: boolean;
}

const DEFAULT_POLICY: RetailerVerificationPolicy = {
  id: "",
  enabled: false,
  max_orders_unverified: 3,
  block_after_limit: false,
  grace_days: 0,
  require_verification_for_credit: false,
  auto_whatsapp_on_create: true,
  req_mobile: true,
  req_whatsapp: false,
  req_gps: true,
  req_shop_photo: false,
  req_owner_name: false,
  req_gst: false,
  req_first_visit: false,
  pts_mobile: 20,
  pts_whatsapp: 20,
  pts_gps: 10,
  pts_shop_photo: 10,
  pts_address: 10,
  pts_gst: 10,
  pts_owner: 5,
  pts_first_visit: 5,
  pts_first_order: 10,
  threshold_partial: 40,
  threshold_verified: 70,
  threshold_gold: 90,
  dup_check_mobile: true,
  dup_check_gst: true,
  dup_check_name: true,
  dup_check_address: false,
  dup_check_gps: true,
  dup_action: "require_approval",
  dup_risk_threshold: 70,
  approval_required: false,
  approval_level: "manager",
  auto_approve_score: 90,
  auto_reject_dup_risk: 90,
  expire_pending_days: 30,
  gp_created: 10,
  gp_mobile: 20,
  gp_whatsapp: 20,
  gp_gps: 10,
  gp_photo: 10,
  gp_first_visit: 10,
  gp_first_order: 20,
  gp_revoke_on_fraud: true,
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
    if (data) setPolicy({ ...DEFAULT_POLICY, ...(data as any) });
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
        .update({ ...patch, updated_by: uid, updated_at: new Date().toISOString() } as any)
        .eq("id", policy.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("retailer_verification_policy")
        .insert({ ...DEFAULT_POLICY, ...patch, id: undefined, company_id: null, updated_by: uid } as any);
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
