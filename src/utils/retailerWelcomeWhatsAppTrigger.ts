import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget WhatsApp welcome message to a newly-created retailer.
 * Silent on any failure — never blocks the create flow.
 */
export function sendRetailerWelcomeWhatsApp(
  retailerId: string,
  phone: string | null | undefined
): void {
  if (!retailerId || !phone) return;
  try {
    supabase.functions
      .invoke("send-retailer-welcome-whatsapp", { body: { retailer_id: retailerId } })
      .catch((e) => console.warn("[welcome-wa] invoke failed:", e));
  } catch (e) {
    console.warn("[welcome-wa] trigger failed:", e);
  }
}
