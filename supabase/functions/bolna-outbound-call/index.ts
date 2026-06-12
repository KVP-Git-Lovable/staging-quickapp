// Initiates an outbound voice call via Bolna.ai for a retailer.
// Body: { retailer_id: string }
// Returns: { success, call_id?, error? }

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { retailer_id } = await req.json();
    if (!retailer_id) throw new Error("retailer_id is required");

    const apiKey = Deno.env.get("BOLNA_API_KEY");
    const agentId = Deno.env.get("BOLNA_AGENT_ID");
    if (!apiKey) throw new Error("BOLNA_API_KEY not configured");
    if (!agentId) throw new Error("BOLNA_AGENT_ID not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: retailer, error } = await supabase
      .from("retailers")
      .select("id, name, phone")
      .eq("id", retailer_id)
      .maybeSingle();
    if (error) throw error;
    if (!retailer) throw new Error("Retailer not found");

    const phone = normalisePhone(retailer.phone);
    if (!phone) {
      return new Response(
        JSON.stringify({ success: false, error: "Retailer phone number not available." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resp = await fetch("https://api.bolna.ai/call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: agentId,
        recipient_phone_number: phone,
        from_phone_number: "+918031151880",
        user_data: {
          retailer_id: retailer.id,
          retailer_name: retailer.name ?? "",
        },
      }),
    });

    const result = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("Bolna call error:", resp.status, result);
      const msg =
        (result as any)?.message ||
        (result as any)?.error ||
        `Bolna HTTP ${resp.status}`;
      return new Response(
        JSON.stringify({ success: false, error: msg, bolna: result }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const callId =
      (result as any)?.call_id ??
      (result as any)?.id ??
      (result as any)?.callId ??
      null;
    console.log(`✅ Bolna call initiated to ${phone}, id=${callId}`);

    return new Response(
      JSON.stringify({ success: true, call_id: callId, bolna: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("bolna-outbound-call failed:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
