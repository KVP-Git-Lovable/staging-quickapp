// Sends a welcome message to a newly registered retailer using an approved WhatsApp template.
// Uses Twilio Programmable Messaging with ContentSid for approved templates.
//
// Expects body: { retailer_id: string }
//
// On success records a row in retailer_verification_requests.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  return `+${digits}`;
}

function normaliseWhatsAppSender(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw.trim();
  if (v.startsWith("whatsapp:")) v = v.slice("whatsapp:".length);
  const digits = v.replace(/\D/g, "");
  if (!digits) return null;
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
      .select("id, name, phone, address, latitude, longitude")
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

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromNumber = normaliseWhatsAppSender(
      Deno.env.get("TWILIO_WHATSAPP_NUMBER") ?? Deno.env.get("TWILIO_FROM_NUMBER")
    );
    const contentSid = Deno.env.get("TWILIO_WELCOME_TEMPLATE_SID");

    if (!accountSid) throw new Error("TWILIO_ACCOUNT_SID not configured");
    if (!authToken) throw new Error("TWILIO_AUTH_TOKEN not configured");
    if (!fromNumber) throw new Error("TWILIO_WHATSAPP_NUMBER not configured");
    if (!contentSid) throw new Error("TWILIO_WELCOME_TEMPLATE_SID not configured");

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const base64Auth = btoa(`${accountSid}:${authToken}`);

    // Template variables: {{1}} = store/retailer name, {{2}} = phone number, {{3}} = address
    const storeName = (retailer.name || "Retailer").toString().trim();
    const addressParts = [
      retailer.address,
      retailer.city,
      retailer.state,
      retailer.pincode,
    ].filter((v) => v && String(v).trim().length > 0);
    const fullAddress = addressParts.length > 0 ? addressParts.join(", ") : "Not provided";
    const contentVariables = JSON.stringify({
      "1": storeName,
      "2": phone,
      "3": fullAddress,
    });

    const formBody = new URLSearchParams({
      To: `whatsapp:${phone}`,
      From: `whatsapp:${fromNumber}`,
      ContentSid: contentSid,
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
      console.error("Twilio template error:", result);
      const msg = result?.message || result?.error_message || `Twilio HTTP ${resp.status}`;
      return new Response(
        JSON.stringify({ success: false, error: msg, twilio: result }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, sid: result.sid }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-retailer-welcome-whatsapp failed:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
