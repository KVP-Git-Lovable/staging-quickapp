import { supabase } from "@/integrations/supabase/client";

/**
 * Shared session cache + prefetcher for AI Pitch Suggestions.
 *
 * PitchSuggestionsCard (Order Entry) reads/writes this exact cache. The
 * visits page calls prefetchPitchSuggestions() for the day's retailers so
 * the suggestions are already sitting in sessionStorage by the time the
 * rep opens the order page — the card then renders instantly instead of
 * waiting on the edge function. The server-side suggestion logic is
 * untouched: this only moves WHEN the same call happens.
 */

export const PITCH_CACHE_TTL_MS = 10 * 60 * 1000;
// Bump when the suggestion logic changes server-side so stale cached results
// (old quantities/products) are discarded immediately instead of surviving
// the TTL window.
export const PITCH_CACHE_VERSION = "v5";

const cacheKey = (retailerId: string) => `pitch_suggestions_${PITCH_CACHE_VERSION}_${retailerId}`;

export function readPitchCache(retailerId: string): any | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(retailerId));
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (cached?.at && Date.now() - cached.at < PITCH_CACHE_TTL_MS && cached.data?.kind === "pitch") {
      return cached.data;
    }
  } catch {
    /* ignore cache errors */
  }
  return null;
}

export function writePitchCache(retailerId: string, data: unknown) {
  try {
    sessionStorage.setItem(cacheKey(retailerId), JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* ignore quota */
  }
}

// Module-level guard so duplicate mounts/renders never fetch the same
// retailer twice concurrently.
const inFlight = new Set<string>();
// Warm-up is best-effort background work: bound it so a big visit list
// doesn't hammer the edge function (and the AI provider behind it).
const MAX_PREFETCH = 20;
const CONCURRENCY = 2;

/** Fetch one retailer's suggestions and store them in the shared cache. */
async function fetchIntoCache(retailerId: string, token: string) {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-pitch-suggestions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ retailerId }),
  });
  const body = await res.json().catch(() => null);
  if (res.ok && body?.kind === "pitch") writePitchCache(retailerId, body);
}

/**
 * Warm the pitch-suggestions cache for these retailers (e.g. the day's visit
 * list). Skips anything already cached or already being fetched; runs at low
 * concurrency and never throws — a failed warm-up simply means the order
 * page falls back to loading live, exactly as before.
 */
export async function prefetchPitchSuggestions(retailerIds: string[]) {
  const todo = [...new Set(retailerIds.map(String).filter(Boolean))]
    .filter((rid) => !inFlight.has(rid) && !readPitchCache(rid))
    .slice(0, MAX_PREFETCH);
  if (!todo.length) return;
  todo.forEach((rid) => inFlight.add(rid));
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return;
    const queue = [...todo];
    const worker = async () => {
      while (queue.length) {
        const rid = queue.shift();
        if (!rid) return;
        try {
          await fetchIntoCache(rid, token);
        } catch (e) {
          console.warn("[pitchPrefetch] failed for", rid, e);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  } finally {
    todo.forEach((rid) => inFlight.delete(rid));
  }
}
