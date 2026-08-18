// QuickApp AI — per-retailer pitch suggestions for the Order Entry page.
//
// Same architecture as the ai-workflow-run agents (Visit Optimiser / Churn
// Detector / Sales Coach): every suggestion is computed DETERMINISTICALLY
// from SQL data under the caller's RLS-scoped client, and Together.ai only
// narrates the computed facts — it never picks products or invents numbers.
// Read-only: no tables are modified.
//
// Signals (the "simulation considerations" of this endpoint):
// - The retailer's own purchase history (last 180 days): products bought,
//   average quantity per order, days since last purchase → reorder-due items.
// - The rep's confirmed top sellers (last 90 days) the retailer is NOT yet
//   buying → gap products, the same calculation the Sales Coach agent uses.
// - Store-name/category affinity: keyword match between the retailer's name
//   or category and product names (e.g. "Medical store" → pharma items).
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  streamChat,
  TogetherError,
  type ChatMessage,
} from "../_shared/together/togetherClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONFIRMED = new Set(["confirmed", "delivered", "invoiced", "completed", "dispatched", "packed"]);
const DAY_MS = 86_400_000;
const MAX_SUGGESTIONS = 6;
const REORDER_DUE_DAYS = 14;

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

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Store-type keywords → product-name keywords. Deterministic affinity only. */
const AFFINITY: Array<{ store: string[]; product: string[] }> = [
  { store: ["medical", "pharma", "pharmacy", "chemist", "clinic", "hospital"], product: ["medicine", "tablet", "syrup", "capsule", "ointment", "balm", "antiseptic", "bandage", "pharma", "ayurved", "churna"] },
  { store: ["bakery", "bake", "cake"], product: ["bread", "biscuit", "cake", "rusk", "bun", "cookie", "cream"] },
  { store: ["dairy", "milk"], product: ["milk", "ghee", "butter", "paneer", "curd", "cheese"] },
  { store: ["hotel", "restaurant", "canteen", "mess", "cafe", "tea"], product: ["masala", "spice", "oil", "rice", "atta", "tea", "coffee", "powder"] },
  { store: ["stationery", "book"], product: ["pen", "pencil", "notebook", "paper", "book"] },
  { store: ["cosmetic", "beauty", "fancy"], product: ["soap", "shampoo", "cream", "powder", "lotion", "perfume", "oil"] },
];

interface Suggestion {
  productId: string;
  name: string;
  qty: number;
  unit: string;
  tag: "reorder" | "top_seller" | "store_match";
  reason: string;
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

