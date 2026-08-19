// Deterministic analysis blocks for custom AI workflows ("Create Workflow").
//
// Self-contained by design: query shapes are CLONED from the frozen agent
// runners in index.ts rather than shared with them. Do not extract,
// consolidate, deduplicate or generalise logic between these blocks and the
// existing runners — the duplication is intentional so the agents stay
// behaviourally untouched. All queries run under the caller's RLS-scoped
// client; blocks compute every number themselves (the LLM only narrates).
import { z } from "npm:zod@3.23.8";

const CONFIRMED = new Set(["confirmed", "delivered", "invoiced", "completed", "dispatched", "packed"]);
const DAY_MS = 86_400_000;
const FACTS_CAP = 1200;

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

function capFacts(lines: string[]) {
  const text = lines.join("\n");
  return text.length > FACTS_CAP ? `${text.slice(0, FACTS_CAP)}\n… (truncated)` : text;
}

/** Param schema helper: missing/invalid values fall back to the default, and
 * everything is clamped into [min, max] — never rejected. */
const bounded = (min: number, max: number, def: number) =>
  z.preprocess(
    (v) => (typeof v === "number" && Number.isFinite(v) ? v : def),
    z.number().transform((v) => Math.min(max, Math.max(min, Math.round(v)))),
  );

export interface BlockOutput {
  type: string;
  title: string;
  /** Markdown facts for the narration DATA block (capped ~1200 chars). */
  facts: string;
  /** Pre-formatted display rows so the client renderer stays generic. */
  rows: Array<{ label: string; value: string; badge?: string }>;
  meta?: Record<string, unknown>;
}

export type BlockFn = (
  supabase: any,
  userId: string,
  params: Record<string, number>,
) => Promise<BlockOutput>;

/** Retailers whose order value dropped vs the preceding window. */
async function declining_retailers(supabase: any, userId: string, p: Record<string, number>): Promise<BlockOutput> {
  const now = new Date();
  const start = isoDate(new Date(now.getTime() - 2 * p.windowDays * DAY_MS));
  const cut = new Date(now.getTime() - p.windowDays * DAY_MS).getTime();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, retailer_id, total_amount, order_date, status")
    .eq("user_id", userId)
    .gte("order_date", start)
    .lte("order_date", isoDate(now))
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
    (t >= cut ? recent : prior).set(rid, ((t >= cut ? recent : prior).get(rid) ?? 0) + num(o.total_amount));
  });

  const ids = [...new Set([...recent.keys(), ...prior.keys()])];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: retailers } = await supabase
      .from("retailers").select("id, name").in("id", ids.slice(0, 1000));
    (retailers ?? []).forEach((r: any) => names.set(String(r.id), String(r.name ?? "Retailer")));
  }

  const rows = ids
    .map((rid) => {
      const recentValue = recent.get(rid) ?? 0;
      const priorValue = prior.get(rid) ?? 0;
      return {
        name: names.get(rid) ?? "Retailer",
        recentValue,
        priorValue,
        dropPct: priorValue > 0 ? Math.round(((priorValue - recentValue) / priorValue) * 100) : 0,
      };
    })
    .filter((r) => r.priorValue > 0 && r.recentValue < r.priorValue)
    .sort((a, b) => b.dropPct - a.dropPct || b.priorValue - a.priorValue)
    .slice(0, p.topN);

  const title = `Declining retailers — last ${p.windowDays}d vs the ${p.windowDays}d before`;
  return {
    type: "declining_retailers",
    title,
    facts: capFacts(rows.length
      ? rows.map((r) => `- ${r.name}: ${inr(r.priorValue)} → ${inr(r.recentValue)} (down ${r.dropPct}%)`)
      : ["- No retailer has reduced their order value in this window."]),
    rows: rows.map((r) => ({
      label: r.name,
      value: `${inr(r.priorValue)} → ${inr(r.recentValue)}`,
      badge: `-${r.dropPct}%`,
    })),
    meta: { analysed: ids.length },
  };
}

