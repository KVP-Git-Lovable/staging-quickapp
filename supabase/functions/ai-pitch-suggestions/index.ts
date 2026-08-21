// QuickApp AI — per-retailer pitch suggestions for the Order Entry page.
//
// Same architecture as the ai-workflow-run agents (Visit Optimiser / Churn
// Detector / Sales Coach): every candidate product, quantity and unit is
// computed DETERMINISTICALLY from SQL data under the caller's RLS-scoped
// client. Together.ai then SELECTS which candidates fit this specific store
// and writes the personalised reasons — it can only choose from the
// deterministic candidate list, never invent products, quantities or numbers.
// If the provider is unavailable the deterministic priority order ships as-is.
// Read-only: no tables are modified.
//
// Signals (the "simulation considerations" of this endpoint):
// - The retailer's own purchase history (last 180 days): products bought,
//   typical line quantity, days since last purchase → reorder-due items.
// - The rep's confirmed top sellers (last 90 days) the retailer is NOT yet
//   buying → gap products, the same calculation the Sales Coach agent uses.
// - Beat favourites: what OTHER stores on the same beat ordered in the last
//   30 days — the opener signal for newly added retailers with no history.
// - Store-name/category affinity: keyword match between the retailer's name
//   or category and product names (e.g. "Medical store" → pharma items).
// - New-retailer mode: a retailer created within the last 14 days gets a
//   warm introduce-the-range pitch built from beat favourites + affinity.
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
const MAX_CANDIDATES = 18;
const REORDER_DUE_DAYS = 14;
// Matches the ai-workflow-run agents' definition of a newly added retailer.
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

type Tag = "reorder" | "top_seller" | "store_match" | "beat_favourite" | "regular";

interface Suggestion {
  productId: string;
  name: string;
  qty: number;
  unit: string;
  tag: Tag;
  reason: string;
}

/** A deterministic candidate the AI may pick. qty/unit/signal are facts. */
interface Candidate {
  productId: string;
  name: string;
  qty: number;
  unit: string;
  tag: Tag;
  signal: string;
}

/**
 * Realistic order line from history: the MEDIAN line quantity in the
 * product's most frequently used unit. Averaging across mixed units (an
 * "8000 Grams" line pooled with "2 PIECE" lines) produced absurd suggested
 * quantities; the per-unit median mirrors what is actually ordered.
 */
