// Bolna custom-tool endpoint to fetch and verify a retailer by phone.
// Body: { phone_number: string, action: "fetch" | "confirm" }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  parseBolnaPayload,
  findRetailerByPhone,
} from "../_shared/bolna.ts";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { payload } = await parseBolnaPayload(req);
    const phone_number = (payload as any).phone_number ?? (payload as any).phone;
    const action = String((payload as any).action ?? "fetch").toLowerCase();

    if (!phone_number) {
      return json(200, { success: false, error: "phone_number is required" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const retailer = await findRetailerByPhone(supabase, phone_number);
    if (!retailer) {
      return json(200, {
        success: false,
        not_found: true,
        message:
          "We could not locate your retailer information. Please contact support.",
      });
    }

    // Fetch full record (findRetailerByPhone returns a limited projection)
    const { data: full, error: fetchErr } = await supabase
      .from("retailers")
      .select("id, name, address, phone, verified")
      .eq("id", retailer.id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!full) {
      return json(200, {
        success: false,
        not_found: true,
        message:
          "We could not locate your retailer information. Please contact support.",
      });
    }

    if (action === "fetch") {
      return json(200, {
        success: true,
        retailer: {
          id: full.id,
          name: full.name,
          address: full.address,
          phone_number: full.phone,
          verified: !!full.verified,
        },
      });
    }

    if (action === "confirm") {
      const { error: updErr } = await supabase
        .from("retailers")
        .update({ verified: true })
        .eq("id", full.id);
      if (updErr) {
        console.error("verify-retailer-call update failed:", updErr);
        return json(200, { success: false, error: updErr.message });
      }
      console.log(`✅ Retailer ${full.id} verified via Bolna call`);
      return json(200, {
        success: true,
        message: "Retailer verified successfully",
      });
    }

    return json(200, {
      success: false,
      error: `Unknown action: ${action}. Use 'fetch' or 'confirm'.`,
    });
  } catch (err) {
    console.error("verify-retailer-call failed:", err);
    return json(200, { success: false, error: (err as Error).message });
  }
});
