// Twilio inbound webhook. Twilio posts form-encoded payload to this URL when
// a user replies to one of our WhatsApp messages. We match the sender's phone
// number to the latest pending retailer_verification_requests row and update
// the retailer's verification state.
//
// Configure Twilio sandbox / number messaging webhook to:
//   https://<project-ref>.functions.supabase.co/whatsapp-retailer-verify-inbound
//
// Must be public (verify_jwt = false) because Twilio cannot send JWTs.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

function twiml(message?: string) {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(body, {
    headers: { ...corsHeaders, "Content-Type": "text/xml" },
  });
}

function stripWhatsApp(raw: string | null): string | null {
  if (!raw) return null;
  return raw.replace(/^whatsapp:/i, "").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const form = await req.formData();
    const from = stripWhatsApp(form.get("From") as string | null);
    const bodyRaw = ((form.get("Body") as string | null) || "").trim();
    const body = bodyRaw.toLowerCase();

    console.log("Inbound WA:", { from, body: bodyRaw });
    if (!from) return twiml();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up the most recent pending request for this phone (in last 30 days)
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: request } = await supabase
      .from("retailer_verification_requests")
      .select("id, retailer_id, status")
      .eq("phone", from)
      .in("status", ["sent", "queued"])
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!request) {
      console.log("No pending verification request for", from);
      return twiml();
    }

    const isYes = /^(y|yes|haan|ha|ok|confirm|confirmed|sahi)/i.test(body);
    const isNo = /^(n|no|nahi|wrong|incorrect|galat)/i.test(body);

    if (!isYes && !isNo) {
      return twiml("Please reply YES to confirm or NO if details are wrong.");
    }

    if (isYes) {
      // Preserve a higher existing score if one is already recorded
      const { data: existing } = await supabase
        .from("retailers")
        .select("verification_score")
        .eq("id", request.retailer_id)
        .maybeSingle();
      const newScore = Math.max(80, Number(existing?.verification_score) || 0);

      await supabase
        .from("retailers")
        .update({
          verified: true,
          verification_status: "verified",
          verification_method: "whatsapp",
          verification_address: true,
          verification_contact: true,
          verified_at: new Date().toISOString(),
          verified_by_name: "WhatsApp",
          whatsapp_verified: true,
          verification_score: newScore,
        })
        .eq("id", request.retailer_id);


      await supabase
        .from("retailer_verification_requests")
        .update({
          status: "confirmed",
          reply_text: bodyRaw.slice(0, 500),
          reply_received_at: new Date().toISOString(),
        })
        .eq("id", request.id);

      await supabase.from("retailer_verification_audit").insert({
        retailer_id: request.retailer_id,
        action: "verified",
        method: "whatsapp",
        verified_items: { whatsapp_reply: true },
        notes: "Auto-verified via WhatsApp YES reply",
        performed_by_name: "WhatsApp Self-Confirm",
      });

      return twiml("Thank you! Your shop details are confirmed. ✅");
    }

    // isNo
    await supabase
      .from("retailers")
      .update({ verification_status: "needs_attention" })
      .eq("id", request.retailer_id);

    await supabase
      .from("retailer_verification_requests")
      .update({
        status: "rejected",
        reply_text: bodyRaw.slice(0, 500),
        reply_received_at: new Date().toISOString(),
      })
      .eq("id", request.id);

    await supabase.from("retailer_verification_audit").insert({
      retailer_id: request.retailer_id,
      action: "rejected",
      method: "whatsapp",
      verified_items: { whatsapp_reply: false },
      notes: `Rejected via WhatsApp: ${bodyRaw.slice(0, 200)}`,
      performed_by_name: "WhatsApp Self-Reject",
    });

    return twiml("Thanks — our team will contact you to update the details.");
  } catch (err) {
    console.error("whatsapp-retailer-verify-inbound failed:", err);
    return twiml();
  }
});
