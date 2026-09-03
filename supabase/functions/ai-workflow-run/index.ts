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
// A retailer counts as "newly added" for this many days after creation —
// shared by the Visit Optimiser newcomer pitch lines and the Beat Planner
// per-beat newcomer counts.
const NEW_RETAILER_DAYS = 14;

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

interface Newcomer {
  retailerId: string;
  name: string;
  beat: string;
  category: string;
  createdAt: string;
  daysOld: number;
  /** Friendly AI pitch reminder for this newcomer (fallback template if the
   * provider is unavailable). */
  line: string;
}

/** Retailers added to a beat within the last NEW_RETAILER_DAYS, newest first.
 * RLS scopes the query to what the caller may see. */
async function fetchNewcomers(supabase: any, now: Date): Promise<Newcomer[]> {
  const cutoff = new Date(now.getTime() - NEW_RETAILER_DAYS * DAY_MS).toISOString();
  const { data } = await supabase
    .from("retailers")
    .select("id, name, beat_name, category, created_at")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(12);
  return (data ?? [])
    .filter((r: any) => String(r.beat_name ?? "").trim())
    .map((r: any) => {
      const createdAt = String(r.created_at ?? "");
      const daysOld = createdAt
        ? Math.max(0, Math.round((now.getTime() - new Date(createdAt).getTime()) / DAY_MS))
        : 0;
      return {
        retailerId: String(r.id),
        name: String(r.name ?? "Retailer"),
        beat: String(r.beat_name).trim(),
        category: String(r.category ?? "").trim(),
        createdAt,
        daysOld,
        line: "",
      };
    });
}

/** Rep's confirmed top products by value in the last 30 days (names only) —
 * the honest opener list newcomer pitch lines may reference. */
async function fetchTopProductNames(
  supabase: any,
  userId: string,
  sinceIso: string,
  todayIso: string,
): Promise<string[]> {
  const { data: orders } = await supabase
    .from("orders")
    .select("id, status")
    .eq("user_id", userId)
    .gte("order_date", sinceIso)
    .lte("order_date", todayIso)
    .limit(1000);
  const ids = (orders ?? [])
    .filter((o: any) => CONFIRMED.has(String(o.status ?? "").toLowerCase()))
    .map((o: any) => String(o.id))
    .slice(0, 800);
  if (!ids.length) return [];
  const { data: items } = await supabase
    .from("order_items")
    .select("order_id, product_name, total")
    .in("order_id", ids)
    .limit(6000);
  const byName = new Map<string, number>();
  (items ?? []).forEach((it: any) => {
    const name = String(it.product_name ?? "").trim();
    if (name) byName.set(name, (byName.get(name) ?? 0) + num(it.total));
  });
  return [...byName.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);
}

function newcomerFallbackLine(n: Newcomer, topProducts: string[], idx: number): string {
  const age = n.daysOld === 0 ? "today" : `${n.daysOld} day${n.daysOld === 1 ? "" : "s"} ago`;
  const opener = topProducts.length ? topProducts[0] : "";
  // Rotating variants so fallback wording doesn't read identically card to card.
  const variants = [
    `Fresh face on your ${n.beat} beat — they joined ${age}! A warm first pitch sets the tone${opener ? `, and ${opener} makes a great opener` : ""}.`,
    `Just joined ${n.beat} ${age} — perfect time to introduce yourself and learn what this store sells best${opener ? `. Try leading with ${opener}!` : "!"}`,
    `Brand-new on ${n.beat} (added ${age})! First impressions count — bring your friendliest pitch${opener ? ` and a sample of ${opener}` : ""}.`,
  ];
  return variants[idx % variants.length];
}

/** One friendly AI pitch line per newcomer. The model personalises wording
 * to each store's name/category but may only mention products from the
 * rep's own top-seller list — it never invents products or numbers. Every
 * newcomer always keeps a deterministic fallback line, so a provider
 * failure degrades wording, not the feature. */