function typicalLine(unitLines: Record<string, number[]>): { qty: number; unit: string } {
  let unit = "";
  let best: number[] = [];
  for (const [u, arr] of Object.entries(unitLines)) {
    if (arr.length > best.length) {
      best = arr;
      unit = u;
    }
  }
  if (!best.length) return { qty: 1, unit };
  const sorted = [...best].sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  return { qty: Math.max(1, Math.round(median)), unit };
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
      .select("id, name, category, beat_name, created_at")
      .eq("id", retailerId)
      .maybeSingle();
    if (!retailer) return jsonError(404, "retailer_not_found", "Retailer not found");
    const retailerName = String((retailer as any).name ?? "Retailer");
    const retailerCategory = String((retailer as any).category ?? "");
    const retailerBeat = String((retailer as any).beat_name ?? "").trim();
    const retailerCreatedAt = String((retailer as any).created_at ?? "");

    const now = new Date();
    const today = isoDate(now);
    const since30 = isoDate(new Date(now.getTime() - 30 * DAY_MS));
    const since90 = isoDate(new Date(now.getTime() - 90 * DAY_MS));
    const since180 = isoDate(new Date(now.getTime() - 180 * DAY_MS));

    const daysSinceCreated = retailerCreatedAt
      ? Math.max(0, Math.round((now.getTime() - new Date(retailerCreatedAt).getTime()) / DAY_MS))
      : null;
    const isNewRetailer = daysSinceCreated != null && daysSinceCreated <= NEW_RETAILER_DAYS;

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

    interface ProdAgg { id: string | null; name: string; value: number; lines: number; unitLines: Record<string, number[]> }
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
        const agg = repProducts.get(key) ?? { id: null, name, value: 0, lines: 0, unitLines: {} };
        if (!agg.id && it.product_id) agg.id = String(it.product_id);
        agg.value += num(it.total);
        agg.lines += 1;
        const u = String(it.unit ?? "").trim();
        (agg.unitLines[u] ??= []).push(num(it.quantity));
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

    interface RetAgg { id: string | null; name: string; lines: number; lastDate: string; unitLines: Record<string, number[]> }
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
        const agg = retProducts.get(key) ?? { id: null, name, lines: 0, lastDate: "", unitLines: {} };
        if (!agg.id && it.product_id) agg.id = String(it.product_id);
        agg.lines += 1;
        if (date > agg.lastDate) agg.lastDate = date;
        const u = String(it.unit ?? "").trim();
        (agg.unitLines[u] ??= []).push(num(it.quantity));
        retProducts.set(key, agg);
      });
    }

    // ---- Beat favourites: what OTHER stores on this beat ordered (30d) ----
    // No user_id filter — RLS includes teammate orders on shared beats, which
    // is exactly the opener signal a brand-new retailer needs.
    interface BeatAgg { id: string | null; name: string; value: number; stores: Set<string>; unitLines: Record<string, number[]> }
    const beatProducts = new Map<string, BeatAgg>();
    if (retailerBeat) {
      const { data: beatPeers } = await supabase
        .from("retailers")
        .select("id")
        .eq("beat_name", retailerBeat)
        .neq("id", retailerId)
        .limit(300);
      const peerIds = (beatPeers ?? []).map((r: any) => String(r.id));
      if (peerIds.length) {
        const { data: beatOrders } = await supabase
          .from("orders")
          .select("id, retailer_id, status")
          .in("retailer_id", peerIds)
          .gte("order_date", since30)
          .lte("order_date", today)
          .limit(1000);
        const beatOrderRetailer = new Map<string, string>();
        (beatOrders ?? []).forEach((o: any) => {
          if (CONFIRMED.has(String(o.status ?? "").toLowerCase())) {
            beatOrderRetailer.set(String(o.id), String(o.retailer_id ?? ""));
          }
        });
        const beatOrderIds = [...beatOrderRetailer.keys()].slice(0, 800);
        if (beatOrderIds.length) {
          const { data: items } = await supabase
            .from("order_items")
            .select("order_id, product_id, product_name, quantity, total, unit")
            .in("order_id", beatOrderIds)
            .limit(6000);
          (items ?? []).forEach((it: any) => {
            const name = String(it.product_name ?? "").trim();
            if (!name) return;
            const key = name.toLowerCase();
            const agg = beatProducts.get(key) ?? { id: null, name, value: 0, stores: new Set<string>(), unitLines: {} };
            if (!agg.id && it.product_id) agg.id = String(it.product_id);
            agg.value += num(it.total);
            const rid = beatOrderRetailer.get(String(it.order_id));
            if (rid) agg.stores.add(rid);
            const u = String(it.unit ?? "").trim();
            (agg.unitLines[u] ??= []).push(num(it.quantity));
            beatProducts.set(key, agg);
          });
        }
      }
    }
    const beatFavourites = [...beatProducts.values()]
      .sort((a, b) => b.stores.size - a.stores.size || b.value - a.value)
      .slice(0, 6);

    // ---- Products master for affinity + id/unit resolution ----
    const { data: master } = await supabase
      .from("products")
      .select("id, name, rate, base_unit")
      .or("is_active.eq.true,is_active.is.null")
      .limit(1000);
    const masterByName = new Map<string, { id: string; name: string; unit: string }>();
    const masterById = new Map<string, { id: string; name: string; unit: string }>();
    (master ?? []).forEach((p: any) => {
      const name = String(p.name ?? "").trim();
      if (!name) return;
      const entry = { id: String(p.id), name, unit: String(p.base_unit ?? "") };
      masterByName.set(name.toLowerCase(), entry);
      masterById.set(entry.id, entry);
    });

    // History-based signals may reference discontinued products or stale ids.
    // Only ACTIVE master products may be suggested — resolve by name, then by
    // the historical product id; anything unresolved is dropped.
    const resolveActive = (name: string, id: string | null) =>
      masterByName.get(name.toLowerCase()) ?? (id ? masterById.get(id) : undefined);

    // ---- Deterministic candidate pool. Order = fallback priority. ----
    const candidates: Candidate[] = [];
    const used = new Set<string>();
    const addCandidate = (c: Candidate) => {
      const key = c.name.toLowerCase();
      if (used.has(key) || candidates.length >= MAX_CANDIDATES) return;
      used.add(key);
      candidates.push(c);
    };

    // Reorder-due: bought before, quiet for REORDER_DUE_DAYS+ (skipped
    // naturally for new retailers — they have no history).
    const reorderDue = [...retProducts.values()]
      .filter((p) => p.id && p.lastDate)
      .map((p) => ({
        ...p,
        daysSince: Math.round((now.getTime() - new Date(`${p.lastDate}T00:00:00Z`).getTime()) / DAY_MS),
      }))
      .filter((p) => p.daysSince >= REORDER_DUE_DAYS)
      .sort((a, b) => b.daysSince - a.daysSince)
      // Capped so the pool (and the deterministic fallback's first six)
      // always mixes already-bought products with new pitch products.
      .slice(0, 4);
    const pushReorder = () =>
      reorderDue.forEach((p) => {
        const m = resolveActive(p.name, p.id);
        if (!m) return; // product no longer active — never suggest it
        const t = typicalLine(p.unitLines);
        addCandidate({
          productId: m.id,
          name: m.name,
          qty: t.qty,
          unit: t.unit || m.unit || "",
          tag: "reorder",
          signal: `Bought ${p.lines}× before, last ${p.daysSince}d ago — likely due to reorder (usually ${t.qty}${t.unit ? ` ${t.unit}` : ""})`,
        });
      });

    // Regulars: the store's previously ordered products (no quiet-days
    // gate) — an active buyer's suggestion mix should show what they
    // already take alongside the new products worth pitching.
    const pushRegulars = () =>
      [...retProducts.values()]
        .filter((p) => p.id)
        .sort((a, b) => b.lines - a.lines)
        .slice(0, 3)
        .forEach((p) => {
          const m = resolveActive(p.name, p.id);
          if (!m) return; // product no longer active — never suggest it
          const t = typicalLine(p.unitLines);
          const daysSince = p.lastDate
            ? Math.round((now.getTime() - new Date(`${p.lastDate}T00:00:00Z`).getTime()) / DAY_MS)
            : null;
          addCandidate({
            productId: m.id,
            name: m.name,
            qty: t.qty,
            unit: t.unit || m.unit || "",
            tag: "regular",
            signal: `Their regular line — bought ${p.lines}× in 180d${daysSince != null ? `, last ${daysSince}d ago` : ""} (usually ${t.qty}${t.unit ? ` ${t.unit}` : ""})`,
          });
        });

    // Gap products: rep's top sellers the retailer hasn't bought yet.
    const pushTopSellers = () =>
      topSellers
        .filter((p) => !retProducts.has(p.name.toLowerCase()))
        .forEach((p) => {
          const m = resolveActive(p.name, p.id);
          if (!m) return; // product no longer active — never suggest it
          const t = typicalLine(p.unitLines);
          addCandidate({
            productId: m.id,
            name: m.name,
            qty: t.qty,
            unit: t.unit || m.unit || "",
            tag: "top_seller",
            signal: `Your top seller (₹${Math.round(p.value).toLocaleString("en-IN")} in 90d) this store doesn't buy yet — typical line is ${t.qty}${t.unit ? ` ${t.unit}` : ""}`,
          });
        });

    // Beat favourites the retailer isn't already buying.
    const pushBeatFavourites = () =>
      beatFavourites
        .filter((p) => !retProducts.has(p.name.toLowerCase()))
        .forEach((p) => {
          const m = resolveActive(p.name, p.id);
          if (!m) return; // product no longer active — never suggest it
          const t = typicalLine(p.unitLines);
          addCandidate({
            productId: m.id,
            name: m.name,
            qty: t.qty,
            unit: t.unit || m.unit || "",
            tag: "beat_favourite",
            signal: `${p.stores.size} other store${p.stores.size === 1 ? "" : "s"} on the ${retailerBeat} beat ordered this in 30d — typical line is ${t.qty}${t.unit ? ` ${t.unit}` : ""}`,
          });
        });

    // Store-name/category affinity from the products master.
    const pushAffinity = () => {
      const storeText = `${retailerName} ${retailerCategory}`.toLowerCase();
      const productKeywords = new Set<string>();
      AFFINITY.forEach((a) => {
        if (a.store.some((k) => storeText.includes(k))) a.product.forEach((k) => productKeywords.add(k));
      });
      // Direct token overlap too (e.g. "Tea Stall" → products containing "tea").
      storeText.split(/[^a-z]+/).filter((t) => t.length > 3).forEach((t) => productKeywords.add(t));
      if (!productKeywords.size) return;
      let added = 0;
      (master ?? []).forEach((p: any) => {
        if (added >= 6) return;
        const pname = String(p.name ?? "").toLowerCase();
        if (!pname || used.has(pname)) return;
        const hit = [...productKeywords].find((k) => pname.includes(k));
        if (hit) {
          addCandidate({
            productId: String(p.id),
            name: String(p.name),
            qty: 1,
            unit: String(p.base_unit ?? ""),
            tag: "store_match",
            signal: `Matches this store's profile ("${hit}")`,
          });
          added += 1;
        }
      });
    };

    // New retailers lead with what the beat actually buys and what fits the
    // store; established retailers mix what they already order (reorders +
    // regular lines) with the new products worth pitching.
    if (isNewRetailer || retConfirmed.length === 0) {
      pushBeatFavourites();
      pushAffinity();
      pushTopSellers();
      pushReorder();
    } else {
      pushReorder();
      pushRegulars();
      pushTopSellers();
      pushBeatFavourites();
      pushAffinity();
    }

    // ---- Together.ai selects which candidates fit THIS store ----
    // The model can only pick from the numbered deterministic candidates;
    // quantities, units and ids stay exactly as computed above.
    let suggestions: Suggestion[] = [];
    let summary = "";
    const apiKey = Deno.env.get("TOGETHER_API_KEY");
    if (apiKey && candidates.length) {
      try {
        const profile = [
          `Store: ${retailerName}`,
          retailerCategory ? `Category: ${retailerCategory}` : "",
          retailerBeat ? `Beat: ${retailerBeat}` : "",
          isNewRetailer
            ? `NEWLY ADDED retailer (${daysSinceCreated}d old) — no meaningful history yet; frame the pitch as a warm introduction to the range.`
            : `Confirmed orders in 180d: ${retConfirmed.length}.`,
        ].filter(Boolean).join("\n");
        const candidateList = candidates
          .map((c, i) => `${i + 1}. ${c.name} — qty ${c.qty}${c.unit ? ` ${c.unit}` : ""} [${c.tag}] — ${c.signal}`)
          .join("\n");
        const messages: ChatMessage[] = [
          {
            role: "system",
            content:
              "You are QuickApp's Pitch Assistant for field sales reps. From the numbered CANDIDATES, pick the 4-6 that best fit THIS " +
              "specific store's profile and situation — choose for the store, do not simply take the first entries, and make the mix feel " +
              "tailored (a bakery gets bakery-relevant picks, a new store gets an introduction mix). For each pick write one personalised " +
              "reason under 25 words, grounded ONLY in that candidate's stated signal and the store profile — never invent products, " +
              "quantities or numbers. Candidates tagged [reorder] or [regular] are products this store ALREADY buys — when the store has " +
              "purchase history, your picks MUST include both at least 1-2 already-bought products (reorder/regular) AND at least 1-2 new " +
              "products to pitch (top_seller/beat_favourite/store_match), candidates permitting. " +
              "Also write \"summary\": compact markdown pitch coaching for the rep (one short headline, up to four " +
              "bullets about the picked products, then a single line starting with 'Suggested pitch:'), under 120 words, ₹ for currency, " +
              "friendly and practical" +
              (isNewRetailer ? ", opening with a warm note that this is a newly added retailer" : "") +
              ". Return STRICT JSON only: {\"picks\":[{\"n\":<candidate number>,\"reason\":\"...\"}],\"summary\":\"...\"} — no markdown fences, no extra keys.",
          },
          {
            role: "user",
            content: `STORE PROFILE\n---\n${profile}\n---\nCANDIDATES\n---\n${candidateList}\n---\nPick what I should pitch at this store right now.`,
          },
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
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          const seen = new Set<number>();
          const picked: Suggestion[] = [];
          (Array.isArray(parsed?.picks) ? parsed.picks : []).forEach((p: any) => {
            const n = Math.round(num(p?.n));
            if (n < 1 || n > candidates.length || seen.has(n) || picked.length >= MAX_SUGGESTIONS) return;
            seen.add(n);
            const c = candidates[n - 1];
            const reason = String(p?.reason ?? "").trim();
            picked.push({
              productId: c.productId,
              name: c.name,
              qty: c.qty,
              unit: c.unit,
              tag: c.tag,
              reason: reason ? reason.slice(0, 200) : c.signal,
            });
          });
          if (picked.length) {
            suggestions = picked;
            summary = String(parsed?.summary ?? "").trim();
          }
        }
      } catch (aiErr) {
        console.error("[ai-pitch-suggestions] selection failed:", aiErr);
      }
    }

    // Provider unavailable or unusable reply → deterministic priority order.
    if (!suggestions.length) {
      suggestions = candidates.slice(0, MAX_SUGGESTIONS).map((c) => ({
        productId: c.productId,
        name: c.name,
        qty: c.qty,
        unit: c.unit,
        tag: c.tag,
        reason: c.signal,
      }));
    }

    // Deterministic mix guard — the LLM prompt states the preference, but the
    // business rule is enforced here: for a store with purchase history whose
    // candidate pool contains both categories, the final suggestions must
    // include at least one already-bought product (reorder/regular) AND at
    // least one new pitch product. Missing-category candidates are appended
    // in existing pool priority order (same dedupe-by-name, same active-only
    // pool); if that overflows MAX_SUGGESTIONS, the over-represented side is
    // trimmed from its tail, never dropping either category below one.
    // New/no-history retailers are untouched.
    const isBoughtTag = (t: Tag) => t === "reorder" || t === "regular";
    if (!isNewRetailer && retConfirmed.length > 0 && suggestions.length) {
      const poolHasBought = candidates.some((c) => isBoughtTag(c.tag));
      const poolHasNew = candidates.some((c) => !isBoughtTag(c.tag));
      if (poolHasBought && poolHasNew) {
        const have = new Set(suggestions.map((s) => s.name.toLowerCase()));
        const appendFromPool = (wantBought: boolean) => {
          let appended = 0;
          for (const c of candidates) {
            if (appended >= 1) break;
            if (isBoughtTag(c.tag) !== wantBought || have.has(c.name.toLowerCase())) continue;
            suggestions.push({
              productId: c.productId,
              name: c.name,
              qty: c.qty,
              unit: c.unit,
              tag: c.tag,
              reason: c.signal,
            });
            have.add(c.name.toLowerCase());
            appended += 1;
          }
        };
        if (!suggestions.some((s) => isBoughtTag(s.tag))) appendFromPool(true);
        if (!suggestions.some((s) => !isBoughtTag(s.tag))) appendFromPool(false);
        while (suggestions.length > MAX_SUGGESTIONS) {
          const boughtCount = suggestions.filter((s) => isBoughtTag(s.tag)).length;
          const newCount = suggestions.length - boughtCount;
          const dropBought = boughtCount >= newCount ? boughtCount > 1 : newCount <= 1;
          const idx = suggestions
            .map((s, i) => ({ s, i }))
            .filter(({ s }) => isBoughtTag(s.tag) === dropBought)
            .map(({ i }) => i)
            .pop();
          if (idx == null) break;
          suggestions.splice(idx, 1);
        }
      }
    }

    return new Response(
      JSON.stringify({
        kind: "pitch",
        retailerId,
        retailerName,
        date: today,
        isNewRetailer,
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
