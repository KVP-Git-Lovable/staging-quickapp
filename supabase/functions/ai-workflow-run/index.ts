// QuickApp AI Workflows — simulation runner.
// Deterministic SQL-derived facts first; Together.ai only narrates them.
// Read-only apart from logging one row in public.workflow_executions.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  streamChat,
  TogetherError,
  type ChatMessage,
} from "../copilot-visit-actions/services/togetherClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONFIRMED = new Set(["confirmed", "delivered", "invoiced", "completed", "dispatched", "packed"]);
const DAY_MS = 86_400_000;
const SUPPORTED = new Set(["visit_optimiser", "churn_detector"]);

function jsonError(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function num(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function inr(v: unknown) {
  return `₹${num(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function haversineKm(a: [number, number], b: [number, number]) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Churn Detector — same rules as the Copilot declining-retailer calculation. */
async function runChurnDetector(supabase: any, userId: string) {
  const now = new Date();
  const today = isoDate(now);
  const start180 = isoDate(new Date(now.getTime() - 180 * DAY_MS));
  const cut90 = new Date(now.getTime() - 90 * DAY_MS).getTime();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, retailer_id, total_amount, order_date, status")
    .eq("user_id", userId)
    .gte("order_date", start180)
    .lte("order_date", today)
    .order("order_date", { ascending: false })
    .limit(4000);
  if (error) throw error;

  const recent = new Map<string, number>();
  const prior = new Map<string, number>();
  (orders ?? []).forEach((o: any) => {
    if (String(o.status ?? "").toLowerCase() === "cancelled") return;
    const rid = String(o.retailer_id ?? "");
    if (!rid || !o.order_date) return;
    const t = new Date(`${String(o.order_date).slice(0, 10)}T00:00:00Z`).getTime();
    const bucket = t >= cut90 ? recent : prior;
    bucket.set(rid, (bucket.get(rid) ?? 0) + num(o.total_amount));
  });

  const ids = [...new Set([...recent.keys(), ...prior.keys()])];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: retailers } = await supabase
      .from("retailers")
      .select("id, name, beat_name")
      .in("id", ids.slice(0, 1000));
    (retailers ?? []).forEach((r: any) => names.set(String(r.id), String(r.name ?? "Retailer")));
  }

  const rows = ids
    .map((rid) => {
      const recentValue = recent.get(rid) ?? 0;
      const priorValue = prior.get(rid) ?? 0;
      return {
        retailerId: rid,
        name: names.get(rid) ?? "Retailer",
        recentValue,
        priorValue,
        dropPct: priorValue > 0 ? Math.round(((priorValue - recentValue) / priorValue) * 100) : 0,
      };
    })
    .filter((r) => r.priorValue > 0 && r.recentValue < r.priorValue)
    .sort((a, b) => b.dropPct - a.dropPct || b.priorValue - a.priorValue)
    .slice(0, 10);

  const facts = [
    `Today: ${today}`,
    `Retailers analysed: ${ids.length} (last 180 days of orders, cancelled excluded).`,
    "",
    "### Declining retailers — last 90 days vs the 90 days before",
    rows.length
      ? rows
          .map(
            (r) =>
              `- ${r.name}: ${inr(r.priorValue)} → ${inr(r.recentValue)} (down ${r.dropPct}%)`,
          )
          .join("\n")
      : "- No retailer has reduced their order value over the last 90 days.",
  ].join("\n");

  return {
    facts,
    result: { kind: "churn", rows, analysed: ids.length, date: today },
    systemPrompt:
      "You are QuickApp's Churn Detector agent. Use ONLY the figures in the DATA block — never invent retailers or numbers. " +
      "Use ₹ for currency. Reply in compact markdown: a one-line headline, then up to five bullets naming the at-risk retailers with their drop, " +
      "then a single line starting with 'Suggested step:'. Keep it under 150 words and stay respectful and non-blaming.",
    userPrompt: "Summarise the churn risk for my retailers.",
  };
}

/** Visit Optimiser — deterministic stop scoring on today's planned visits. */
async function runVisitOptimiser(supabase: any, userId: string) {
  const now = new Date();
  const today = isoDate(now);
  const since = isoDate(new Date(now.getTime() - 90 * DAY_MS));

  const { data: todayVisits, error } = await supabase
    .from("visits")
    .select("id, retailer_id, status")
    .eq("user_id", userId)
    .eq("planned_date", today)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;

  const retailerIds = [
    ...new Set((todayVisits ?? []).map((v: any) => v.retailer_id).filter(Boolean).map(String)),
  ];

  if (!retailerIds.length) {
    return {
      facts: `Today: ${today}\nNo visits are planned for today, so there is nothing to optimise.`,
      result: { kind: "route", stops: [], date: today, totalKm: 0 },
      systemPrompt:
        "You are QuickApp's Visit Optimiser agent. Reply with one short, friendly markdown line telling the user no visits are planned today.",
      userPrompt: "Optimise today's beat.",
    };
  }

  const { data: retailers } = await supabase
    .from("retailers")
    .select("id, name, beat_name, priority, pending_amount, last_visit_date, latitude, longitude")
    .in("id", retailerIds);

  const { data: histVisits } = await supabase
    .from("visits")
    .select("id, retailer_id, planned_date")
    .eq("user_id", userId)
    .in("retailer_id", retailerIds)
    .gte("planned_date", since)
    .lte("planned_date", today)
    .limit(2000);

  const { data: histOrders } = await supabase
    .from("orders")
    .select("id, retailer_id, visit_id, status, total_amount, order_date")
    .eq("user_id", userId)
    .in("retailer_id", retailerIds)
    .gte("order_date", since)
    .limit(2000);

  const visitCount = new Map<string, number>();
  (histVisits ?? []).forEach((v: any) => {
    const rid = String(v.retailer_id);
    visitCount.set(rid, (visitCount.get(rid) ?? 0) + 1);
  });

  const orderCount = new Map<string, number>();
  const orderValue = new Map<string, number>();
  (histOrders ?? []).forEach((o: any) => {
    if (!CONFIRMED.has(String(o.status ?? "").toLowerCase())) return;
    const rid = String(o.retailer_id);
    orderCount.set(rid, (orderCount.get(rid) ?? 0) + 1);
    orderValue.set(rid, (orderValue.get(rid) ?? 0) + num(o.total_amount));
  });

  const scored = (retailers ?? []).map((r: any) => {
    const rid = String(r.id);
    const visits = visitCount.get(rid) ?? 0;
    const orders = orderCount.get(rid) ?? 0;
    const productivity = visits ? orders / visits : 0;
    const daysSince = r.last_visit_date
      ? Math.max(0, Math.round((now.getTime() - new Date(r.last_visit_date).getTime()) / DAY_MS))
      : null;
    const pending = num(r.pending_amount);
    const priority = String(r.priority ?? "").toUpperCase();

    // Deterministic weighting: recency + dues + productivity + priority flag.
    const score =
      Math.min(30, (daysSince ?? 45) * 0.6) +
      Math.min(25, pending / 2000) +
      productivity * 25 +
      Math.min(10, num(orderValue.get(rid)) / 50000) +
      (priority === "A" ? 10 : priority === "B" ? 5 : 0);

    return {
      retailerId: rid,
      name: String(r.name ?? "Retailer"),
      beat: r.beat_name ?? null,
      priority: r.priority ?? null,
      pending,
      daysSinceLastVisit: daysSince,
      visits,
      orders,
      productivityPct: Math.round(productivity * 100),
      score: Math.round(score * 10) / 10,
      lat: r.latitude != null ? Number(r.latitude) : null,
      lng: r.longitude != null ? Number(r.longitude) : null,
    };
  });

  // Highest-scoring stop first, then nearest-neighbour geo ordering to cut travel.
  scored.sort((a, b) => b.score - a.score);
  const ordered: typeof scored = [];
  const pool = [...scored];
  let current = pool.shift();
  let totalKm = 0;
  while (current) {
    ordered.push(current);
    if (!pool.length) break;
    if (current.lat != null && current.lng != null) {
      let bestIdx = 0;
      let bestKm = Infinity;
      pool.forEach((p, i) => {
        if (p.lat == null || p.lng == null) return;
        const km = haversineKm([current!.lat!, current!.lng!], [p.lat, p.lng]);
        if (km < bestKm) {
          bestKm = km;
          bestIdx = i;
        }
      });
      if (Number.isFinite(bestKm)) totalKm += bestKm;
      current = pool.splice(bestIdx, 1)[0];
    } else {
      current = pool.shift();
    }
  }

  const stops = ordered.map((s, i) => ({ ...s, sequence: i + 1 }));

  const facts = [
    `Today: ${today}`,
    `Planned stops: ${stops.length}. Estimated route distance after optimisation: ${totalKm.toFixed(1)} km.`,
    "",
    "### Optimised stop order (score = recency + pending dues + productivity + priority)",
    stops
      .slice(0, 12)
      .map(
        (s) =>
          `${s.sequence}. ${s.name}${s.beat ? ` (${s.beat})` : ""} — score ${s.score}, ` +
          `last visited ${s.daysSinceLastVisit ?? "never"}${s.daysSinceLastVisit != null ? "d ago" : ""}, ` +
          `pending ${inr(s.pending)}, ${s.orders}/${s.visits} visits productive (${s.productivityPct}%)`,
      )
      .join("\n"),
  ].join("\n");

  return {
    facts,
    result: { kind: "route", stops, date: today, totalKm: Math.round(totalKm * 10) / 10 },
    systemPrompt:
      "You are QuickApp's Visit Optimiser agent. Use ONLY the figures in the DATA block — never invent retailers, numbers or distances. " +
      "Use ₹ for currency. Reply in compact markdown: one headline line, then up to five bullets explaining why the top stops come first, " +
      "then a single line starting with 'Suggested step:'. Keep it under 150 words and stay encouraging.",
    userPrompt: "Explain the optimised order for today's beat.",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "method_not_allowed", "Use POST");

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return jsonError(401, "unauthorized", "Missing bearer token");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  let executionId: string | null = null;
  const startedAt = Date.now();

  try {
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    const userId = (claims as any)?.claims?.sub as string | undefined;
    if (claimsError || !userId) return jsonError(401, "unauthorized", "Invalid session");

    const body = await req.json().catch(() => ({}));
    const agentKey = String((body as any)?.agentKey ?? "");
    if (!SUPPORTED.has(agentKey)) {
      return jsonError(400, "unsupported_agent", "This agent cannot be simulated yet");
    }

    const { data: agent } = await supabase
      .from("ai_agents")
      .select("id, key, name")
      .eq("key", agentKey)
      .maybeSingle();
    if (!agent) return jsonError(404, "agent_not_found", "Agent not found");

    const { data: execRow, error: execError } = await supabase
      .from("workflow_executions")
      .insert({
        agent_id: (agent as any).id,
        stage: "simulation",
        status: "running",
        triggered_by: userId,
      })
      .select("id")
      .single();
    if (execError) throw execError;
    executionId = (execRow as any).id;

    const run =
      agentKey === "churn_detector"
        ? await runChurnDetector(supabase, userId)
        : await runVisitOptimiser(supabase, userId);

    // Narration only — never calculation.
    let summary = "";
    const apiKey = Deno.env.get("TOGETHER_API_KEY");
    if (apiKey) {
      try {
        const messages: ChatMessage[] = [
          { role: "system", content: run.systemPrompt },
          { role: "user", content: `DATA\n---\n${run.facts}\n---\n${run.userPrompt}` },
        ];
        const stream = await streamChat({ apiKey, messages, signal: req.signal });
        const drain = (async () => {
          const reader = stream.tokens.getReader();
          while (true) {
            const { done } = await reader.read();
            if (done) return;
          }
        })();
        const [text] = await Promise.all([stream.fullText, drain]);
        summary = text.trim();
      } catch (aiErr) {
        console.error("[ai-workflow-run] narration failed:", aiErr);
      }
    }

    const durationMs = Date.now() - startedAt;
    const result = { ...run.result, summary };

    await supabase
      .from("workflow_executions")
      .update({
        status: "success",
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        result,
      })
      .eq("id", executionId);

    return new Response(
      JSON.stringify({ executionId, agentKey, stage: "simulation", durationMs, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message =
      err instanceof TogetherError
        ? `AI provider request failed (${err.code})`
        : err instanceof Error
          ? err.message
          : "Unknown error";
    console.error("[ai-workflow-run] failed:", err);

    if (executionId) {
      await supabase
        .from("workflow_executions")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          error_message: message.slice(0, 500),
        })
        .eq("id", executionId)
        .then(() => {}, () => {});
    }
    return jsonError(500, "execution_failed", message);
  }
});
