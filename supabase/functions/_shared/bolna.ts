// Shared utilities for Bolna voice AI edge functions.
// Used by: voice-order-status, voice-recent-orders, voice-product-query, voice-place-order

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function emptyBodyResponse(): Response {
  return json(200, {
    success: false,
    reason: "Empty request body from Bolna",
    hint: "Bolna is not passing tool arguments",
  });
}

export function invalidPhoneResponse(): Response {
  return json(200, {
    success: false,
    invalid_phone: true,
    message: "Phone number not registered",
  });
}

/**
 * Parse a Bolna webhook request body, supporting every documented wrapper
 * shape: direct payload, `arguments`, `tool_call_arguments`, `function_arguments`,
 * each potentially passed as either an object or a stringified JSON.
 */
export async function parseBolnaPayload(
  req: Request,
): Promise<{ raw: string; payload: Record<string, unknown> }> {
  const raw = await req.text();
  console.log("METHOD:", req.method);
  console.log("CONTENT TYPE:", req.headers.get("content-type"));
  console.log("RAW BODY:", raw);

  let body: Record<string, unknown> = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }

  const unwrap = (v: unknown): Record<string, unknown> => {
    if (!v) return {};
    if (typeof v === "string") {
      try {
        return JSON.parse(v);
      } catch {
        return {};
      }
    }
    if (typeof v === "object") return v as Record<string, unknown>;
    return {};
  };

  let payload: Record<string, unknown> = {};
  if ((body as any).arguments !== undefined) {
    payload = unwrap((body as any).arguments);
  } else if ((body as any).tool_call_arguments !== undefined) {
    payload = unwrap((body as any).tool_call_arguments);
  } else if ((body as any).function_arguments !== undefined) {
    payload = unwrap((body as any).function_arguments);
  } else {
    payload = body;
  }

  console.log("FINAL PAYLOAD:", JSON.stringify(payload));
  return { raw, payload };
}

/**
 * Normalize an Indian phone number. Returns a list of candidate forms to match
 * against the retailers.phone column (which is stored in mixed formats).
 */
export function normalizePhone(raw: unknown): { last10: string; variants: string[] } {
  const s = String(raw ?? "").replace(/[\s\-()+]/g, "");
  let digits = s.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  const last10 = digits.slice(-10);
  const variants = Array.from(
    new Set([last10, `+91${last10}`, `91${last10}`, `0${last10}`, digits, String(raw ?? "")].filter(Boolean)),
  );
  return { last10, variants };
}

export async function findRetailerByPhone(supabase: any, rawPhone: unknown) {
  const { last10, variants } = normalizePhone(rawPhone);
  if (!last10 || last10.length < 10) return null;

  // 1. Exact match against any variant.
  const { data: exact } = await supabase
    .from("retailers")
    .select("id, name, phone, user_id, owner_id, distributor_id, territory_id, beat_id, beat_name")
    .in("phone", variants)
    .limit(1);
  if (exact && exact.length > 0) return exact[0];

  // 2. Fallback: last-10-digit suffix match (handles odd stored formats).
  const { data: like } = await supabase
    .from("retailers")
    .select("id, name, phone, user_id, owner_id, distributor_id, territory_id, beat_id, beat_name")
    .ilike("phone", `%${last10}`)
    .limit(1);
  if (like && like.length > 0) return like[0];

  return null;
}

// --- Product search ---------------------------------------------------------

// Extensible alias map for common voice mispronunciations.
export const ALIASES: Record<string, string> = {
  "easy tab": "AZITAB",
  "easytab": "AZITAB",
  "veggie tab": "VEGITAB",
  "veggietab": "VEGITAB",
  "value": "VAYU",
  "vayu": "VAYU",
  "close in": "CROCIN",
  "closein": "CROCIN",
  "british coffee": "BRITISH COFFEE",
  "kadak gold": "KADAK GOLD",
};

// Unit synonyms — collapse spoken/written variants to canonical tokens.
const UNIT_SYNONYMS: Array<[RegExp, string]> = [
  [/\b(grams?|gms?|gm)\b/g, "g"],
  [/\b(kgs?|kilograms?|kilos?)\b/g, "kg"],
  [/\b(mls?|milliliters?|millilitres?)\b/g, "ml"],
  [/\b(ltrs?|liters?|litres?)\b/g, "l"],
  [/\b(pcs?|pieces?|nos?)\b/g, "pc"],
];

// Words to drop from token-overlap scoring (noise / units / fillers).
const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "for", "with", "please", "ek", "do",
  "pack", "packet", "box", "bottle", "g", "kg", "ml", "l", "pc",
]);

export function normalizeText(s: string): string {
  let out = String(s ?? "")
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Split "50g" → "50 g" so units normalize cleanly.
  out = out.replace(/(\d)([a-z])/g, "$1 $2").replace(/([a-z])(\d)/g, "$1 $2");
  for (const [re, rep] of UNIT_SYNONYMS) out = out.replace(re, rep);
  return out.replace(/\s+/g, " ").trim();
}

export function buildSearchTerms(name: string): { compact: string; tokens: string[]; cleaned: string; contentTokens: string[] } {
  const cleaned = normalizeText(name);
  const compact = cleaned.replace(/\s+/g, "");
  const tokens = cleaned.split(" ").filter((t) => t.length > 1);
  const contentTokens = tokens.filter((t) => !STOPWORDS.has(t) && !/^\d+$/.test(t));
  return { compact, tokens, cleaned, contentTokens };
}

