// QuickApp Copilot — Phase 1 edge function.
// Auth-required. Streams Together.ai responses as SSE text tokens.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { buildSystemPrompt } from "./prompts/systemPrompt.ts";
import { streamChat, TogetherError, type ChatMessage } from "./services/togetherClient.ts";
import { HISTORY_LIMIT, MAX_INPUT_CHARS, MODEL } from "./config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "X-Copilot-Message-Id",
};

const BodySchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().trim().min(1).max(MAX_INPUT_CHARS),
});

function jsonError(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "method_not_allowed", "POST only");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonError(401, "unauthorized", "Missing bearer token");
    }
    const apiKey = Deno.env.get("TOGETHER_API_KEY");
    if (!apiKey) return jsonError(500, "server_misconfigured", "TOGETHER_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims?.sub) return jsonError(401, "unauthorized", "Invalid session");
    const userId = claims.claims.sub as string;

    // Validate body
    let payload: z.infer<typeof BodySchema>;
    try {
      payload = BodySchema.parse(await req.json());
    } catch (e) {
      const msg = e instanceof z.ZodError ? e.issues.map(i => i.message).join(", ") : "Invalid request";
      return jsonError(400, "invalid_request", msg);
    }
    const { conversationId, message } = payload;

    // Verify conversation ownership + fetch user profile fields for the prompt.
    const [{ data: conv, error: convErr }, { data: profile }] = await Promise.all([
      supabase
        .from("copilot_conversations")
        .select("id, user_id, title")
        .eq("id", conversationId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("full_name, name, role")
        .eq("id", userId)
        .maybeSingle(),
    ]);
    if (convErr || !conv || conv.user_id !== userId) {
      return jsonError(404, "conversation_not_found", "Conversation not accessible");
    }

    // Load history.
    const { data: history } = await supabase
      .from("copilot_messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(HISTORY_LIMIT);

    // Persist user message (best-effort, before streaming).
    await supabase.from("copilot_messages").insert({
      conversation_id: conversationId,
      user_id: userId,
      role: "user",
      content: message,
    });

    const today = new Date().toISOString().slice(0, 10);
    const system = buildSystemPrompt({
      userName: (profile as any)?.full_name || (profile as any)?.name || null,
      userRole: (profile as any)?.role || null,
      today,
    });

    const messages: ChatMessage[] = [
      { role: "system", content: system },
      ...((history ?? []).map((m: any) => ({
        role: m.role as ChatMessage["role"],
        content: String(m.content ?? ""),
      }))),
      { role: "user", content: message },
    ];

    let stream: Awaited<ReturnType<typeof streamChat>>;
    try {
      stream = await streamChat({ apiKey, messages });
    } catch (err) {
      if (err instanceof TogetherError) {
        console.error("[copilot-agent] together error:", err.status, err.message);
        const httpStatus = err.status === 429 ? 429 : err.status >= 500 ? 502 : 500;
        return jsonError(httpStatus, err.code, "AI provider request failed");
      }
      throw err;
    }

    // Persist assistant message after stream completes.
    stream.fullText.then(async (text) => {
      const finalText = text.trim();
      const nowIso = new Date().toISOString();
      await supabase.from("copilot_messages").insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "assistant",
        content: finalText || "",
        model: MODEL,
      });
      const updates: Record<string, unknown> = { last_message_at: nowIso, updated_at: nowIso };
      // Auto-title first exchange
      if (!conv.title || conv.title === "New chat") {
        updates.title = message.slice(0, 60);
      }
      await supabase.from("copilot_conversations").update(updates).eq("id", conversationId);
    }).catch((e) => console.error("[copilot-agent] persist error:", e));

    // Wrap token stream as SSE text events.
    const encoder = new TextEncoder();
    const sse = new ReadableStream({
      async start(controller) {
        const reader = stream.tokens.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: value })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (err) {
          console.error("[copilot-agent] stream error:", err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "stream_failed" })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(sse, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("[copilot-agent] fatal:", err);
    return jsonError(500, "internal_error", err instanceof Error ? err.message : "Unknown error");
  }
});
