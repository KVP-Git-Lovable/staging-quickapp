// Sends a WhatsApp template message to a newly-created retailer using the
// approved Twilio Content template HXa4311ea6f7d67093fe5426e224645038.
// Template variables: {1} retailer name, {2} phone, {3} address.
//
// Body: { retailer_id: string }
// Records a row in retailer_verification_requests on every attempt.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TEMPLATE_CONTENT_SID = "HXa4311ea6f7d67093fe5426e224645038";
const WHATSAPP_FROM = "whatsapp:+917411681616";

function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  return `+${digits}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { retailer_id } = await req.json();
    if (!retailer_id) throw new Error("retailer_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: retailer, error } = await supabase
      .from("retailers")
      .select("id, name, address, phone")
      .eq("id", retailer_id)
      .maybeSingle();

    if (error) throw error;
    if (!retailer) throw new Error("Retailer not found");

    const phone = normalisePhone(retailer.phone);
    if (!phone) {
      return new Response(
        JSON.stringify({ success: false, error: "Retailer has no valid phone" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accountSid =
      Deno.env.get("TWILIO_ACCOUNT_SID") ?? "AC2bed17b2742df7031ebc7de2d726b62f";
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!authToken) throw new Error("TWILIO_AUTH_TOKEN not configured");

    const contentVariables = JSON.stringify({
      "1": retailer.name ?? "",
      "2": retailer.phone ?? "",
      "3": retailer.address ?? "",
    });

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const base64Auth = btoa(`${accountSid}:${authToken}`);

    const formBody = new URLSearchParams({
      To: `whatsapp:${phone}`,
      From: WHATSAPP_FROM,
      ContentSid: TEMPLATE_CONTENT_SID,
      ContentVariables: contentVariables,
    });

    const resp = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${base64Auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
    });
    const result = await resp.json().catch(() => ({}));

    const status = resp.ok ? "sent" : "failed";
    await supabase.from("retailer_verification_requests").insert({
      retailer_id,
      phone,
      status,
      twilio_sid: result.sid ?? null,
      error_message: resp.ok ? null : JSON.stringify(result).slice(0, 500),
    });

    if (!resp.ok) {
      console.error("Twilio template send error:", result);
      const msg = result?.message || result?.error_message || `Twilio HTTP ${resp.status}`;
      return new Response(
        JSON.stringify({ success: false, error: msg, twilio: result }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Verification template sent to ${phone}, sid=${result.sid}`);
    return new Response(
      JSON.stringify({ success: true, sid: result.sid }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-retailer-verification-whatsapp failed:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