function bigrams(s: string): Set<string> {
  const g = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
  return g;
}

function diceSimilarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export type ProductHit = {
  id: string;
  name: string;
  sku: string | null;
  rate: number | null;
  unit: string | null;
  closing_stock: number | null;
  brand: string | null;
  description: string | null;
  score: number;
};

/**
 * Tolerant product search for voice ordering:
 *   STEP 1 — alias map (highest priority)
 *   STEP 2 — strong partial match via normalized ilike
 *   STEP 3 — token overlap ranking
 *   STEP 4 — trigram/Dice similarity ranking as fallback
 *
 * Prefers "best probable match" over rejection. Only the caller decides
 * the confidence cutoff.
 */
export async function searchProducts(
  supabase: any,
  query: string,
  limit = 5,
): Promise<ProductHit[]> {
  const { cleaned, compact, tokens, contentTokens } = buildSearchTerms(query);
  console.log("VOICE PRODUCT QUERY:", query);
  console.log("NORMALIZED QUERY:", cleaned, "| tokens:", contentTokens);
  if (!cleaned) return [];

  const aliasKey = ALIASES[cleaned] ?? ALIASES[compact] ?? ALIASES[contentTokens.join(" ")];
  const candidates = new Map<string, any>();

  const baseSelect = "id, name, sku, rate, unit, closing_stock, brand, description, is_active";

  // STEP 1 — alias hit
  if (aliasKey) {
    const { data, error } = await supabase
      .from("products")
      .select(baseSelect)
      .eq("is_active", true)
      .ilike("name", `%${aliasKey}%`)
      .limit(10);
    if (error) console.error("PRODUCT QUERY ERROR (alias):", error);
    for (const r of data ?? []) candidates.set(r.id, r);
  }

  // STEP 2 — strong partial match on full cleaned phrase
  const { data: ilikeData, error: ilikeErr } = await supabase
    .from("products")
    .select(baseSelect)
    .eq("is_active", true)
    .or(`name.ilike.%${cleaned}%,sku.ilike.%${cleaned}%`)
    .limit(15);
  if (ilikeErr) console.error("PRODUCT QUERY ERROR (ilike):", ilikeErr);
  for (const r of ilikeData ?? []) candidates.set(r.id, r);

  // STEP 3 — per-token OR (content tokens preferred, fall back to all tokens)
  const tokenPool = contentTokens.length > 0 ? contentTokens : tokens;
  if (tokenPool.length > 0) {
    const orClause = tokenPool
      .map((t) => `name.ilike.%${t}%,sku.ilike.%${t}%`)
      .join(",");
    const { data: tokData, error: tokErr } = await supabase
      .from("products")
      .select(baseSelect)
      .eq("is_active", true)
      .or(orClause)
      .limit(50);
    if (tokErr) console.error("PRODUCT QUERY ERROR (tokens):", tokErr);
    for (const r of tokData ?? []) candidates.set(r.id, r);
  }

  // STEP 4 — re-rank: token overlap (primary) + Dice similarity (secondary).
  const ranked: ProductHit[] = Array.from(candidates.values()).map((p) => {
    const nameNorm = normalizeText(p.name ?? "");
    const skuNorm = normalizeText(p.sku ?? "");
    const nameTokens = nameNorm.split(" ").filter((t) => t.length > 1 && !STOPWORDS.has(t));

    // Token overlap ratio (Jaccard on content tokens).
    let overlapScore = 0;
    if (contentTokens.length > 0 && nameTokens.length > 0) {
      const nameSet = new Set(nameTokens);
      let inter = 0;
      for (const t of contentTokens) if (nameSet.has(t)) inter++;
      const union = new Set([...contentTokens, ...nameTokens]).size;
      overlapScore = inter / Math.max(1, contentTokens.length); // recall-biased
      // Reward when all query tokens appear in name (strong partial).
      if (inter === contentTokens.length) overlapScore = Math.max(overlapScore, 0.85);
      // Small bonus for tighter sets.
      overlapScore += 0.05 * (inter / Math.max(1, union));
    }

    const sim = Math.max(
      diceSimilarity(nameNorm.replace(/\s+/g, ""), compact),
      diceSimilarity(skuNorm.replace(/\s+/g, ""), compact),
    );

    let score = Math.max(overlapScore, sim);

    if (aliasKey) {
      const a = aliasKey.toLowerCase();
      if (nameNorm.includes(a) || skuNorm.includes(a)) score = Math.max(score, 0.99);
    }
    if (nameNorm.includes(cleaned) || skuNorm.includes(cleaned)) {
      score = Math.max(score, 0.9);
    }
    if (nameNorm === cleaned || skuNorm === cleaned) score = 1;

    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      rate: p.rate,
      unit: p.unit,
      closing_stock: p.closing_stock,
      category: p.category ?? null,
      score: Math.min(1, score),
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  console.log(
    "MATCH CANDIDATES:",
    ranked.slice(0, 5).map((r) => ({ name: r.name, score: Number(r.score.toFixed(3)) })),
  );
  return ranked.slice(0, limit);
}


export function formatShortDate(d: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
