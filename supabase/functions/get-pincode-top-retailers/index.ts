import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PlaceResult {
  place_id: string;
  name: string;
  vicinity?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  geometry?: { location?: { lat: number; lng: number } };
}

interface OpeningHours {
  open_now?: boolean;
  weekday_text?: string[];
  periods?: Array<{
    open?: { day: number; time: string };
    close?: { day: number; time: string };
  }>;
}

const CACHE_DAYS = 7;

function respond(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Compute open_now from periods against current IST time.
// periods: array of { open: {day, time "HHMM"}, close: {day, time "HHMM"} }
// day: 0 = Sunday ... 6 = Saturday (Google Places convention)
function computeOpenNow(periods: OpeningHours['periods'] | undefined): boolean | null {
  if (!periods || periods.length === 0) return null;

  // 24/7: single period with open.day=0, time="0000", no close
  if (periods.length === 1 && periods[0].open?.time === '0000' && !periods[0].close) {
    return true;
  }

  // Current IST time
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const ist = new Date(utcMs + istOffsetMs);
  const curDay = ist.getDay(); // 0=Sun..6=Sat
  const curMins = ist.getHours() * 60 + ist.getMinutes();

  const toMins = (t: string) => parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(2, 4), 10);

  for (const p of periods) {
    if (!p.open) continue;
    const openDay = p.open.day;
    const openMins = toMins(p.open.time);
    if (!p.close) {
      // Open all day on this day
      if (curDay === openDay) return true;
      continue;
    }
    const closeDay = p.close.day;
    const closeMins = toMins(p.close.time);

    if (openDay === closeDay) {
      if (curDay === openDay && curMins >= openMins && curMins < closeMins) return true;
    } else {
      // Crosses midnight
      if (curDay === openDay && curMins >= openMins) return true;
      if (curDay === closeDay && curMins < closeMins) return true;
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const GOOGLE_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const pincode: string = String(body?.pincode || '').trim();
    const refresh: boolean = !!body?.refresh;

    if (!/^\d{6}$/.test(pincode)) {
      return respond({ ok: false, error: 'Invalid pincode (must be 6 digits)', retailers: [] });
    }

    // 1. Cache check
    if (!refresh) {
      const cutoff = new Date(Date.now() - CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data: cached } = await admin
        .from('pincode_top_retailers')
        .select('*')
        .eq('pincode', pincode)
        .gt('fetched_at', cutoff)
        .order('rank', { ascending: true });

      if (cached && cached.length > 0) {
        console.log(`[cache HIT] pincode=${pincode} rows=${cached.length}`);
        // Recompute open_now live from cached periods
        const enriched = cached.map((r: any) => {
          const periods = r.opening_hours?.periods;
          const liveOpen = computeOpenNow(periods);
          return { ...r, open_now: liveOpen ?? r.open_now ?? null };
        });
        return respond({ ok: true, retailers: enriched, cached: true, fetched_at: cached[0].fetched_at });
      }
    }

    console.log(`[cache MISS] pincode=${pincode} refresh=${refresh}`);

    if (!GOOGLE_KEY) {
      return respond({ ok: false, error: 'GOOGLE_PLACES_API_KEY not configured on server', retailers: [] });
    }

    // 2. Resolve lat/lng
    let lat: number | null = null;
    let lng: number | null = null;

    const { data: pmRows } = await admin
      .from('pincode_master')
      .select('latitude, longitude')
      .eq('pincode', pincode)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .limit(50);

    if (pmRows && pmRows.length > 0) {
      const lats = pmRows.map((r: any) => Number(r.latitude)).filter(Number.isFinite);
      const lngs = pmRows.map((r: any) => Number(r.longitude)).filter(Number.isFinite);
      if (lats.length && lngs.length) {
        lat = lats.reduce((a, b) => a + b, 0) / lats.length;
        lng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
      }
    }

    if (lat == null || lng == null) {
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?components=postal_code:${pincode}|country:IN&key=${GOOGLE_KEY}`;
      const geoRes = await fetch(geoUrl);
      const geoJson = await geoRes.json();
      const loc = geoJson?.results?.[0]?.geometry?.location;
      if (loc) { lat = loc.lat; lng = loc.lng; }
    }

    if (lat == null || lng == null) {
      return respond({ ok: false, error: `No coordinates found for PIN ${pincode}`, retailers: [] });
    }

    // 3. Google Places Nearby Search — broaden pool to match Google Maps' free-text search
    const TOP_N = 30;
    const RADIUS_M = 5000;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Fetch one query, paginate up to 3 pages (max 60 results)
    const fetchPaged = async (params: string): Promise<PlaceResult[]> => {
      const out: PlaceResult[] = [];
      let pageToken: string | undefined = undefined;
      for (let page = 0; page < 3; page++) {
        const url = pageToken
          ? `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${pageToken}&key=${GOOGLE_KEY}`
          : `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${RADIUS_M}&${params}&key=${GOOGLE_KEY}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json?.status && json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
          console.error('Places API error:', json.status, json.error_message);
          break;
        }
        for (const p of (json?.results || []) as PlaceResult[]) out.push(p);
        pageToken = json?.next_page_token;
        if (!pageToken) break;
        // next_page_token needs ~2s before becoming valid
        await sleep(2100);
      }
      return out;
    };

    // Run 3 broad queries in parallel: type=supermarket, type=grocery_or_supermarket, keyword=supermarket
    const [r1, r2, r3] = await Promise.all([
      fetchPaged('type=supermarket'),
      fetchPaged('type=grocery_or_supermarket'),
      fetchPaged('keyword=supermarket'),
    ]);

    const dedup = new Map<string, PlaceResult>();
    for (const p of [...r1, ...r2, ...r3]) {
      if (p.place_id && !dedup.has(p.place_id)) dedup.set(p.place_id, p);
    }
    console.log(`[candidates] pincode=${pincode} unique=${dedup.size}`);

    // Bayesian-weighted score (rewards high review volume, like Google/IMDb)
    const PRIOR_M = 50;   // prior review count
    const PRIOR_C = 4.0;  // global mean rating
    const scored = Array.from(dedup.values()).map((p) => {
      const rating = p.rating ?? 0;
      const reviews = p.user_ratings_total ?? 0;
      const bayes = (reviews * rating + PRIOR_M * PRIOR_C) / (reviews + PRIOR_M);
      const score = bayes * Math.log10(reviews + 10);
      return { p, score };
    }).sort((a, b) => b.score - a.score).slice(0, TOP_N);

    // 3b. Fetch opening_hours for each top-10 place_id (parallel, individually safe)
    const fetchHours = async (placeId: string): Promise<OpeningHours | null> => {
      try {
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=opening_hours&key=${GOOGLE_KEY}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json?.status && json.status !== 'OK') {
          console.warn(`Place Details ${placeId}: ${json.status}`);
          return null;
        }
        return (json?.result?.opening_hours as OpeningHours) || null;
      } catch (e) {
        console.warn(`Place Details fetch failed ${placeId}:`, (e as any)?.message);
        return null;
      }
    };

    const hoursList = await Promise.all(scored.map(({ p }) => fetchHours(p.place_id)));
    const hoursFetchedAt = new Date().toISOString();

    const rows = scored.map(({ p, score }, i) => {
      const oh = hoursList[i];
      const computedOpen = oh?.periods ? computeOpenNow(oh.periods) : null;
      const openNow = computedOpen ?? oh?.open_now ?? null;
      return {
        pincode,
        rank: i + 1,
        place_id: p.place_id,
        name: p.name,
        address: p.vicinity || p.formatted_address || null,
        rating: p.rating ?? null,
        user_ratings_total: p.user_ratings_total ?? null,
        latitude: p.geometry?.location?.lat ?? null,
        longitude: p.geometry?.location?.lng ?? null,
        score: Number(score.toFixed(4)),
        source: 'google_places',
        opening_hours: oh ?? null,
        open_now: openNow,
        hours_fetched_at: oh ? hoursFetchedAt : null,
      };
    });

    // 4. Replace cache
    await admin.from('pincode_top_retailers').delete().eq('pincode', pincode);
    if (rows.length > 0) {
      const { error: insErr } = await admin.from('pincode_top_retailers').insert(rows);
      if (insErr) console.error('Insert error:', insErr);
    }

    return respond({ ok: true, retailers: rows, cached: false, fetched_at: new Date().toISOString() });
  } catch (err: any) {
    console.error('get-pincode-top-retailers error:', err);
    return respond({ ok: false, error: err?.message || 'Internal error', retailers: [] });
  }
});
