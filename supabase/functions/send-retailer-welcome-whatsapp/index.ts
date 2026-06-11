// Sends a WhatsApp welcome template message to a newly-created retailer.
// Body: { retailer_id: string }
// Uses Twilio Content template HXa4311ea6f7d67093fe5426e224645038.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    return new Response(null, { headers: corsHeaders });
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

    const accountSid = "AC2bed17b2742df7031ebc7de2d726b62f";
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
      From: "whatsapp:+917411681616",
      ContentSid: "HXa4311ea6f7d67093fe5426e224645038",
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
    const result = await resp.json();

    if (!resp.ok) {
      console.error("Twilio error:", result);
      return new Response(
        JSON.stringify({ success: false, error: result }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
