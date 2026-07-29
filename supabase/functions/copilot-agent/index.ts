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
import { routeIntentWithAi } from "./services/aiIntentRouter.ts";

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
  _today: string,
): Promise<string> {
  // The source of truth is the user's three most recently created beats.
  // Related activity is fetched separately because visits.retailer_id has no FK
  // relationship that PostgREST can use for an embedded retailers join.
  const { data: beats, error: beatsError } = await supabase
    .from("beats")
    .select("beat_id, beat_name, created_at, is_active")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(3);
  if (beatsError) throw beatsError;
  if (!beats?.length) {
    return "I couldn't find any beats created by your account yet.";
  }

  const beatIds = beats.map((beat: any) => beat.beat_id).filter(Boolean);
  const visitsByBeat = new Map<string, { count: number; checkedIn: number; lastDate: string | null }>();
  const ordersByBeat = new Map<string, { count: number; value: number; lastDate: string | null }>();

  // Enrichment is deliberately best-effort: a related-table policy or data issue
  // must never hide the beats that were successfully retrieved above.
  const { data: retailers, error: retailersError } = await supabase
    .from("retailers")
    .select("id, beat_id")
    .in("beat_id", beatIds);

  if (retailersError) {
    console.error("[copilot-agent] beat retailer enrichment failed:", retailersError);
  } else {
    const beatByRetailer = new Map(
      (retailers ?? []).map((retailer: any) => [retailer.id, retailer.beat_id]),
    );
    const retailerIds = [...beatByRetailer.keys()];
    if (retailerIds.length) {
      const { data: visits, error: visitsError } = await supabase
        .from("visits")
        .select("retailer_id, planned_date, check_in_time, created_at")
        .eq("user_id", userId)
        .in("retailer_id", retailerIds);
      if (visitsError) {
        console.error("[copilot-agent] beat visit enrichment failed:", visitsError);
      } else {
        (visits ?? []).forEach((visit: any) => {
          const beatId = beatByRetailer.get(visit.retailer_id);
          if (!beatId) return;
          const date = visit.planned_date ?? (String(visit.created_at ?? "").slice(0, 10) || null);
          const aggregate = visitsByBeat.get(beatId) ?? { count: 0, checkedIn: 0, lastDate: null };
          aggregate.count += 1;
          if (visit.check_in_time) aggregate.checkedIn += 1;
          if (date && (!aggregate.lastDate || date > aggregate.lastDate)) aggregate.lastDate = date;
          visitsByBeat.set(beatId, aggregate);
        });
      }
    }
  }

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("beat_id, total_amount, order_date, created_at")
    .eq("user_id", userId)
    .in("beat_id", beatIds);
  if (ordersError) {
    console.error("[copilot-agent] beat order enrichment failed:", ordersError);
  } else {
    (orders ?? []).forEach((order: any) => {
      if (!order.beat_id) return;
      const date = order.order_date ?? (String(order.created_at ?? "").slice(0, 10) || null);
      const aggregate = ordersByBeat.get(order.beat_id) ?? { count: 0, value: 0, lastDate: null };
      aggregate.count += 1;
      aggregate.value += Number(order.total_amount ?? 0);
      if (date && (!aggregate.lastDate || date > aggregate.lastDate)) aggregate.lastDate = date;
      ordersByBeat.set(order.beat_id, aggregate);
    });
  }

  const lines = beats.map((beat: any, index: number) => {
    const visits = visitsByBeat.get(beat.beat_id);
    const orders = ordersByBeat.get(beat.beat_id);
    const activity = [
      visits?.count
        ? `${visits.count} linked visit${visits.count === 1 ? "" : "s"} (${visits.checkedIn} checked in)`
        : "no linked visits",
      orders?.count
        ? `${orders.count} order${orders.count === 1 ? "" : "s"} worth ₹${formatNumber(orders.value)}`
        : "no orders",
    ];
    return `- **${index + 1}. ${beat.beat_name ?? beat.beat_id}** — created ${String(beat.created_at).slice(0, 10)} · ${activity.join(" · ")}`;
  });

  return ["Your last three beats information is as follows:", "", ...lines].join("\n");
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
  if (!data?.length) {
    return "Good news — you have no pending collections right now. All retailer balances are cleared.";
  }
  const total = data.reduce((sum: number, retailer: any) => sum + Number(retailer.pending_amount ?? 0), 0);
  const lines = data.map((r: any, i: number) => {
    const beat = r.beat_name ? ` _(${r.beat_name})_` : "";
    return `${i + 1}. **${r.name ?? "Retailer"}**${beat} — ₹${formatNumber(r.pending_amount)}`;
  });
  return [
    "Sure — here are your pending collections:",
    "",
    `**Total outstanding:** ₹${formatNumber(total)} across ${data.length} retailer${data.length === 1 ? "" : "s"}.`,
    "",
    ...lines,
    "",
    "Let me know if you'd like to prioritise any of these for today's route.",
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

    const reqId = crypto.randomUUID().slice(0, 8);
    const diagLog = (msg: string, extra?: unknown) =>
      console.log(`[copilot-diag][${reqId}][edge] ${msg}`, extra ?? "");

    let stream: Awaited<ReturnType<typeof streamChat>>;
    try {
      let intent = classifyDataIntent(message);
      if (!intent) {
        const routed = await routeIntentWithAi(apiKey, message);
        diagLog(
          `ai-router msgChars=${message.length} regex=no-match raw=${JSON.stringify(routed.raw)} resolved=${routed.intent ?? "none"} latencyMs=${routed.latencyMs}`,
        );
        intent = routed.intent;
      }
      let llmMessages = messages;

      if (intent) {
        try {
          const dataBlock = await dataAnswer(intent, supabase, userId, today);
          diagLog(`intent=${intent} dataBlockChars=${dataBlock.length}`);
          const grounding: ChatMessage = {
            role: "system",
            content:
              `The following is authoritative live data from the signed-in user's workspace, retrieved just now via RLS-scoped SQL for intent "${intent}". ` +
              `Use ONLY these facts to answer the user's question — do not invent numbers, names, dates, or totals. ` +
              `Answer diplomatically and conversationally in the same language the user used. You may reformat, summarise, or add brief insight, but every figure must come from this block.\n\n` +
              `---\n${dataBlock}\n---`,
          };
          llmMessages = [
            messages[0],
            grounding,
            ...messages.slice(1),
          ];
        } catch (dataError) {
          console.error(`[copilot-agent] ${intent} query failed:`, dataError);
          const note: ChatMessage = {
            role: "system",
            content:
              `Live workspace data for intent "${intent}" could not be retrieved this turn. ` +
              `Apologise briefly, tell the user the live data is temporarily unavailable, and offer to retry — do not fabricate figures.`,
          };
          llmMessages = [messages[0], note, ...messages.slice(1)];
        }
      } else {
        diagLog("intent=none");
      }
      diagLog(`opening stream promptMessages=${llmMessages.length}`);
      stream = await streamChat({
        apiKey,
        messages: llmMessages,
        signal: req.signal,
        reqId,
      });
    } catch (err) {

      if (err instanceof TogetherError) {
        console.error("[copilot-agent] together error:", err.status, err.message);
        const httpStatus = err.status === 429 ? 429 : err.status >= 500 ? 502 : 500;
        return jsonError(httpStatus, err.code, "AI provider request failed");
      }
      throw err;
    }

    // The assistant row is created as soon as the first token arrives and is
    // then updated in place. If the isolate is torn down mid-stream, whatever
    // the user already saw survives instead of the turn vanishing entirely.
    let assistantRowId: string | null = null;
    let persistedLength = 0;

    const persistAssistant = async (text: string, final: boolean) => {
      const content = final ? text.trim() : text;
      if (!content && !final) return;

      if (!assistantRowId) {
        const { data, error } = await supabase
          .from("copilot_messages")
          .insert({
            conversation_id: conversationId,
            user_id: userId,
            role: "assistant",
            content,
            model: MODEL,
          })
          .select("id")
          .maybeSingle();
        if (error || !data) {
          console.error("[copilot-agent] assistant message persistence failed:", error);
          return;
        }
        assistantRowId = (data as any).id as string;
        persistedLength = content.length;
      } else if (content.length !== persistedLength || final) {
        const { error } = await supabase
          .from("copilot_messages")
          .update({ content })
          .eq("id", assistantRowId);
        if (error) {
          console.error("[copilot-agent] assistant message update failed:", error);
          return;
        }
        persistedLength = content.length;
      }

      if (!final) return;
      const nowIso = new Date().toISOString();
      const updates: Record<string, unknown> = { last_message_at: nowIso, updated_at: nowIso };
      // Auto-title first exchange
      if (!conv.title || conv.title === "New chat") {
        updates.title = message.slice(0, 60);
      }
      await supabase.from("copilot_conversations").update(updates).eq("id", conversationId);
    };

    // Wrap token stream as SSE text events.
    const encoder = new TextEncoder();
    const HEARTBEAT_MS = 10_000;

    const sse = new ReadableStream({
      async start(controller) {
        const reader = stream.tokens.getReader();
        let closed = false;
        let accumulated = "";
        let forwarded = 0;
        let lastPersistAt = 0;
        let terminalSent = false;

        const send = (payload: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(payload));
          } catch {
            closed = true;
          }
        };

        // Comment frames keep intermediaries from treating an idle-but-alive
        // connection as dead, and let the client tell "thinking" from "gone".
        const heartbeat = setInterval(() => send(`: keep-alive\n\n`), HEARTBEAT_MS);

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (forwarded === 0) diagLog("first delta forwarded");
            accumulated += value;
            forwarded += 1;
            send(`data: ${JSON.stringify({ delta: value })}\n\n`);

            const now = Date.now();
            if (now - lastPersistAt > 750 || accumulated.length - persistedLength > 200) {
              lastPersistAt = now;
              await persistAssistant(accumulated, false);
            }
          }

          const completedText = await stream.fullText;
          diagLog("stream drained", {
            forwarded,
            chars: completedText.length,
            upstream: stream.diag,
          });
          await persistAssistant(completedText, true);
          terminalSent = true;
          send(`data: [DONE]\n\n`);
        } catch (err) {
          const code = err instanceof TogetherError ? err.code : "stream_failed";
          console.error(`[copilot-agent][${reqId}] stream error (${code}):`, err);
          // Keep the partial answer rather than discarding the turn.
          if (accumulated.trim()) {
            try { await persistAssistant(accumulated, true); } catch { /* best effort */ }
          }
          terminalSent = true;
          send(`data: ${JSON.stringify({ error: code, partial: accumulated.length > 0 })}\n\n`);
        } finally {
          clearInterval(heartbeat);
          // No path may close silently: the client treats a missing terminal
          // frame as an interrupted stream.
          if (!terminalSent) send(`data: ${JSON.stringify({ error: "stream_failed" })}\n\n`);
          diagLog("closing sse", { forwarded, upstream: stream.diag });
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
        }
      },
      cancel() {
        diagLog("client cancelled sse");
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

