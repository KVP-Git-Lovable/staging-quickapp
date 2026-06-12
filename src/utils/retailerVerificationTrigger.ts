import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget WhatsApp verification trigger after a retailer is created.
 * Respects the retailer_verification_policy.auto_whatsapp_on_create flag.
 * Defaults to TRUE if policy lookup fails (safe default: send the message).
 * Silent on any failure — never blocks the create flow.
 */
export async function maybeTriggerWhatsAppVerification(
  retailerId: string,
  phone: string | null | undefined
): Promise<void> {
  if (!retailerId || !phone) return;
  
  let shouldSendWhatsApp = true; // Safe default: send verification message
  
  try {
    const { data: policy, error: policyError } = await supabase
      .from("retailer_verification_policy")
      .select("auto_whatsapp_on_create")
      .is("company_id", null)
      .limit(1)
      .maybeSingle();
    
    if (policyError) {
      console.info("[verification] Policy lookup error (will proceed with default=true):", policyError);
    } else if (policy?.auto_whatsapp_on_create === false) {
      console.info("[verification] Policy explicitly disabled auto_whatsapp_on_create");
      shouldSendWhatsApp = false;
    } else {
      console.info("[verification] Policy found: auto_whatsapp_on_create =", policy?.auto_whatsapp_on_create);
    }
  } catch (e) {
    console.info("[verification] Policy check failed (will proceed with default=true):", e);
    // Keep shouldSendWhatsApp = true to avoid silent failures
  }
  
  if (!shouldSendWhatsApp) {
    console.info("[verification] Skipped WhatsApp - policy disabled");
    return;
  }

  // Fire-and-forget; do not await result to keep create flow snappy
  console.info("[verification] Invoking send-retailer-verification-whatsapp for retailer", retailerId);
  supabase.functions
    .invoke("send-retailer-verification-whatsapp", { body: { retailer_id: retailerId } })
    .then(() => {
      console.info("[verification] WhatsApp verification message queued for", retailerId);
    })
    .catch((e) => {
      console.warn("[verification] WhatsApp invoke failed:", e);
    });
}