async function generateNewcomerLines(newcomers: Newcomer[], topProducts: string[]) {
  newcomers.forEach((n, i) => {
    n.line = newcomerFallbackLine(n, topProducts, i);
  });
  const apiKey = Deno.env.get("TOGETHER_API_KEY");
  if (!apiKey || !newcomers.length) return;
  try {
    const payload = {
      newRetailers: newcomers.map((n) => ({
        retailerId: n.retailerId,
        name: n.name,
        beat: n.beat,
        category: n.category || undefined,
        daysOld: n.daysOld,
      })),
      yourTopProducts: topProducts,
    };
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You write one short, friendly reminder line per newly added retailer for a field sales rep's visit list. " +
          "Each line must (a) convey warmly that the store recently joined the rep's beat, (b) suggest a concrete pitching opportunity personalised to that store's name/category, and " +
          "(c) mention at most two product names, ONLY from yourTopProducts — never invent products, prices or facts. Under 35 words, warm and encouraging, an exclamation mark where natural, no pressure language. " +
          "STYLE: simple, everyday Indian English a field salesperson understands at first read — short sentences, common words only, no idioms or fancy phrases (avoid wording like 'pencilled in', 'swing by', 'leads the way'). " +
          'CRITICAL: make each line feel personally written — no two lines may open with the same words, and never open with "New retailer" or "New store". ' +
          'Return STRICT JSON only — an array like [{"retailerId":"...","line":"..."}] covering every retailer. No markdown, no extra keys, no commentary.',
      },
      { role: "user", content: JSON.stringify(payload) },
    ];
    const stream = await streamChat({ apiKey, messages });
    const drain = (async () => {
      const reader = stream.tokens.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) return;
      }
    })();
    const [text] = await Promise.all([stream.fullText, drain]);
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return;
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return;
    const byId = new Map<string, string>();
    arr.forEach((e: any) => {
      const id = String(e?.retailerId ?? "");
      const line = String(e?.line ?? "").trim();
      if (id && line) byId.set(id, line.slice(0, 240));
    });
    newcomers.forEach((n) => {
      const line = byId.get(n.retailerId);
      if (line) n.line = line;
    });
  } catch (err) {
    console.error("[ai-workflow-run] newcomer line generation failed:", err);
  }
}

/** Near-tie groups for the Visit Optimiser: connected components of the
 * <= 1.0 km proximity graph (edges = stop pairs within 1.0 km by the existing
 * haversineKm). Stops without coordinates form no edges (singletons).
 * Deterministic — the AI never interprets "near". */
function nearTieComponents(stops: Array<{ lat: number | null; lng: number | null }>): number[] {
  const n = stops.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = stops[i];
      const b = stops[j];
      if (
        a.lat != null && a.lng != null && b.lat != null && b.lng != null &&
        haversineKm([a.lat, a.lng], [b.lat, b.lng]) <= 1.0
      ) {
        parent[find(i)] = find(j);
      }
    }
  }
  return stops.map((_, i) => find(i));
}

/** AI-selected day ordering over the deterministic baseline route.
 *
 * The policy is FIXED server-side — the AI selects the day's ordering from
 * the deterministic facts, it never invents policy, calculates, or alters
 * facts: (1) proximity governs the macro-route — stops in DIFFERENT
 * near-tie components must retain their baseline relative ordering;
 * (2) typical order time is preferred within a component and for the start;
 * (3) deterministic score breaks remaining ties.
 *
 * Two-layer deterministic validation: the returned order must be an exact
 * permutation of 1..N, AND every cross-component pair must keep its baseline
 * relative order (reordering is permitted only within a component). Any
 * failure — parse, validation, provider — returns null and the caller keeps
 * the deterministic baseline; the run never fails because of this step. */
async function aiOrderStops<
  T extends {
    name: string;
    score: number;
    pending: number;
    productivityPct: number;
    typicalOrderTime?: string | null;
    lat: number | null;
    lng: number | null;
  },
