import { supabase } from "@/integrations/supabase/client";

/**
 * Send a welcome message to a newly registered retailer.
 * Uses an approved WhatsApp template.
 * Fire-and-forget; does not block the create flow.
 */
export async function triggerRetailerWelcomeMessage(
  retailerId: string,
  phone: string | null | undefined
): Promise<void> {
  if (!retailerId || !phone) return;

  console.info("[welcome] Invoking send-retailer-welcome-whatsapp for retailer", retailerId);
  
  supabase.functions
    .invoke("send-retailer-welcome-whatsapp", { body: { retailer_id: retailerId } })
    .then(() => {
      console.info("[welcome] Welcome message queued for", retailerId);
    })
    .catch((e) => {
      console.warn("[welcome] Welcome message failed:", e);
    });
}
