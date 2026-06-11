import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget WhatsApp welcome message to a newly-created retailer.
 * Gated by retailer_verification_policy.welcome_whatsapp_on_create.
 * Silent on any failure — never blocks the create flow.
 */
export async function sendRetailerWelcomeWhatsApp(
  retailerId: string,
  phone: string | null | undefined
): Promise<void> {
  if (!retailerId || !phone) return;
  try {
    const { data: policy } = await supabase
      .from("retailer_verification_policy")
      .select("welcome_whatsapp_on_create")
      .is("company_id", null)
      .limit(1)
      .maybeSingle();
    if (!policy?.welcome_whatsapp_on_create) return;

    supabase.functions
      .invoke("send-retailer-welcome-whatsapp", { body: { retailer_id: retailerId } })
      .catch((e) => console.warn("[welcome-wa] invoke failed:", e));
  } catch (e) {
    console.warn("[welcome-wa] trigger failed:", e);
  }
}
