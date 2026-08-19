// QuickApp AI Workflows — simulation runner.
// Deterministic SQL-derived facts first; Together.ai only narrates them.
// Read-only apart from logging one row in public.workflow_executions.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  streamChat,
  TogetherError,
  type ChatMessage,
} from "../_shared/together/togetherClient.ts";
import { parseWorkflowConfig, runCustomWorkflow } from "./customWorkflow.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONFIRMED = new Set(["confirmed", "delivered", "invoiced", "completed", "dispatched", "packed"]);
const DAY_MS = 86_400_000;
const SUPPORTED = new Set(["visit_optimiser", "churn_detector", "beat_planner", "sales_coach"]);

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

/** Churn Detector — same rules as the Copilot declining-retailer calculation.
 * Window: last 30 days vs the 30 days before (60 days of history). */
async function runChurnDetector(supabase: any, userId: string) {
  const now = new Date();
  const today = isoDate(now);
  const start60 = isoDate(new Date(now.getTime() - 60 * DAY_MS));
  const cut30 = new Date(now.getTime() - 30 * DAY_MS).getTime();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, retailer_id, total_amount, order_date, status")
    .eq("user_id", userId)
    .gte("order_date", start60)
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
    const bucket = t >= cut30 ? recent : prior;
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
    `Retailers analysed: ${ids.length} (last 60 days of orders, cancelled excluded).`,
    "",
    "### Declining retailers — last 30 days vs the 30 days before",
    rows.length
      ? rows
          .map(
            (r) =>
              `- ${r.name}: ${inr(r.priorValue)} → ${inr(r.recentValue)} (down ${r.dropPct}%)`,
          )
          .join("\n")
      : "- No retailer has reduced their order value over the last 30 days.",
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

/** Visit Optimiser — deterministic stop scoring on today's planned visits.
 * History window: last 30 days of visits and orders. */
async function runVisitOptimiser(supabase: any, userId: string) {
  const now = new Date();
  const today = isoDate(now);
  const since = isoDate(new Date(now.getTime() - 30 * DAY_MS));

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

/** Beat Planner — deterministic beat coverage analysis for next month's plan. */
async function runBeatPlanner(supabase: any, userId: string) {
  const now = new Date();
  const today = isoDate(now);
  const since30 = isoDate(new Date(now.getTime() - 30 * DAY_MS));
  const STOPS_PER_DAY = 25;

  // RLS scopes retailers to what the caller may see, same as the other runners.
  const { data: retailers, error } = await supabase
    .from("retailers")
    .select("id, name, beat_name, priority, pending_amount, last_visit_date")
    .limit(3000);
  if (error) throw error;

  if (!(retailers ?? []).length) {
    return {
      facts: `Today: ${today}\nNo retailers are visible to this user, so there is nothing to plan.`,
      result: { kind: "beat_plan", rows: [], date: today, totalRetailers: 0 },
      systemPrompt:
        "You are QuickApp's Beat Planner agent. Reply with one short, friendly markdown line telling the user there are no retailers to plan beats for yet.",
      userPrompt: "Draft next month's beat plan.",
    };
  }

  const { data: recentVisits } = await supabase
    .from("visits")
    .select("id, retailer_id, planned_date")
    .eq("user_id", userId)
    .gte("planned_date", since30)
    .lte("planned_date", today)
    .limit(3000);

  const { data: recentOrders } = await supabase
    .from("orders")
    .select("id, retailer_id, status, total_amount, order_date")
    .eq("user_id", userId)
    .gte("order_date", since30)
    .limit(4000);

  const visited = new Set<string>();
  (recentVisits ?? []).forEach((v: any) => {
    if (v.retailer_id) visited.add(String(v.retailer_id));
  });

  const orderValue = new Map<string, number>();
  (recentOrders ?? []).forEach((o: any) => {
    if (!CONFIRMED.has(String(o.status ?? "").toLowerCase())) return;
    const rid = String(o.retailer_id ?? "");
    if (!rid) return;
    orderValue.set(rid, (orderValue.get(rid) ?? 0) + num(o.total_amount));
  });

  interface BeatAgg {
    beat: string;
    retailers: number;
    visited30d: number;
    pending: number;
    orderValue: number;
    daysSinceSum: number;
    daysSinceCount: number;
  }
  const beats = new Map<string, BeatAgg>();
  (retailers ?? []).forEach((r: any) => {
    const beat = String(r.beat_name ?? "").trim() || "Unassigned";
    const agg = beats.get(beat) ?? {
      beat,
      retailers: 0,
      visited30d: 0,
      pending: 0,
      orderValue: 0,
      daysSinceSum: 0,
      daysSinceCount: 0,
    };
    const rid = String(r.id);
    agg.retailers += 1;
    if (visited.has(rid)) agg.visited30d += 1;
    agg.pending += num(r.pending_amount);
    agg.orderValue += orderValue.get(rid) ?? 0;
    if (r.last_visit_date) {
      agg.daysSinceSum += Math.max(
        0,
        Math.round((now.getTime() - new Date(r.last_visit_date).getTime()) / DAY_MS),
      );
      agg.daysSinceCount += 1;
    }
    beats.set(beat, agg);
  });

  const rows = [...beats.values()]
    .map((b) => ({
      beat: b.beat,
      retailers: b.retailers,
      visited30d: b.visited30d,
      coveragePct: b.retailers ? Math.round((b.visited30d / b.retailers) * 100) : 0,
      pending: Math.round(b.pending),
      orderValue: Math.round(b.orderValue),
      avgDaysSinceVisit: b.daysSinceCount ? Math.round(b.daysSinceSum / b.daysSinceCount) : null,
      suggestedDays: Math.max(1, Math.ceil(b.retailers / STOPS_PER_DAY)),
    }))
    .sort((a, b) => a.coveragePct - b.coveragePct || b.retailers - a.retailers)
    .slice(0, 12);

  const totalRetailers = (retailers ?? []).length;

  const facts = [
    `Today: ${today}`,
    `Retailers analysed: ${totalRetailers} across ${beats.size} beats. Coverage window: last 30 days of visits; order value: last 30 days (confirmed only).`,
    `Suggested visit days assume about ${STOPS_PER_DAY} stops per day.`,
    "",
    "### Beats ordered by lowest coverage first",
    rows
      .map(
        (b) =>
          `- ${b.beat}: ${b.retailers} retailers, ${b.visited30d} visited in 30d (${b.coveragePct}% coverage), ` +
          `pending ${inr(b.pending)}, 30d orders ${inr(b.orderValue)}, ` +
          `avg ${b.avgDaysSinceVisit ?? "?"} days since last visit → suggest ${b.suggestedDays} visit day(s) next month`,
      )
      .join("\n"),
  ].join("\n");

  return {
    facts,
    result: { kind: "beat_plan", rows, date: today, totalRetailers },
    systemPrompt:
      "You are QuickApp's Beat Planner agent. Use ONLY the figures in the DATA block — never invent beats, retailers or numbers. " +
      "Use ₹ for currency. Reply in compact markdown: one headline line, then up to five bullets recommending which beats to prioritise next month and why, " +
      "then a single line starting with 'Suggested step:'. Keep it under 150 words and stay practical.",
    userPrompt: "Draft next month's beat plan from my coverage data.",
  };
}

/** Sales Coach — deterministic product-mix analysis per retailer.
 * Window: last 30 days of confirmed orders. */
async function runSalesCoach(supabase: any, userId: string) {
  const now = new Date();
  const today = isoDate(now);
  const since30 = isoDate(new Date(now.getTime() - 30 * DAY_MS));

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, retailer_id, status, total_amount, order_date")
    .eq("user_id", userId)
    .gte("order_date", since30)
    .lte("order_date", today)
    .order("order_date", { ascending: false })
    .limit(2000);
  if (error) throw error;

  const confirmed = (orders ?? []).filter((o: any) =>
    CONFIRMED.has(String(o.status ?? "").toLowerCase()),
  );

  if (!confirmed.length) {
    return {
      facts: `Today: ${today}\nNo confirmed orders in the last 30 days, so there is nothing to coach on yet.`,
      result: { kind: "coach", rows: [], date: today, topProducts: [] },
      systemPrompt:
        "You are QuickApp's Sales Coach agent. Reply with one short, friendly markdown line telling the user there are no recent confirmed orders to coach on yet.",
      userPrompt: "Coach me on my product mix.",
    };
  }

  const orderRetailer = new Map<string, string>();
  const retailerValue = new Map<string, number>();
  confirmed.forEach((o: any) => {
    const rid = String(o.retailer_id ?? "");
    if (!rid) return;
    orderRetailer.set(String(o.id), rid);
    retailerValue.set(rid, (retailerValue.get(rid) ?? 0) + num(o.total_amount));
  });

  const orderIds = [...orderRetailer.keys()].slice(0, 1000);
  const { data: items } = await supabase
    .from("order_items")
    .select("order_id, product_name, quantity, total")
    .in("order_id", orderIds)
    .limit(8000);

  const productValue = new Map<string, number>();
  const retailerProducts = new Map<string, Map<string, number>>();
  (items ?? []).forEach((it: any) => {
    const rid = orderRetailer.get(String(it.order_id));
    const product = String(it.product_name ?? "").trim();
    if (!rid || !product) return;
    const value = num(it.total);
    productValue.set(product, (productValue.get(product) ?? 0) + value);
    const perRetailer = retailerProducts.get(rid) ?? new Map<string, number>();
    perRetailer.set(product, (perRetailer.get(product) ?? 0) + value);
    retailerProducts.set(rid, perRetailer);
  });

  const topProducts = [...productValue.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value: Math.round(value) }));

  const retailerIds = [...retailerValue.keys()];
  const names = new Map<string, string>();
  if (retailerIds.length) {
    const { data: retailers } = await supabase
      .from("retailers")
      .select("id, name")
      .in("id", retailerIds.slice(0, 1000));
    (retailers ?? []).forEach((r: any) => names.set(String(r.id), String(r.name ?? "Retailer")));
  }

  const rows = retailerIds
    .map((rid) => {
      const bought = retailerProducts.get(rid) ?? new Map<string, number>();
      const top = [...bought.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        retailerId: rid,
        name: names.get(rid) ?? "Retailer",
        orderValue: Math.round(retailerValue.get(rid) ?? 0),
        distinctProducts: bought.size,
        topProduct: top ? top[0] : null,
        gapProducts: topProducts
          .filter((p) => !bought.has(p.name))
          .slice(0, 3)
          .map((p) => p.name),
      };
    })
    .sort((a, b) => b.orderValue - a.orderValue)
    .slice(0, 10);

  const facts = [
    `Today: ${today}`,
    `Confirmed orders analysed: ${confirmed.length} across ${retailerIds.length} retailers (last 30 days).`,
    "",
    "### My top products by value",
    topProducts.length
      ? topProducts.map((p, i) => `${i + 1}. ${p.name} — ${inr(p.value)}`).join("\n")
      : "- No line items found.",
    "",
    "### Top retailers and their product mix",
    rows
      .map(
        (r) =>
          `- ${r.name}: ${inr(r.orderValue)} in 30d, ${r.distinctProducts} distinct product(s)` +
          `${r.topProduct ? `, buys mostly ${r.topProduct}` : ""}` +
          `${r.gapProducts.length ? `, not yet buying: ${r.gapProducts.join(", ")}` : ", already buys all top products"}`,
      )
      .join("\n"),
  ].join("\n");

  return {
    facts,
    result: { kind: "coach", rows, date: today, topProducts },
    systemPrompt:
      "You are QuickApp's Sales Coach agent. Use ONLY the figures in the DATA block — never invent retailers, products or numbers. " +
      "Use ₹ for currency. Reply in compact markdown: one headline line, then up to five bullets coaching the rep on which products to pitch to which retailers, " +
      "then a single line starting with 'Suggested step:'. Keep it under 150 words, stay encouraging and non-blaming.",
    userPrompt: "Coach me on pitch and product mix per retailer.",
  };
}