>(baseline: T[], apiKey: string): Promise<{ stops: T[]; note: string } | null> {
  try {
    const comp = nearTieComponents(baseline);
    const lines = baseline
      .map((s, i) => {
        const prev = i > 0 ? baseline[i - 1] : null;
        const dPrev =
          prev && prev.lat != null && prev.lng != null && s.lat != null && s.lng != null
            ? `${haversineKm([prev.lat, prev.lng], [s.lat, s.lng]).toFixed(1)} km from the previous stop`
            : "distance from the previous stop unknown";
        return (
          `${i + 1}. ${s.name} — near-tie group ${comp[i]}, ` +
          `${s.typicalOrderTime ? `usually orders around ${s.typicalOrderTime}` : "no typical order time"}, ` +
          `score ${s.score}, pending ${inr(s.pending)}, ${s.productivityPct}% strike rate, ${dPrev}`
        );
      })
      .join("\n");
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You order a field sales rep's visit stops for the day. The numbered STOPS are the COMPLETE candidate list in deterministic " +
          "baseline order — you may not add or remove stops and you may not change any stated fact; you may ONLY choose the visiting order. " +
          "FIXED policy: (1) proximity governs the macro-route — stops belonging to DIFFERENT near-tie groups must retain their baseline " +
          "relative ordering, never move a distant stop earlier just because it orders earlier in the day; (2) WITHIN a near-tie group " +
          "(stores within about 1 km of each other), stores with earlier typical order times come first; (3) break remaining ties by " +
          "higher score. " +
          'Also write "lines": one warm, personalised line for EACH stop, indexed by STOP NUMBER from the numbered STOPS list above — ' +
          "lines[0] describes stop 1, lines[1] describes stop 2, and so on, REGARDLESS of the visiting order you chose. Each line must be " +
          "about that one store ONLY: never mention any other stop's name, and never describe the route sequence (no 'next', 'then', " +
          "'start with', 'finish with', 'head to'). Each line MUST include at least two of that stop's stated facts WITH their numbers " +
          "(its typical order time, last visit, pending amount or strike rate — never invented details), plus one small concrete " +
          "suggestion, an exclamation mark where it feels natural, under 32 words. STYLE: simple, everyday Indian English a field " +
          "salesperson understands at first read — short sentences, common words only, no idioms or fancy phrases (avoid wording like " +
          "'pencilled in', 'swing by', 'make it count'). " +
          "CRITICAL: vary the wording — no two lines may open with the same words, and never open " +
          'with "AI Visit Optimiser", "This stop", or the store name pattern repeated across lines. ' +
          'Return STRICT JSON only: {"order":[<every stop number exactly once>],"note":"one short friendly line explaining the ordering",' +
          '"lines":["<line for stop 1>", ...]} — no markdown, no extra keys.',
      },
      { role: "user", content: `STOPS\n---\n${lines}\n---\nChoose the visiting order.` },
    ];
    const stream = await streamChat({ apiKey, messages });
    const drain = (async () => {
      const reader = stream.tokens.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) return;
      }
    })();
    const [text] = await Promise.all([stream.fullText, drain]);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const order: number[] = Array.isArray(parsed?.order)
      ? parsed.order.map((v: unknown) => Math.round(Number(v)))
      : [];
    // Layer 1: exact permutation of 1..N.
    if (
      order.length !== baseline.length ||
      new Set(order).size !== baseline.length ||
      order.some((v) => !Number.isInteger(v) || v < 1 || v > baseline.length)
    ) {
      return null;
    }
    // Layer 2: cross-component pairs keep their baseline relative order.
    for (let a = 0; a < order.length; a++) {
      for (let b = a + 1; b < order.length; b++) {
        const i = order[a] - 1;
        const j = order[b] - 1;
        if (comp[i] !== comp[j] && i > j) return null;
      }
    }
    const note = String(parsed?.note ?? "").trim().slice(0, 220);
    // Optional per-stop lines (display wording only, facts unchanged):
    // lines[k] belongs to stop number k+1. Missing/short arrays simply leave
    // those stops on the client's fallback wording.
    //
    // Deterministic per-line validation: a line may only describe its own
    // stop. Any line that names another stop, carries no number at all
    // (every stated fact is numeric), or is route-sequence narration is
    // blanked — a blank falls back to the client's detailed deterministic
    // sentence, so cards never show wrong-store or content-free lines.
    const GENERIC_NAME_WORDS = new Set([
      "store", "stores", "shop", "shoppe", "mart", "marts", "super", "market",
      "supermarket", "retailer", "retailers", "traders", "trading", "general",
      "departmental", "department", "medicals", "medical", "agencies", "agency",
      "kirana", "enterprises", "provision", "provisions", "bazar", "bazaar",
    ]);
    const nameWords = (n: string) =>
      String(n).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC_NAME_WORDS.has(w));
    const ROUTE_TALK = /\b(next|then|afterwards|after that|start with|finish with|end with|head to|follow up)\b/i;
    const aiLines: unknown[] = Array.isArray(parsed?.lines) ? parsed.lines : [];
    baseline.forEach((s, k) => {
      let line = typeof aiLines[k] === "string" ? String(aiLines[k]).trim().slice(0, 240) : "";
      if (line) {
        const lowerLine = line.toLowerCase();
        const own = new Set(nameWords(s.name));
        const mentionsOtherStop = baseline.some(
          (b, i) => i !== k && nameWords(b.name).some((w) => !own.has(w) && lowerLine.includes(w)),
        );
        if (mentionsOtherStop || !/\d/.test(line) || ROUTE_TALK.test(line)) line = "";
      }
      (s as Record<string, unknown>).insightLine = line;
    });
    return { stops: order.map((n) => baseline[n - 1]), note };
  } catch (err) {
    console.error("[ai-workflow-run] AI stop ordering failed:", err);
    return null;
  }
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
    .order("created_at", { ascending: true });
  if (error) throw error;

  // Newly added retailers get a friendly AI pitch reminder regardless of
  // whether they are on today's route — /my-visits banners read this list
  // for whichever day's visits are on screen.
  const newcomers = await fetchNewcomers(supabase, now);
  if (newcomers.length) {
    const topProducts = await fetchTopProductNames(supabase, userId, since, today);
    await generateNewcomerLines(newcomers, topProducts);
  }
  const newcomerFacts = newcomers.length
    ? [
        "",
        `### Newly added retailers (last ${NEW_RETAILER_DAYS} days) — fresh pitching opportunities`,
        newcomers
          .map((n) => `- ${n.name} (${n.beat}${n.category ? `, ${n.category}` : ""}, added ${n.daysOld}d ago)`)
          .join("\n"),
      ]
    : [];

  // The day's route covers ALL retailers on the user's visit list — the same
  // set the My Visits page displays: retailers of the day's planned beats
  // (beat_plans + coordinator-assigned daily_beat_plans), explicit
  // beat_data.retailer_ids, and any retailer with an actual visit row today —
  // irrespective of visit status. Mirrors useVisitsDataOptimized.
  const { data: beatPlans } = await supabase
    .from("beat_plans")
    .select("beat_id, beat_data")
    .eq("user_id", userId)
    .eq("plan_date", today);

  const { data: dailyPlans } = await supabase
    .from("daily_beat_plans")
    .select("beat_id")
    .eq("assigned_user_id", userId)
    .eq("plan_date", today);

  const beatIds = [
    ...new Set(
      [...(beatPlans ?? []), ...(dailyPlans ?? [])]
        .map((b: any) => b.beat_id)
        .filter(Boolean)
        .map(String),
    ),
  ];

  let beatRetailerIds: string[] = [];
  if (beatIds.length) {
    const { data: beatRetailers } = await supabase
      .from("retailers")
      .select("id")
      .in("beat_id", beatIds);
    beatRetailerIds = (beatRetailers ?? []).map((r: any) => String(r.id));
  }

  const explicitIds = (beatPlans ?? []).flatMap((bp: any) =>
    Array.isArray(bp?.beat_data?.retailer_ids) ? bp.beat_data.retailer_ids.map(String) : [],
  );

  // INVARIANT: the candidate set is the COMPLETE deduplicated union of the
  // day's-list sources — no cap or limit may truncate it. Status, history,
  // and dues may influence the score/order below, never membership. Sorted
  // only for determinism (the client freshness check compares exact sets).
  // The AI ordering helper stays limited to 2-20 stops; above that the
  // deterministic route is the final ordering.
  const retailerIds = [
    ...new Set([
      ...(todayVisits ?? []).map((v: any) => v.retailer_id).filter(Boolean).map(String),
      ...beatRetailerIds,
      ...explicitIds,
    ]),
  ].sort();

  if (!retailerIds.length) {
    return {
      facts: [`Today: ${today}`, "No visits are planned for today, so there is nothing to optimise.", ...newcomerFacts].join("\n"),
      result: { kind: "route", stops: [], date: today, totalKm: 0, newRetailers: newcomers, routeNote: "" },
      systemPrompt:
        "You are QuickApp's Visit Optimiser agent. Use ONLY the DATA block. Reply with one short, friendly markdown line telling the user no visits are planned today" +
        (newcomers.length
          ? ", plus one warm line pointing out the newly added retailers as fresh pitching opportunities."
          : "."),
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
    .select("id, retailer_id, visit_id, status, total_amount, order_date, created_at")
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
  const orderHours = new Map<string, number[]>();
  (histOrders ?? []).forEach((o: any) => {
    if (!CONFIRMED.has(String(o.status ?? "").toLowerCase())) return;
    const rid = String(o.retailer_id);
    orderCount.set(rid, (orderCount.get(rid) ?? 0) + 1);
    orderValue.set(rid, (orderValue.get(rid) ?? 0) + num(o.total_amount));
    // Time-of-day signal: when does this store actually place orders?
    // (IST — order created_at shifted from UTC by +5:30.)
    if (o.created_at) {
      const t = new Date(o.created_at);
      if (!Number.isNaN(t.getTime())) {
        const istHour = (t.getUTCHours() * 60 + t.getUTCMinutes() + 330) / 60 % 24;
        const arr = orderHours.get(rid) ?? [];
        arr.push(istHour);
        orderHours.set(rid, arr);
      }
    }
  });

  const hourLabel = (h: number) => {
    const rounded = Math.round(h) % 24;
    const ampm = rounded >= 12 ? "PM" : "AM";
    const display = rounded % 12 === 0 ? 12 : rounded % 12;
    return `${display} ${ampm}`;
  };
  const typicalHour = (rid: string): number | null => {
    const arr = orderHours.get(rid);
    if (!arr?.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) / 2)];
  };

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

    const tHour = typicalHour(rid);
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
      typicalOrderHour: tHour,
      typicalOrderTime: tHour != null ? hourLabel(tHour) : null,
      lat: r.latitude != null ? Number(r.latitude) : null,
      lng: r.longitude != null ? Number(r.longitude) : null,
    };
  });

  // Highest-scoring stop first, then nearest-neighbour geo ordering to cut
  // travel. Among the strongest candidates, the route STARTS at the store
  // whose order history says it buys earliest in the day.
  scored.sort((a, b) => b.score - a.score);
  const ordered: typeof scored = [];
  const pool = [...scored];
  let startIdx = 0;
  let earliest = Infinity;
  pool.slice(0, 5).forEach((s, i) => {
    if (s.typicalOrderHour != null && s.typicalOrderHour < earliest) {
      earliest = s.typicalOrderHour;
      startIdx = i;
    }
  });
  let current = pool.length ? pool.splice(startIdx, 1)[0] : undefined;
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

  // AI-selected day ordering (additive; see aiOrderStops). The deterministic
  // route above stays the baseline and the fallback; the AI only chooses an
  // order within the fixed policy, validated deterministically. totalKm for
  // an accepted AI order is recomputed here — never by the model.
  let finalStops = stops;
  let routeNote = "";
  let aiAccepted = false;
  const orderApiKey = Deno.env.get("TOGETHER_API_KEY");
  if (orderApiKey && stops.length >= 2 && stops.length <= 20) {
    const aiOrdered = await aiOrderStops(stops, orderApiKey);
    if (aiOrdered) {
      finalStops = aiOrdered.stops.map((s, i) => ({ ...s, sequence: i + 1 }));
      routeNote = aiOrdered.note;
      aiAccepted = true;
    }
  }
  // Every stop carries insightLine (possibly "") so consumers can detect the
  // wording-capable schema; "" means the client uses its fallback wording.
  finalStops = finalStops.map((s) => ({ ...s, insightLine: (s as any).insightLine ?? "" }));
  let finalKm = Math.round(totalKm * 10) / 10;
  if (aiAccepted) {
    let km = 0;
    for (let i = 1; i < finalStops.length; i++) {
      const a = finalStops[i - 1];
      const b = finalStops[i];
      if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
        km += haversineKm([a.lat, a.lng], [b.lat, b.lng]);
      }
    }
    finalKm = Math.round(km * 10) / 10;
  }

  const facts = [
    `Today: ${today}`,
    `Planned stops: ${finalStops.length}. Estimated route distance after optimisation: ${finalKm.toFixed(1)} km.`,
    "",
    "### Optimised stop order (score = recency + pending dues + productivity + priority)",
    finalStops
      .slice(0, 12)
      .map(
        (s) =>
          `${s.sequence}. ${s.name}${s.beat ? ` (${s.beat})` : ""} — score ${s.score}, ` +
          `last visited ${s.daysSinceLastVisit ?? "never"}${s.daysSinceLastVisit != null ? "d ago" : ""}, ` +
          `pending ${inr(s.pending)}, ${s.orders}/${s.visits} visits productive (${s.productivityPct}%)` +
          `${s.typicalOrderTime ? `, usually orders around ${s.typicalOrderTime}` : ""}`,
      )
      .join("\n"),
    ...newcomerFacts,
  ].join("\n");

  return {
    facts,
    result: {
      kind: "route",
      stops: finalStops,
      date: today,
      totalKm: finalKm,
      newRetailers: newcomers,
      routeNote,
    },
    systemPrompt:
      "You are QuickApp's Visit Optimiser agent. Use ONLY the figures in the DATA block — never invent retailers, numbers or distances. " +
      "Use ₹ for currency. Reply in compact markdown: one headline line, then up to five bullets explaining why the top stops come first, " +
      "then, if the DATA lists newly added retailers, one warm bullet flagging them as fresh pitching opportunities, " +
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
    .select("id, name, beat_name, priority, pending_amount, last_visit_date, created_at")
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

  const newcomerCutoff = now.getTime() - NEW_RETAILER_DAYS * DAY_MS;

  interface BeatAgg {
    beat: string;
    retailers: number;
    visited30d: number;
    pending: number;
    orderValue: number;
    daysSinceSum: number;
    daysSinceCount: number;
    newRetailers: number;
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
      newRetailers: 0,
    };
    const rid = String(r.id);
    agg.retailers += 1;
    if (visited.has(rid)) agg.visited30d += 1;
    agg.pending += num(r.pending_amount);
    agg.orderValue += orderValue.get(rid) ?? 0;
    if (r.created_at && new Date(r.created_at).getTime() >= newcomerCutoff) {
      agg.newRetailers += 1;
    }
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
      newRetailers: b.newRetailers,
    }))
    .sort((a, b) => a.coveragePct - b.coveragePct || b.retailers - a.retailers)
    // Stored rows feed the per-beat card one-liners, so keep more than the
    // narration needs; the facts block below stays at 12.
    .slice(0, 40);

  const totalRetailers = (retailers ?? []).length;

  const facts = [
    `Today: ${today}`,
    `Retailers analysed: ${totalRetailers} across ${beats.size} beats. Coverage window: last 30 days of visits; order value: last 30 days (confirmed only).`,
    `Suggested visit days assume about ${STOPS_PER_DAY} stops per day.`,
    "",
    "### Beats ordered by lowest coverage first",
    rows
      .slice(0, 12)
      .map(
        (b) =>
          `- ${b.beat}: ${b.retailers} retailers, ${b.visited30d} visited in 30d (${b.coveragePct}% coverage), ` +
          `pending ${inr(b.pending)}, 30d orders ${inr(b.orderValue)}, ` +
          `avg ${b.avgDaysSinceVisit ?? "?"} days since last visit` +
          `${b.newRetailers ? `, ${b.newRetailers} newly added retailer(s) in the last ${NEW_RETAILER_DAYS}d` : ""}` +
          ` → suggest ${b.suggestedDays} visit day(s) next month`,
      )
      .join("\n"),
  ].join("\n");

  return {
    facts,
    result: { kind: "beat_plan", rows, date: today, totalRetailers },
    systemPrompt:
      "You are QuickApp's Beat Planner agent. Use ONLY the figures in the DATA block — never invent beats, retailers or numbers. " +
      "Use ₹ for currency. Reply in compact markdown: one headline line, then up to five bullets recommending which beats to prioritise next month and why — " +
      "where a beat has newly added retailers, call them out as fresh pitching opportunities — " +
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
    // Stored rows feed the per-retailer visit-card insights, so keep more
    // than the narration needs; the facts block below stays at 10.
    .slice(0, 40);

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
      .slice(0, 10)
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
    // PostgREST/Supabase errors are plain objects, not Error instances — read
    // their message/code so failures aren't reported as "Unknown error".
    const pg = err as { message?: unknown; code?: unknown } | null;
    const message =
      err instanceof TogetherError
        ? `AI provider request failed (${err.code})`
        : err instanceof Error
          ? err.message
          : typeof pg?.message === "string" && pg.message
            ? `${pg.message}${pg.code ? ` (${pg.code})` : ""}`
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
