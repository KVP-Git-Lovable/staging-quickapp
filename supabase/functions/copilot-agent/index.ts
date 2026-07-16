// QuickApp Copilot — Phase 1 edge function.
// Auth-required. Streams Together.ai responses as SSE text tokens.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { buildSystemPrompt } from "./prompts/systemPrompt.ts";
import {
  streamChat,
  TogetherError,
  type ChatMessage,
  type StreamResult,
} from "./services/togetherClient.ts";
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

type SupabaseClient = ReturnType<typeof createClient>;

function staticStream(text: string): StreamResult {
  return {
    tokens: new ReadableStream<string>({
      start(controller) {
        controller.enqueue(text);
        controller.close();
      },
    }),
    fullText: Promise.resolve(text),
  };
}

function formatNumber(value: unknown, maximumFractionDigits = 2): string {
  const number = Number(value ?? 0);
  return (Number.isFinite(number) ? number : 0).toLocaleString("en-IN", {
    maximumFractionDigits,
  });
}

function formatDays(value: unknown): string {
  const number = Number(value ?? 0);
  const days = Number.isFinite(number) ? number : 0;
  return `${formatNumber(days)} ${days === 1 ? "day" : "days"}`;
}

function escapeCell(value: unknown): string {
  return String(value ?? "—").replaceAll("|", "\\|");
}

type DataIntent = "leave" | "attendance" | "beats" | "collections" | "visits" | "targets";

