import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget WhatsApp verification trigger after a retailer is created.
 * Respects the retailer_verification_policy.auto_whatsapp_on_create flag.
 * Silent on any failure — never blocks the create flow.
 */
export async function maybeTriggerWhatsAppVerification(
  retailerId: string,
  phone: string | null | undefined
): Promise<void> {
  if (!retailerId || !phone) return;
  try {
    const { data: policy } = await supabase
      .from("retailer_verification_policy")
      .select("auto_whatsapp_on_create")
      .is("company_id", null)
      .limit(1)
      .maybeSingle();
    if (!policy?.auto_whatsapp_on_create) return;

    // Fire-and-forget; do not await result to keep create flow snappy
    supabase.functions
      .invoke("send-retailer-verification-whatsapp", { body: { retailer_id: retailerId } })
      .catch((e) => console.warn("[verification] WhatsApp invoke failed:", e));
  } catch (e) {
    console.warn("[verification] policy check failed:", e);
  }
}
