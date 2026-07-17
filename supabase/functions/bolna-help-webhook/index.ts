// Bolna webhook for the Madad Help Assistant.
// Isolated from all existing Bolna/voice integrations.
// Reads only from quickapp_help_* tables. Never touches CRM data.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  agent_id: z.string().trim().optional(),
  caller_phone: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  question: z.string().trim().min(1).max(1000),
  language: z.enum(["kn", "en", "hi"]).optional(),
});

const FALLBACK_MESSAGES: Record<string, string> = {
  kn: "ಈ ಪ್ರಶ್ನೆಗೆ ನನಗೆ ಈಗ ಉತ್ತರ ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ನಿಮ್ಮ Administrator ಅಥವಾ Supervisor ಅವರನ್ನು ಸಂಪರ್ಕಿಸಿ.",
  en: "I don't have an answer for that right now. Please contact your Administrator or Supervisor.",
  hi: "इस प्रश्न का उत्तर अभी उपलब्ध नहीं है। कृपया अपने Administrator या Supervisor से संपर्क करें।",
};

const SCORE_THRESHOLD = 2.0;

function detectLanguage(text: string): "kn" | "en" | "hi" {
  if (/[\u0C80-\u0CFF]/.test(text)) return "kn";
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  return "en";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "invalid_request",
          details: parsed.error.flatten().fieldErrors,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    body = parsed.data;
  } catch (_e) {
    return new Response(
      JSON.stringify({ success: false, error: "invalid_json" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const question = body.question;
  const callerPhone = body.caller_phone || body.phone || null;
  const agentId = body.agent_id || null;

  // Resolve agent
  let agentDefaultLang: string | null = null;
  let agentActive = true;
  if (agentId) {
    const { data: agent } = await supabase
      .from("quickapp_help_agents")
      .select("default_language, is_active")
      .eq("agent_id", agentId)
      .maybeSingle();
    if (agent) {
      agentDefaultLang = (agent as any).default_language;
      agentActive = (agent as any).is_active;
    } else {
      agentActive = false;
    }
  }

  const language =
    body.language ||
    (detectLanguage(question) as "kn" | "en" | "hi") ||
    (agentDefaultLang as "kn" | "en" | "hi") ||
    "kn";

  const logRow = {
    agent_id: agentId,
    caller_phone: callerPhone,
    question,
    language,
    detected_module: null as string | null,
    detected_intent: null as string | null,
    article_id: null as string | null,
    answered: false,
  };

  const respond = async (payload: Record<string, unknown>, module?: string, articleId?: string) => {
    logRow.detected_module = module ?? null;
    logRow.article_id = articleId ?? null;
    logRow.answered = payload.success === true;
    try {
      await supabase.from("quickapp_help_logs").insert(logRow);
    } catch (e) {
      console.error("help-log insert failed", e);
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };

  if (agentId && !agentActive) {
    return respond({
      success: false,
      fallback: true,
      message: FALLBACK_MESSAGES[language] ?? FALLBACK_MESSAGES.kn,
    });
  }

  const { data: matches, error: rpcErr } = await supabase.rpc("match_help_article", {
    p_question: question,
    p_language: language,
  });

  if (rpcErr) {
    console.error("match_help_article error", rpcErr);
    return respond({
      success: false,
      fallback: true,
      message: FALLBACK_MESSAGES[language] ?? FALLBACK_MESSAGES.kn,
    });
  }

  const top = Array.isArray(matches) && matches.length > 0 ? (matches[0] as any) : null;

  if (!top || Number(top.score ?? 0) < SCORE_THRESHOLD) {
    return respond({
      success: false,
      fallback: true,
      message: FALLBACK_MESSAGES[language] ?? FALLBACK_MESSAGES.kn,
    });
  }

  return respond(
    {
      success: true,
      module: top.module,
      title: top.title,
      steps: top.steps ?? [],
      language: top.language,
      article_id: top.id,
    },
    top.module,
    top.id,
  );
});