function classifyDataIntent(message: string): DataIntent | null {
  const normalized = message.toLowerCase();
  if (/\bleave\b.*\bbalance\b|\bbalance\b.*\bleave\b/.test(normalized)) return "leave";
  if (/\battendance\b/.test(normalized)) return "attendance";
  if (/\b(last|recent)\b.*\bbeats?\b|\bbeats?\b.*\b(last|recent)\b/.test(normalized)) return "beats";
  if (/\bpending\b.*\bcollections?\b|\bcollections?\b.*\bpending\b|\boutstanding\b/.test(normalized)) return "collections";
  if (/\b(plan|schedule|prioriti[sz]e)\b.*\bvisits?\b|\btoday'?s? visits?\b/.test(normalized)) return "visits";
  if (/\btargets?\b/.test(normalized)) return "targets";
  return null;
}

async function leaveBalanceAnswer(
  supabase: SupabaseClient,
  userId: string,
  year: number,
): Promise<string> {
  const [{ data: balances, error: balanceError }, { data: leaveTypes, error: typeError }] = await Promise.all([
    supabase
      .from("leave_balance")
      .select("leave_type_id, opening_balance, used_balance, remaining_balance")
      .eq("user_id", userId)
      .eq("year", year),
    supabase
      .from("leave_types")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
  ]);
  if (balanceError || typeError) throw balanceError ?? typeError;
  if (!leaveTypes?.length) return `No active leave types are configured for ${year}.`;

  const rows = leaveTypes.map((leaveType: any) => {
    const balance = balances?.find((item: any) => item.leave_type_id === leaveType.id);
    return `| ${escapeCell(leaveType.name)} | ${formatDays(balance?.remaining_balance)} | ${formatDays(balance?.used_balance)} |`;
  });
  return [
    `## Your leave balance (${year})`,
    "",
    "| Leave type | Available | Booked |",
    "|---|---:|---:|",
    ...rows,
  ].join("\n");
}

async function attendanceAnswer(
  supabase: SupabaseClient,
  userId: string,
  today: string,
): Promise<string> {
  const monthStart = `${today.slice(0, 7)}-01`;
  const { data, error } = await supabase
    .from("attendance")
    .select("date, status, check_in_time, check_out_time, total_hours")
    .eq("user_id", userId)
    .gte("date", monthStart)
    .lte("date", today)
    .order("date", { ascending: false });
  if (error) throw error;
  if (!data?.length) return `No attendance records were found for ${today.slice(0, 7)}.`;

  const present = data.filter((row: any) => row.check_in_time || /present|late|half/i.test(row.status ?? "")).length;
  const late = data.filter((row: any) => /late/i.test(row.status ?? "")).length;
  const missed = data.filter((row: any) => /absent|missed/i.test(row.status ?? "")).length;
  const totalHours = data.reduce((sum: number, row: any) => sum + Number(row.total_hours ?? 0), 0);
  return [
    `## Attendance for ${today.slice(0, 7)}`,
    "",
    `- **Present/check-in days:** ${present}`,
    `- **Late days:** ${late}`,
    `- **Absent/missed days:** ${missed}`,
    `- **Recorded hours:** ${formatNumber(totalHours, 1)}`,
  ].join("\n");
}

async function recentBeatsAnswer(
  supabase: SupabaseClient,
  userId: string,
  today: string,
): Promise<string> {
  const { data: plans, error } = await supabase
    .from("daily_beat_plans")
    .select("plan_date, beat_id, status, assignment_type")
    .eq("assigned_user_id", userId)
    .lte("plan_date", today)
    .order("plan_date", { ascending: false })
    .limit(3);
  if (error) throw error;
  if (!plans?.length) return "No recent beat plans were found for your account.";

  const beatIds = [...new Set(plans.map((plan: any) => plan.beat_id).filter(Boolean))];
  const { data: beats, error: beatsError } = await supabase
    .from("beats")
    .select("beat_id, beat_name")
    .in("beat_id", beatIds);
  if (beatsError) throw beatsError;
  const names = new Map((beats ?? []).map((beat: any) => [beat.beat_id, beat.beat_name]));
  return [
    "## Your last 3 beats",
    "",
    "| Date | Beat | Status |",
    "|---|---|---|",
    ...plans.map((plan: any) => `| ${plan.plan_date} | ${escapeCell(names.get(plan.beat_id) ?? plan.beat_id)} | ${escapeCell(plan.status)} |`),
  ].join("\n");
}

async function pendingCollectionsAnswer(
  supabase: SupabaseClient,
): Promise<string> {
  const { data, error } = await supabase
    .from("retailers")
    .select("name, pending_amount, phone, beat_name")
    .gt("pending_amount", 0)
    .order("pending_amount", { ascending: false })
    .limit(20);
  if (error) throw error;
  if (!data?.length) return "No pending retailer collections were found in your accessible records.";
  const total = data.reduce((sum: number, retailer: any) => sum + Number(retailer.pending_amount ?? 0), 0);
  return [
    "## Pending collections",
    "",
    `**Total outstanding:** ₹${formatNumber(total)}`,
    "",
    "| Retailer | Beat | Amount |",
    "|---|---|---:|",
    ...data.map((retailer: any) => `| ${escapeCell(retailer.name)} | ${escapeCell(retailer.beat_name)} | ₹${formatNumber(retailer.pending_amount)} |`),
  ].join("\n");
}

async function todaysVisitsAnswer(
  supabase: SupabaseClient,
  userId: string,
  today: string,
): Promise<string> {
  const { data: visits, error } = await supabase
    .from("visits")
    .select("retailer_id, status, check_in_time, no_order_reason")
    .eq("user_id", userId)
    .eq("planned_date", today)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw error;
  if (!visits?.length) return `No visits are planned for ${today}.`;

  const retailerIds = [...new Set(visits.map((visit: any) => visit.retailer_id).filter(Boolean))];
  const { data: retailers, error: retailerError } = await supabase
    .from("retailers")
    .select("id, name, priority, pending_amount, beat_name, last_visit_date")
    .in("id", retailerIds);
  if (retailerError) throw retailerError;
  const retailerMap = new Map((retailers ?? []).map((retailer: any) => [retailer.id, retailer]));
  const ordered = [...visits].sort((a: any, b: any) => {
    const aRetailer: any = retailerMap.get(a.retailer_id);
    const bRetailer: any = retailerMap.get(b.retailer_id);
    return Number(bRetailer?.pending_amount ?? 0) - Number(aRetailer?.pending_amount ?? 0);
  });
  return [
    `## Today's visit plan (${today})`,
    "",
    "Prioritized by outstanding amount within your planned visits.",
    "",
    "| # | Retailer | Beat | Outstanding | Status |",
    "|---:|---|---|---:|---|",
    ...ordered.map((visit: any, index: number) => {
      const retailer: any = retailerMap.get(visit.retailer_id);
      return `| ${index + 1} | ${escapeCell(retailer?.name ?? "Retailer")} | ${escapeCell(retailer?.beat_name)} | ₹${formatNumber(retailer?.pending_amount)} | ${escapeCell(visit.status)} |`;
    }),
  ].join("\n");
}

async function targetsAnswer(
  supabase: SupabaseClient,
  userId: string,
  today: string,
): Promise<string> {
  const { data: targets, error } = await supabase
    .from("user_period_targets")
    .select("kpi_id, target_value, actual_value, achievement_percent, period_start, period_end, status")
    .eq("user_id", userId)
    .lte("period_start", today)
    .gte("period_end", today)
    .order("period_end", { ascending: true });
  if (error) throw error;
  if (!targets?.length) return `No active targets were found for ${today}.`;

  const kpiIds = [...new Set(targets.map((target: any) => target.kpi_id).filter(Boolean))];
  const { data: kpis, error: kpiError } = await supabase
    .from("target_kpi_definitions")
    .select("id, kpi_name, unit")
    .in("id", kpiIds);
  if (kpiError) throw kpiError;
  const kpiMap = new Map((kpis ?? []).map((kpi: any) => [kpi.id, kpi]));
  return [
    `## Active targets (${today})`,
    "",
    "| KPI | Actual | Target | Achievement |",
    "|---|---:|---:|---:|",
    ...targets.map((target: any) => {
      const kpi: any = kpiMap.get(target.kpi_id);
      const unit = kpi?.unit ? ` ${escapeCell(kpi.unit)}` : "";
      return `| ${escapeCell(kpi?.kpi_name ?? "Target")} | ${formatNumber(target.actual_value)}${unit} | ${formatNumber(target.target_value)}${unit} | ${formatNumber(target.achievement_percent)}% |`;
    }),
  ].join("\n");
}

async function dataAnswer(
  intent: DataIntent,
  supabase: SupabaseClient,
  userId: string,
  today: string,
): Promise<string> {
  switch (intent) {
    case "leave": return leaveBalanceAnswer(supabase, userId, Number(today.slice(0, 4)));
    case "attendance": return attendanceAnswer(supabase, userId, today);
    case "beats": return recentBeatsAnswer(supabase, userId, today);
    case "collections": return pendingCollectionsAnswer(supabase);
    case "visits": return todaysVisitsAnswer(supabase, userId, today);
    case "targets": return targetsAnswer(supabase, userId, today);
  }
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

    // Persist exactly one user message before processing.
    const { error: userMessageError } = await supabase.from("copilot_messages").insert({
      conversation_id: conversationId,
      user_id: userId,
      role: "user",
      content: message,
    });
    if (userMessageError) {
      console.error("[copilot-agent] user message persistence failed:", userMessageError);
      return jsonError(500, "persistence_failed", "Could not save your message");
    }

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
      const intent = classifyDataIntent(message);
      if (intent) {
        try {
          stream = staticStream(await dataAnswer(intent, supabase, userId, today));
        } catch (dataError) {
          console.error(`[copilot-agent] ${intent} query failed:`, dataError);
          stream = staticStream("I couldn't retrieve that information right now. Please retry in a moment.");
        }
      } else {
        stream = await streamChat({ apiKey, messages });
      }
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
      const { error: assistantMessageError } = await supabase.from("copilot_messages").insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "assistant",
        content: finalText || "",
        model: MODEL,
      });
      if (assistantMessageError) {
        console.error("[copilot-agent] assistant message persistence failed:", assistantMessageError);
        return;
      }
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