/** Top retailers by confirmed order value. */
async function top_retailers(supabase: any, userId: string, p: Record<string, number>): Promise<BlockOutput> {
  const now = new Date();
  const since = isoDate(new Date(now.getTime() - p.windowDays * DAY_MS));

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, retailer_id, status, total_amount, order_date")
    .eq("user_id", userId)
    .gte("order_date", since)
    .limit(4000);
  if (error) throw error;

  const value = new Map<string, number>();
  const count = new Map<string, number>();
  (orders ?? []).forEach((o: any) => {
    if (!CONFIRMED.has(String(o.status ?? "").toLowerCase())) return;
    const rid = String(o.retailer_id ?? "");
    if (!rid) return;
    value.set(rid, (value.get(rid) ?? 0) + num(o.total_amount));
    count.set(rid, (count.get(rid) ?? 0) + 1);
  });

  const ids = [...value.keys()];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: retailers } = await supabase
      .from("retailers").select("id, name").in("id", ids.slice(0, 1000));
    (retailers ?? []).forEach((r: any) => names.set(String(r.id), String(r.name ?? "Retailer")));
  }

  const rows = ids
    .map((rid) => ({ name: names.get(rid) ?? "Retailer", value: value.get(rid) ?? 0, orders: count.get(rid) ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, p.topN);

  const title = `Top retailers by confirmed order value — last ${p.windowDays}d`;
  return {
    type: "top_retailers",
    title,
    facts: capFacts(rows.length
      ? rows.map((r, i) => `${i + 1}. ${r.name}: ${inr(r.value)} across ${r.orders} order(s)`)
      : ["- No confirmed orders in this window."]),
    rows: rows.map((r) => ({ label: r.name, value: inr(r.value), badge: `${r.orders} orders` })),
    meta: { retailers: ids.length },
  };
}

/** Retailers with the highest outstanding dues. */
async function pending_dues(supabase: any, _userId: string, p: Record<string, number>): Promise<BlockOutput> {
  // RLS scopes retailers to what the caller may see (same as the beat planner runner).
  const { data: retailers, error } = await supabase
    .from("retailers")
    .select("id, name, beat_name, pending_amount")
    .limit(3000);
  if (error) throw error;

  const rows = (retailers ?? [])
    .map((r: any) => ({
      name: String(r.name ?? "Retailer"),
      beat: r.beat_name ? String(r.beat_name) : null,
      pending: num(r.pending_amount),
    }))
    .filter((r: any) => r.pending > 0 && r.pending >= p.minAmount)
    .sort((a: any, b: any) => b.pending - a.pending)
    .slice(0, p.topN);

  const title = p.minAmount > 0
    ? `Outstanding dues of ${inr(p.minAmount)} or more`
    : "Highest outstanding dues";
  return {
    type: "pending_dues",
    title,
    facts: capFacts(rows.length
      ? rows.map((r: any) => `- ${r.name}${r.beat ? ` (${r.beat})` : ""}: ${inr(r.pending)} pending`)
      : ["- No retailer currently has outstanding dues in this range."]),
    rows: rows.map((r: any) => ({
      label: r.beat ? `${r.name} (${r.beat})` : r.name,
      value: `${inr(r.pending)} pending`,
    })),
    meta: { analysed: (retailers ?? []).length },
  };
}

/** Beat coverage: share of each beat's retailers visited recently. */
async function beat_coverage(supabase: any, userId: string, p: Record<string, number>): Promise<BlockOutput> {
  const now = new Date();
  const since = isoDate(new Date(now.getTime() - p.coverageDays * DAY_MS));

  const { data: retailers, error } = await supabase
    .from("retailers")
    .select("id, name, beat_name, pending_amount, last_visit_date")
    .limit(3000);
  if (error) throw error;

  const { data: recentVisits } = await supabase
    .from("visits")
    .select("id, retailer_id, planned_date")
    .eq("user_id", userId)
    .gte("planned_date", since)
    .lte("planned_date", isoDate(now))
    .limit(3000);

  const visited = new Set<string>();
  (recentVisits ?? []).forEach((v: any) => {
    if (v.retailer_id) visited.add(String(v.retailer_id));
  });

  interface Agg { beat: string; retailers: number; visited: number; pending: number }
  const beats = new Map<string, Agg>();
  (retailers ?? []).forEach((r: any) => {
    const beat = String(r.beat_name ?? "").trim() || "Unassigned";
    const agg = beats.get(beat) ?? { beat, retailers: 0, visited: 0, pending: 0 };
    agg.retailers += 1;
    if (visited.has(String(r.id))) agg.visited += 1;
    agg.pending += num(r.pending_amount);
    beats.set(beat, agg);
  });

  const rows = [...beats.values()]
    .map((b) => ({
      ...b,
      coveragePct: b.retailers ? Math.round((b.visited / b.retailers) * 100) : 0,
      suggestedDays: Math.max(1, Math.ceil(b.retailers / p.stopsPerDay)),
    }))
    .sort((a, b) => a.coveragePct - b.coveragePct || b.retailers - a.retailers)
    .slice(0, 12);

  const title = `Beat coverage — last ${p.coverageDays}d, lowest first (~${p.stopsPerDay} stops/day)`;
  return {
    type: "beat_coverage",
    title,
    facts: capFacts(rows.length
      ? rows.map((b) =>
          `- ${b.beat}: ${b.visited}/${b.retailers} visited (${b.coveragePct}%), pending ${inr(b.pending)} → suggest ${b.suggestedDays} visit day(s)`)
      : ["- No retailers are visible to this user."]),
    rows: rows.map((b) => ({
      label: b.beat,
      value: `${b.visited}/${b.retailers} visited · pending ${inr(b.pending)} · ${b.suggestedDays} day(s) suggested`,
      badge: `${b.coveragePct}%`,
    })),
    meta: { beats: beats.size, totalRetailers: (retailers ?? []).length },
  };
}

/** Top products by line-item value across the rep's confirmed orders. */
async function product_mix(supabase: any, userId: string, p: Record<string, number>): Promise<BlockOutput> {
  const now = new Date();
  const since = isoDate(new Date(now.getTime() - p.windowDays * DAY_MS));

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, retailer_id, status, total_amount, order_date")
    .eq("user_id", userId)
    .gte("order_date", since)
    .lte("order_date", isoDate(now))
    .order("order_date", { ascending: false })
    .limit(2000);
  if (error) throw error;

  const confirmed = (orders ?? []).filter((o: any) =>
    CONFIRMED.has(String(o.status ?? "").toLowerCase()));
  const orderIds = confirmed.map((o: any) => String(o.id)).slice(0, 1000);

  const productValue = new Map<string, number>();
  const productQty = new Map<string, number>();
  if (orderIds.length) {
    const { data: items } = await supabase
      .from("order_items")
      .select("order_id, product_name, quantity, total")
      .in("order_id", orderIds)
      .limit(8000);
    (items ?? []).forEach((it: any) => {
      const product = String(it.product_name ?? "").trim();
      if (!product) return;
      productValue.set(product, (productValue.get(product) ?? 0) + num(it.total));
      productQty.set(product, (productQty.get(product) ?? 0) + num(it.quantity));
    });
  }

  const rows = [...productValue.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, p.topN)
    .map(([name, value]) => ({ name, value, qty: productQty.get(name) ?? 0 }));

  const title = `Top products by sales value — last ${p.windowDays}d`;
  return {
    type: "product_mix",
    title,
    facts: capFacts(rows.length
      ? rows.map((r, i) => `${i + 1}. ${r.name}: ${inr(r.value)} (${r.qty} units)`)
      : ["- No confirmed order line items in this window."]),
    rows: rows.map((r, i) => ({ label: r.name, value: `${inr(r.value)} · ${r.qty} units`, badge: `#${i + 1}` })),
    meta: { orders: confirmed.length },
  };
}

/** Visit productivity: orders won per visit, overall and per retailer. */
async function visit_productivity(supabase: any, userId: string, p: Record<string, number>): Promise<BlockOutput> {
  const now = new Date();
  const since = isoDate(new Date(now.getTime() - p.windowDays * DAY_MS));

  const { data: visits, error } = await supabase
    .from("visits")
    .select("id, retailer_id, planned_date")
    .eq("user_id", userId)
    .gte("planned_date", since)
    .lte("planned_date", isoDate(now))
    .limit(2000);
  if (error) throw error;

  const { data: orders } = await supabase
    .from("orders")
    .select("id, retailer_id, status, total_amount, order_date")
    .eq("user_id", userId)
    .gte("order_date", since)
    .limit(2000);

  const visitCount = new Map<string, number>();
  (visits ?? []).forEach((v: any) => {
    const rid = String(v.retailer_id ?? "");
    if (rid) visitCount.set(rid, (visitCount.get(rid) ?? 0) + 1);
  });

  const orderCount = new Map<string, number>();
  let orderValue = 0;
  let confirmedOrders = 0;
  (orders ?? []).forEach((o: any) => {
    if (!CONFIRMED.has(String(o.status ?? "").toLowerCase())) return;
    const rid = String(o.retailer_id ?? "");
    if (!rid) return;
    orderCount.set(rid, (orderCount.get(rid) ?? 0) + 1);
    orderValue += num(o.total_amount);
    confirmedOrders += 1;
  });

  const ids = [...visitCount.keys()];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: retailers } = await supabase
      .from("retailers").select("id, name").in("id", ids.slice(0, 1000));
    (retailers ?? []).forEach((r: any) => names.set(String(r.id), String(r.name ?? "Retailer")));
  }

  const totalVisits = (visits ?? []).length;
  const overallPct = totalVisits ? Math.round((confirmedOrders / totalVisits) * 100) : 0;

  const rows = ids
    .map((rid) => {
      const v = visitCount.get(rid) ?? 0;
      const o = orderCount.get(rid) ?? 0;
      return {
        name: names.get(rid) ?? "Retailer",
        visits: v,
        orders: o,
        pct: v ? Math.round((o / v) * 100) : 0,
      };
    })
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 10);

  const title = `Visit productivity — last ${p.windowDays}d`;
  return {
    type: "visit_productivity",
    title,
    facts: capFacts([
      `- Overall: ${confirmedOrders} confirmed order(s) from ${totalVisits} visit(s) (${overallPct}%), value ${inr(orderValue)}.`,
      ...rows.map((r) => `- ${r.name}: ${r.orders}/${r.visits} visits productive (${r.pct}%)`),
    ]),
    rows: [
      { label: "Overall", value: `${confirmedOrders}/${totalVisits} visits productive · ${inr(orderValue)}`, badge: `${overallPct}%` },
      ...rows.map((r) => ({ label: r.name, value: `${r.orders}/${r.visits} visits productive`, badge: `${r.pct}%` })),
    ],
    meta: { totalVisits, confirmedOrders },
  };
}

