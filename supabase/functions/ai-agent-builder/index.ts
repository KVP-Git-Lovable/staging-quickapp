// QuickApp AI — Agent Builder submit endpoint.
//
// Takes the builder dialog's objective + module context, asks Together.ai to
// SELECT 1-3 of the six frozen deterministic analysis blocks (it never invents
// queries or data sources), validates the composition with the existing
// parseWorkflowConfig, and inserts an ai_workflows row using the CALLER's
// RLS-scoped client (admin-only inserts are already enforced by RLS).
import { createClient } from "npm:@supabase/supabase-js@2";
import { streamChat, TogetherError } from "../_shared/together/togetherClient.ts";
import { parseWorkflowConfig } from "../ai-workflow-run/customWorkflow.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonError(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const BLOCK_SPEC = `- declining_retailers (params: windowDays 7-180, topN 3-15) — retailers whose order value dropped vs the preceding window
- top_retailers (params: windowDays 7-180, topN 3-15) — highest confirmed order value
- pending_dues (params: minAmount 0-100000, topN 3-15) — highest outstanding balances
- beat_coverage (params: coverageDays 7-90, stopsPerDay 5-60) — share of each beat's retailers visited recently
- product_mix (params: windowDays 7-180, topN 3-10) — top products by sales value
- visit_productivity (params: windowDays 7-90) — orders won per visit`;

type Tone = "encouraging" | "direct" | "formal";

function fallbackBlocks(objective: string): string[] {
  const o = objective.toLowerCase();
  if (/pending|due|collect/.test(o)) return ["pending_dues"];
  if (/churn|declin|drop|quiet/.test(o)) return ["declining_retailers"];
  if (/product|pitch|mix|sku/.test(o)) return ["product_mix"];
  if (/coverage|beat|plan/.test(o)) return ["beat_coverage"];
  if (/visit|productivity|strike/.test(o)) return ["visit_productivity"];
  return ["top_retailers"];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "method_not_allowed", "Use POST");

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonError(401, "unauthorized", "Missing bearer token");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  try {
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    const userId = (claims as any)?.claims?.sub as string | undefined;
    if (claimsError || !userId) return jsonError(401, "unauthorized", "Invalid session");

    const { data: isAdmin, error: adminError } = await supabase.rpc("is_system_admin", {
      _user_id: userId,
    });
    if (adminError) return jsonError(500, "admin_check_failed", adminError.message);
    if (isAdmin !== true) {
      return jsonError(403, "admin_only", "Only administrators can create AI agents");
    }

    const body = await req.json().catch(() => ({}));
    const sourceModule = String((body as any)?.sourceModule ?? "").slice(0, 120);
    const sourceLabel = String((body as any)?.sourceLabel ?? sourceModule).slice(0, 120);
    const destModule = String((body as any)?.destModule ?? "").slice(0, 120);
    const destLabel = String((body as any)?.destLabel ?? destModule).slice(0, 120);
    const objective = String((body as any)?.objective ?? "").trim().slice(0, 2000);
    const tables = Array.isArray((body as any)?.tables)
      ? (body as any).tables.map((t: unknown) => String(t)).slice(0, 40)
      : [];

    if (!sourceModule || !destModule || !objective) {
      return jsonError(400, "invalid_body", "sourceModule, destModule and objective are required");
    }

    let usedAi = false;
    let name = `${sourceLabel} Agent`;
    let aiDescription = `AI agent for ${sourceLabel}, created from the Agent Builder.`;
    let blocks: Array<{ type: string; params: Record<string, number> }> = fallbackBlocks(objective)
      .map((type) => ({ type, params: {} }));
    let focus = objective.slice(0, 500);
    let tone: Tone = "encouraging";

    const apiKey = Deno.env.get("TOGETHER_API_KEY");
    if (apiKey) {
      try {
        const stream = await streamChat({
          apiKey,
          signal: req.signal,
          messages: [
            {
              role: "system",
              content:
                "You compose QuickApp AI analysis agents. You may ONLY select from these fixed " +
                "deterministic analysis blocks — never invent queries or data sources:\n" +
                BLOCK_SPEC +
                "\nChoose 1 to 3 blocks with parameters (integers, inside the stated bounds) that best " +
                'fulfil the user objective. Reply with STRICT JSON ONLY, no markdown, exactly: ' +
                '{"name":"...","description":"...","blocks":[{"type":"...","params":{...}}],' +
                '"focus":"<=500 chars narration focus derived from the objective",' +
                '"tone":"encouraging"|"direct"|"formal"}',
            },
            {
              role: "user",
              content:
                `Source module: ${sourceLabel} (${sourceModule})\n` +
                `Destination display module: ${destLabel} (${destModule})\n` +
                `Module tables (reference only): ${tables.join(", ") || "none"}\n` +
                `Objective: ${objective}`,
            },
          ],
        });
        const drain = (async () => {
          for await (const _ of stream.tokens) { /* consume */ }
        })();
        const [text] = await Promise.all([stream.fullText, drain]);
        const jsonText = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
        const parsed = JSON.parse(jsonText);
        const candidate = {
          version: 1 as const,
          blocks: parsed.blocks,
          narration: {
            focus: String(parsed.focus ?? objective).slice(0, 500),
            tone: parsed.tone,
          },
        };
        const validated = parseWorkflowConfig(candidate);
        blocks = validated.blocks as typeof blocks;
        focus = validated.narration.focus;
        tone = validated.narration.tone as Tone;
        if (typeof parsed.name === "string" && parsed.name.trim()) {
          name = parsed.name.trim().slice(0, 120);
        }
        if (typeof parsed.description === "string" && parsed.description.trim()) {
          aiDescription = parsed.description.trim().slice(0, 400);
        }
        usedAi = true;
      } catch (e) {
        const why = e instanceof TogetherError ? `${e.code}: ${e.message}` : String(e);
        console.log("[ai-agent-builder] AI composition failed, using fallback —", why);
      }
    }

    // Final safety: the fallback path must also satisfy the shared validator.
    const config = parseWorkflowConfig({
      version: 1,
      blocks,
      narration: { focus, tone },
    });

    const { data: inserted, error: insertError } = await supabase
      .from("ai_workflows")
      .insert({
        name,
        description: `${aiDescription} · Works on ${sourceLabel} → shows in ${destLabel}.`,
        config: config as any,
        created_by: userId,
        is_active: true,
      })
      .select("id, name, description")
      .single();

    if (insertError) {
      if (/row-level security/i.test(insertError.message)) {
        return jsonError(403, "admin_only", "Only administrators can create AI agents");
      }
      return jsonError(500, "insert_failed", insertError.message);
    }

    return new Response(
      JSON.stringify({
        kind: "agent_created",
        workflow: inserted,
        blocks: config.blocks.map((b) => b.type),
        usedAi,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return jsonError(500, "builder_failed", message);
  }
});