  try {
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    const userId = (claims as any)?.claims?.sub as string | undefined;
    if (claimsError || !userId) return jsonError(401, "unauthorized", "Invalid session");

    const body = await req.json().catch(() => ({}));
    const retailerId = String((body as any)?.retailerId ?? "");
    if (!retailerId) return jsonError(400, "missing_retailer", "retailerId is required");

    const { data: retailer } = await supabase
      .from("retailers")
      .select("id, name, category")
      .eq("id", retailerId)
      .maybeSingle();
    if (!retailer) return jsonError(404, "retailer_not_found", "Retailer not found");
    const retailerName = String((retailer as any).name ?? "Retailer");
    const retailerCategory = String((retailer as any).category ?? "");

    const now = new Date();
    const today = isoDate(now);
    const since90 = isoDate(new Date(now.getTime() - 90 * DAY_MS));
    const since180 = isoDate(new Date(now.getTime() - 180 * DAY_MS));

    // ---- Rep's confirmed orders, last 90 days (Sales Coach pattern) ----
    const { data: repOrders, error: repErr } = await supabase
      .from("orders")
      .select("id, retailer_id, status, order_date")
      .eq("user_id", userId)
      .gte("order_date", since90)
      .lte("order_date", today)
      .order("order_date", { ascending: false })
      .limit(2000);
    if (repErr) throw repErr;
    const repConfirmed = (repOrders ?? []).filter((o: any) =>
      CONFIRMED.has(String(o.status ?? "").toLowerCase()));
    const repOrderIds = repConfirmed.map((o: any) => String(o.id)).slice(0, 1000);

    interface ProdAgg { id: string | null; name: string; unit: string; value: number; qty: number; lines: number }
    const repProducts = new Map<string, ProdAgg>();
    if (repOrderIds.length) {
      const { data: items } = await supabase
        .from("order_items")
        .select("order_id, product_id, product_name, quantity, total, unit")
        .in("order_id", repOrderIds)
        .limit(8000);
      (items ?? []).forEach((it: any) => {
        const name = String(it.product_name ?? "").trim();
        if (!name) return;
        const key = name.toLowerCase();
        const agg = repProducts.get(key) ?? { id: null, name, unit: "", value: 0, qty: 0, lines: 0 };
        if (!agg.id && it.product_id) agg.id = String(it.product_id);
        if (!agg.unit && it.unit) agg.unit = String(it.unit);
        agg.value += num(it.total);
        agg.qty += num(it.quantity);
        agg.lines += 1;
        repProducts.set(key, agg);
      });
    }
    const topSellers = [...repProducts.values()]
      .filter((p) => p.id)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // ---- This retailer's purchases, last 180 days ----
    const { data: retOrders } = await supabase
      .from("orders")
      .select("id, status, order_date")
      .eq("user_id", userId)
      .eq("retailer_id", retailerId)
      .gte("order_date", since180)
      .lte("order_date", today)
      .order("order_date", { ascending: false })
      .limit(500);
    const retConfirmed = (retOrders ?? []).filter((o: any) =>
      CONFIRMED.has(String(o.status ?? "").toLowerCase()));
    const retOrderDate = new Map<string, string>();
    retConfirmed.forEach((o: any) => retOrderDate.set(String(o.id), String(o.order_date ?? "")));

    interface RetAgg { id: string | null; name: string; unit: string; qty: number; lines: number; lastDate: string }
    const retProducts = new Map<string, RetAgg>();
    const retOrderIds = [...retOrderDate.keys()].slice(0, 500);
    if (retOrderIds.length) {
      const { data: items } = await supabase
        .from("order_items")
        .select("order_id, product_id, product_name, quantity, unit")
        .in("order_id", retOrderIds)
        .limit(4000);
      (items ?? []).forEach((it: any) => {
        const name = String(it.product_name ?? "").trim();
        if (!name) return;
        const key = name.toLowerCase();
        const date = retOrderDate.get(String(it.order_id)) ?? "";
        const agg = retProducts.get(key) ?? { id: null, name, unit: "", qty: 0, lines: 0, lastDate: "" };
        if (!agg.id && it.product_id) agg.id = String(it.product_id);
        if (!agg.unit && it.unit) agg.unit = String(it.unit);
        agg.qty += num(it.quantity);
        agg.lines += 1;
        if (date > agg.lastDate) agg.lastDate = date;
        retProducts.set(key, agg);
      });
    }

    // ---- Products master for affinity + id/unit resolution ----
    const { data: master } = await supabase
      .from("products")
      .select("id, name, rate, base_unit")
      .or("is_active.eq.true,is_active.is.null")
      .limit(1000);
    const masterByName = new Map<string, { id: string; name: string; unit: string }>();
    (master ?? []).forEach((p: any) => {
      const name = String(p.name ?? "").trim();
      if (name) masterByName.set(name.toLowerCase(), { id: String(p.id), name, unit: String(p.base_unit ?? "") });
    });

    // ---- Build suggestions, priority: reorder-due → top-seller gaps → affinity ----
    const suggestions: Suggestion[] = [];
    const used = new Set<string>();
    const push = (s: Suggestion) => {
      const key = s.name.toLowerCase();
      if (used.has(key) || suggestions.length >= MAX_SUGGESTIONS) return;
      used.add(key);
      suggestions.push(s);
    };

    // 1. Reorder-due: bought before, quiet for REORDER_DUE_DAYS+.
    [...retProducts.values()]
      .filter((p) => p.id && p.lastDate)
      .map((p) => ({
        ...p,
        daysSince: Math.round((now.getTime() - new Date(`${p.lastDate}T00:00:00Z`).getTime()) / DAY_MS),
        avgQty: Math.max(1, Math.round(p.qty / Math.max(1, p.lines))),
      }))
      .filter((p) => p.daysSince >= REORDER_DUE_DAYS)
      .sort((a, b) => b.daysSince - a.daysSince)
      .forEach((p) =>
        push({
          productId: p.id!,
          name: p.name,
          qty: p.avgQty,
          unit: p.unit || masterByName.get(p.name.toLowerCase())?.unit || "",
          tag: "reorder",
          reason: `Bought ${p.lines}× before, last ${p.daysSince}d ago — likely due to reorder (usual qty ${p.avgQty})`,
        }));

    // 2. Gap products: rep's top sellers the retailer hasn't bought yet.
    topSellers
      .filter((p) => !retProducts.has(p.name.toLowerCase()))
      .forEach((p) =>
        push({
          productId: p.id!,
          name: p.name,
          qty: Math.max(1, Math.round(p.qty / Math.max(1, p.lines))),
          unit: p.unit || masterByName.get(p.name.toLowerCase())?.unit || "",
          tag: "top_seller",
          reason: `Your top seller (₹${Math.round(p.value).toLocaleString("en-IN")} in 90d) this store doesn't buy yet`,
        }));

    // 3. Store-name/category affinity from the products master.
    const storeText = `${retailerName} ${retailerCategory}`.toLowerCase();
    const productKeywords = new Set<string>();
    AFFINITY.forEach((a) => {
      if (a.store.some((k) => storeText.includes(k))) a.product.forEach((k) => productKeywords.add(k));
    });
    // Direct token overlap too (e.g. "Tea Stall" → products containing "tea").
    storeText.split(/[^a-z]+/).filter((t) => t.length > 3).forEach((t) => productKeywords.add(t));
    if (productKeywords.size) {
      (master ?? []).forEach((p: any) => {
        const pname = String(p.name ?? "").toLowerCase();
        if (!pname) return;
        const hit = [...productKeywords].find((k) => pname.includes(k));
        if (hit) {
          push({
            productId: String(p.id),
            name: String(p.name),
            qty: 1,
            unit: String(p.base_unit ?? ""),
            tag: "store_match",
            reason: `Matches this store's profile ("${hit}")`,
          });
        }
      });
    }

    // ---- Facts for narration (numbers computed above; AI only narrates) ----
    const tagLabel = { reorder: "Reorder due", top_seller: "Top-seller gap", store_match: "Store match" } as const;
    const facts = [
      `Today: ${today}`,
      `Retailer: ${retailerName}${retailerCategory ? ` (${retailerCategory})` : ""}.`,
      `Their confirmed orders in 180d: ${retConfirmed.length}; your confirmed orders analysed (90d): ${repConfirmed.length}.`,
      "",
      "### Suggested products to pitch",
      suggestions.length
        ? suggestions.map((s, i) => `${i + 1}. ${s.name} — qty ${s.qty}${s.unit ? ` ${s.unit}` : ""} [${tagLabel[s.tag]}] — ${s.reason}`).join("\n")
        : "- No suggestions could be computed for this retailer yet.",
    ].join("\n");

    let summary = "";
    const apiKey = Deno.env.get("TOGETHER_API_KEY");
    if (apiKey && suggestions.length) {
      try {
        const messages: ChatMessage[] = [
          {
            role: "system",
            content:
              "You are QuickApp's Pitch Assistant for field sales reps. Use ONLY the products and figures in the DATA block — " +
              "never invent products, retailers or numbers. Use ₹ for currency. Reply in compact markdown: one short headline, " +
              "then up to four bullets telling the rep how to pitch the listed products to this store and why, " +
              "then a single line starting with 'Suggested pitch:'. Keep it under 120 words, friendly and practical.",
          },
          { role: "user", content: `DATA\n---\n${facts}\n---\nCoach me on what to pitch at this store right now.` },
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
        console.error("[ai-pitch-suggestions] narration failed:", aiErr);
      }
    }

    return new Response(
      JSON.stringify({
        kind: "pitch",
        retailerId,
        retailerName,
        date: today,
        suggestions,
        summary,
        analysed: { retailerOrders: retConfirmed.length, repOrders: repConfirmed.length },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message =
      err instanceof TogetherError
        ? `AI provider request failed (${err.code})`
        : err instanceof Error
          ? err.message
          : "Unknown error";
    console.error("[ai-pitch-suggestions] failed:", err);
    return jsonError(500, "pitch_failed", message);
  }
});
