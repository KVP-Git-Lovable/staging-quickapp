// Places an outbound "Madad" help call via Bolna.ai to the signed-in user's own
// phone number. The phone is resolved server-side from the caller's JWT, never
// from the request body.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_HELP_AGENT_ID = "af3cbfa9-7913-48ff-b6c1-d80e24b2bd4b";

function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  return `+${digits}`;
}

function json(body: unknown, status = 200) {
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
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ success: false, error: "Not authenticated" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) {
      return json({ success: false, error: "Not authenticated" }, 401);
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, full_name, phone_number")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) throw profileErr;

    const phone = normalisePhone(profile?.phone_number);
    if (!phone) {
      return json({
        success: false,
        no_phone: true,
        error:
          "No phone number found on your profile. Add one in My Profile to receive the call.",
      });
    }

    const apiKey = Deno.env.get("BOLNA_API_KEY");
    if (!apiKey) throw new Error("BOLNA_API_KEY not configured");
    const agentId = Deno.env.get("BOLNA_HELP_AGENT_ID") || DEFAULT_HELP_AGENT_ID;

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
          user_id: user.id,
          user_name: profile?.full_name ?? "",
          
        },
      }),
    });

    const result = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("Bolna help call error:", resp.status, result);
      const msg =
        (result as any)?.message ||
        (result as any)?.error ||
        `Bolna HTTP ${resp.status}`;
      return json({ success: false, error: msg });
    }

    const callId =
      (result as any)?.call_id ?? (result as any)?.id ?? (result as any)?.callId ?? null;
    console.log(`✅ Madad help call initiated to ${phone}, id=${callId}`);

    return json({ success: true, call_id: callId, phone });
  } catch (err) {
    console.error("madad-help-call failed:", err);
    return json({ success: false, error: (err as Error).message });
  }
});
