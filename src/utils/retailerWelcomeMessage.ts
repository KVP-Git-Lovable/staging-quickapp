import { supabase } from "@/integrations/supabase/client";

export interface WelcomeMessageResult {
  ok: boolean;
  sid?: string;
  error?: string;
}

/**
 * Send a welcome message to a newly registered retailer via approved WhatsApp template.
 * Awaits the edge function and returns the real success/error result so the UI can show it.
 */
export async function triggerRetailerWelcomeMessage(
  retailerId: string,
  phone: string | null | undefined
): Promise<WelcomeMessageResult> {
  if (!retailerId) return { ok: false, error: "Missing retailer id" };
  if (!phone) return { ok: false, error: "Retailer has no phone number" };

  console.info("[welcome] Invoking send-retailer-welcome-whatsapp for retailer", retailerId);

  try {
    const { data, error } = await supabase.functions.invoke(
      "send-retailer-welcome-whatsapp",
      { body: { retailer_id: retailerId } }
    );

    if (error) {
      console.warn("[welcome] invoke error:", error);
      return { ok: false, error: error.message || "Edge function error" };
    }

    if (data?.success) {
      console.info("[welcome] sent, sid=", data.sid);
      return { ok: true, sid: data.sid };
    }

    const errMsg =
      data?.error ||
      data?.twilio?.message ||
      "WhatsApp send failed (unknown error)";
    console.warn("[welcome] Twilio rejected:", data);
    return { ok: false, error: errMsg };
  } catch (e: any) {
    console.warn("[welcome] exception:", e);
    return { ok: false, error: e?.message || "Network error" };
  }
}