const RUNNERS: Record<
  string,
  (supabase: any, userId: string) => Promise<{
    facts: string;
    result: Record<string, unknown>;
    systemPrompt: string;
    userPrompt: string;
  }>
> = {
  churn_detector: runChurnDetector,
  visit_optimiser: runVisitOptimiser,
  beat_planner: runBeatPlanner,
  sales_coach: runSalesCoach,
};

/**
 * Custom-workflow execution branch ("Create Workflow"). Additive and
 * isolated: it clones the narration/logging/error tail of the agent path
 * instead of sharing it, so the existing agentKey path stays behaviourally
 * identical. All block queries run under the EXECUTING user's RLS-scoped
 * client, regardless of who created the workflow.
 */
async function handleCustomWorkflow(
  supabase: any,
  userId: string,
  workflowId: string,
  signal: AbortSignal,
): Promise<Response> {
  let executionId: string | null = null;
  const startedAt = Date.now();

  try {
    const { data: workflow, error: wfError } = await supabase
      .from("ai_workflows")
      .select("id, name, config, is_active")
      .eq("id", workflowId)
      .maybeSingle();
    if (wfError) throw wfError;
    if (!workflow) return jsonError(404, "workflow_not_found", "Workflow not found");
    if (!(workflow as any).is_active) {
      return jsonError(400, "workflow_inactive", "This workflow has been deactivated");
    }

    // Validate BEFORE logging an execution row so a broken config doesn't
    // pollute execution metrics with guaranteed failures.
    let cfg;
    try {
      cfg = parseWorkflowConfig((workflow as any).config);
    } catch {
      return jsonError(400, "invalid_config", "Workflow configuration is invalid");
    }

    const { data: execRow, error: execError } = await supabase
      .from("workflow_executions")
      .insert({
        workflow_id: (workflow as any).id,
        stage: "simulation",
        status: "running",
        triggered_by: userId,
      })
      .select("id")
      .single();
    if (execError) throw execError;
    executionId = (execRow as any).id;

    const run = await runCustomWorkflow(supabase, userId, workflow as any, cfg);

    // Narration only — never calculation (mirrors the agent path).
    let summary = "";
    const apiKey = Deno.env.get("TOGETHER_API_KEY");
    if (apiKey) {
      try {
        const messages: ChatMessage[] = [
          { role: "system", content: run.systemPrompt },
          { role: "user", content: `DATA\n---\n${run.facts}\n---\n${run.userPrompt}` },
        ];
        const stream = await streamChat({ apiKey, messages, signal });
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
        console.error("[ai-workflow-run] custom narration failed:", aiErr);
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
      JSON.stringify({ executionId, workflowId: (workflow as any).id, stage: "simulation", durationMs, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message =
      err instanceof TogetherError
        ? `AI provider request failed (${err.code})`
        : err instanceof Error
          ? err.message
          : "Unknown error";
    console.error("[ai-workflow-run] custom workflow failed:", err);

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

    // Additive branch for custom workflows (Create Workflow). The agentKey
    // path below is unchanged.
    const workflowId = String((body as any)?.workflowId ?? "");
    if (workflowId) {
      if (agentKey) {
        return jsonError(400, "ambiguous_target", "Send either agentKey or workflowId, not both");
      }
      return await handleCustomWorkflow(supabase, userId, workflowId, req.signal);
    }

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

    const run = await RUNNERS[agentKey](supabase, userId);

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