export const BLOCKS: Record<string, { fn: BlockFn; paramSchema: z.ZodTypeAny; label: string }> = {
  declining_retailers: {
    fn: declining_retailers,
    label: "Declining retailers",
    paramSchema: z.object({ windowDays: bounded(7, 180, 30), topN: bounded(3, 15, 10) }),
  },
  top_retailers: {
    fn: top_retailers,
    label: "Top retailers",
    paramSchema: z.object({ windowDays: bounded(7, 180, 30), topN: bounded(3, 15, 10) }),
  },
  pending_dues: {
    fn: pending_dues,
    label: "Pending dues",
    paramSchema: z.object({ minAmount: bounded(0, 100000, 0), topN: bounded(3, 15, 10) }),
  },
  beat_coverage: {
    fn: beat_coverage,
    label: "Beat coverage",
    paramSchema: z.object({ coverageDays: bounded(7, 90, 30), stopsPerDay: bounded(5, 60, 25) }),
  },
  product_mix: {
    fn: product_mix,
    label: "Product mix",
    paramSchema: z.object({ windowDays: bounded(7, 180, 30), topN: bounded(3, 10, 5) }),
  },
  visit_productivity: {
    fn: visit_productivity,
    label: "Visit productivity",
    paramSchema: z.object({ windowDays: bounded(7, 90, 30) }),
  },
};

export const BLOCK_KEYS = Object.keys(BLOCKS) as [string, ...string[]];
