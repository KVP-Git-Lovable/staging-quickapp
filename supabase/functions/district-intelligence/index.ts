import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface POICounts {
  education: { schools: number; colleges: number; universities: number; total: number };
  teaCoffee: { cafes: number; teaShops: number; coffeeShops: number; fastFood: number; total: number };
  retail: { clothing: number; supermarkets: number; convenience: number; general: number; total: number };
  landmarks: { hospitals: number; worship: number; attractions: number; parks: number; total: number };
}

function isZeroCounts(counts: POICounts): boolean {
  return counts.education.total === 0
    && counts.teaCoffee.total === 0
    && counts.retail.total === 0
    && counts.landmarks.total === 0;
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function getCachedResult(state: string, district: string): Promise<{ counts: POICounts; aiSummary: string; bbox: any } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("district_intelligence_cache")
    .select("counts, ai_summary, bbox")
    .eq("state", state)
    .eq("district", district)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;

  const counts = data.counts as POICounts;
  // Treat all-zero cached entries as invalid
  if (isZeroCounts(counts)) {
    console.log(`Cache entry for ${district}, ${state} has all-zero counts — treating as invalid`);
    return null;
  }

  return { counts, aiSummary: data.ai_summary, bbox: data.bbox };
}

async function setCachedResult(state: string, district: string, counts: POICounts, aiSummary: string, bbox: any) {
  // Never cache all-zero results
  if (isZeroCounts(counts)) {
    console.log(`Skipping cache write for ${district} — all counts are zero`);
    return;
  }

  const supabase = getSupabase();
  await supabase
    .from("district_intelligence_cache")
    .upsert(
      {
        state,
        district,
        counts,
        ai_summary: aiSummary,
        bbox,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "state,district" }
    );
}

async function geocodeDistrict(state: string, district: string): Promise<{ south: number; north: number; west: number; east: number } | null> {
  const query = `${district}, ${state}, India`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "DistrictIntelligenceBot/1.0" },
  });

  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.length || !data[0].boundingbox) return null;

  const [south, north, west, east] = data[0].boundingbox.map(Number);
  return { south, north, west, east };
}

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

function buildOverpassQuery(bbox: { south: number; north: number; west: number; east: number }, timeout = 30): string {
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

  return `
[out:json][timeout:${timeout}];
(
  node["amenity"="school"](${b});
  way["amenity"="school"](${b});
  node["amenity"="college"](${b});
  way["amenity"="college"](${b});
  node["amenity"="university"](${b});
  way["amenity"="university"](${b});
  node["amenity"="cafe"](${b});
  node["shop"="tea"](${b});
  node["shop"="coffee"](${b});
  node["amenity"="fast_food"](${b});
  node["shop"="clothes"](${b});
  node["shop"="supermarket"](${b});
  node["shop"="convenience"](${b});
  node["shop"="general"](${b});
  node["amenity"="hospital"](${b});
  way["amenity"="hospital"](${b});
  node["amenity"="place_of_worship"](${b});
  way["amenity"="place_of_worship"](${b});
  node["tourism"="attraction"](${b});
  node["leisure"="park"](${b});
  way["leisure"="park"](${b});
);
out tags;
`;
}

function parseElements(elements: any[]): POICounts {
  let schools = 0, colleges = 0, universities = 0;
  let cafes = 0, teaShops = 0, coffeeShops = 0, fastFood = 0;
  let clothing = 0, supermarkets = 0, convenience = 0, general = 0;
  let hospitals = 0, worship = 0, attractions = 0, parks = 0;

  for (const el of elements) {
    const tags = el.tags || {};
    const amenity = tags.amenity;
    const shop = tags.shop;
    const tourism = tags.tourism;
    const leisure = tags.leisure;

    if (amenity === "school") schools++;
    else if (amenity === "college") colleges++;
    else if (amenity === "university") universities++;
    else if (amenity === "cafe") cafes++;
    else if (amenity === "fast_food") fastFood++;
    else if (amenity === "hospital") hospitals++;
    else if (amenity === "place_of_worship") worship++;

    if (shop === "tea") teaShops++;
    else if (shop === "coffee") coffeeShops++;
    else if (shop === "clothes") clothing++;
    else if (shop === "supermarket") supermarkets++;
    else if (shop === "convenience") convenience++;
    else if (shop === "general") general++;

    if (tourism === "attraction") attractions++;
    if (leisure === "park") parks++;
  }

  return {
    education: { schools, colleges, universities, total: schools + colleges + universities },
    teaCoffee: { cafes, teaShops, coffeeShops, fastFood, total: cafes + teaShops + coffeeShops + fastFood },
    retail: { clothing, supermarkets, convenience, general, total: clothing + supermarkets + convenience + general },
    landmarks: { hospitals, worship, attractions, parks, total: hospitals + worship + attractions + parks },
  };
}

async function queryOverpass(bbox: { south: number; north: number; west: number; east: number }): Promise<{ counts: POICounts; success: boolean }> {
  const query = buildOverpassQuery(bbox, 30);

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`Trying Overpass endpoint: ${endpoint}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25_000);

      const resp = await fetch(endpoint, {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        console.error(`Overpass ${endpoint} returned ${resp.status}`);
        continue;
      }

      const data = await resp.json();
      const elements = data.elements || [];
      console.log(`Got ${elements.length} elements from ${endpoint}`);
      return { counts: parseElements(elements), success: true };
    } catch (e) {
      console.error(`Overpass ${endpoint} failed:`, e instanceof Error ? e.message : e);
      continue;
    }
  }

  console.error("All Overpass endpoints failed");
  return { counts: emptyCounts(), success: false };
}

function emptyCounts(): POICounts {
  return {
    education: { schools: 0, colleges: 0, universities: 0, total: 0 },
    teaCoffee: { cafes: 0, teaShops: 0, coffeeShops: 0, fastFood: 0, total: 0 },
    retail: { clothing: 0, supermarkets: 0, convenience: 0, general: 0, total: 0 },
    landmarks: { hospitals: 0, worship: 0, attractions: 0, parks: 0, total: 0 },
  };
}

async function generateAISummary(state: string, district: string, counts: POICounts): Promise<string> {
  if (isZeroCounts(counts)) return "No POI data available — Overpass API endpoints were unreachable. Please try again later.";

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return "AI summary unavailable — API key not configured.";

  const prompt = `You are a market intelligence analyst for an FMCG distribution company in India.

Based on the following Point-of-Interest data for ${district} district, ${state} state, provide a concise market opportunity analysis (3-4 paragraphs). Focus on:
1. Overall market potential and density signals
2. Tea/coffee and food service opportunities
3. Retail landscape and distribution potential
4. Key recommendations for sales strategy

POI Data:
- Education: ${counts.education.schools} schools, ${counts.education.colleges} colleges, ${counts.education.universities} universities
- Tea/Coffee & Food: ${counts.teaCoffee.cafes} cafes, ${counts.teaCoffee.teaShops} tea shops, ${counts.teaCoffee.coffeeShops} coffee shops, ${counts.teaCoffee.fastFood} fast food outlets
- Retail: ${counts.retail.clothing} clothing stores, ${counts.retail.supermarkets} supermarkets, ${counts.retail.convenience} convenience stores, ${counts.retail.general} general stores
- Landmarks: ${counts.landmarks.hospitals} hospitals, ${counts.landmarks.worship} places of worship, ${counts.landmarks.attractions} tourist attractions, ${counts.landmarks.parks} parks

Keep the analysis practical and actionable. Use bullet points where helpful.`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an expert market intelligence analyst specializing in Indian FMCG distribution. Provide data-driven insights." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (resp.status === 429) return "AI rate limit reached. Please try again later.";
    if (resp.status === 402) return "AI credits exhausted. Please add funds to continue.";
    if (!resp.ok) return "AI summary generation failed.";

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || "No summary generated.";
  } catch (e) {
    console.error("AI summary error:", e);
    return "AI summary unavailable due to an error.";
  }
}

// Process a single district: geocode → overpass → AI → cache
async function processDistrict(state: string, district: string): Promise<{ counts: POICounts; aiSummary: string; bbox: any; overpassFailed?: boolean }> {
  const bbox = await geocodeDistrict(state, district);
  if (!bbox) {
    throw new Error(`Could not geocode district: ${district}`);
  }

  console.log(`Bounding box for ${district}: ${JSON.stringify(bbox)}`);

  const { counts, success } = await queryOverpass(bbox);
  console.log(`POI counts for ${district}: ${JSON.stringify(counts)}`);

  const aiSummary = await generateAISummary(state, district, counts);

  // Only cache if Overpass actually succeeded (don't cache zero-fallback)
  if (success && !isZeroCounts(counts)) {
    await setCachedResult(state, district, counts, aiSummary, bbox);
  }

  return { counts, aiSummary, bbox, overpassFailed: !success };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { state, district, mode, districts, forceRefresh } = body;

    // === BULK PRE-POPULATE MODE ===
    if (mode === "bulk" && state && Array.isArray(districts)) {
      console.log(`Bulk pre-populate for ${state}: ${districts.length} districts`);
      const bulkStartTime = Date.now();
      const MAX_BULK_MS = 120_000; // stop processing at 120s to leave headroom

      const supabase = getSupabase();
      const { data: cached } = await supabase
        .from("district_intelligence_cache")
        .select("district, counts")
        .eq("state", state)
        .gt("expires_at", new Date().toISOString())
        .in("district", districts);

      // Only consider cached entries with non-zero counts as valid
      const validCached = (cached || []).filter((c: any) => {
        const counts = c.counts as POICounts;
        return !isZeroCounts(counts);
      });
      const cachedSet = new Set(validCached.map((c: any) => c.district));
      const uncached = districts.filter((d: string) => !cachedSet.has(d));

      console.log(`${cachedSet.size} already cached (valid), ${uncached.length} to process`);

      let processed = 0;
      let failed = 0;
      let timedOut = false;
      for (const dist of uncached) {
        // Time guard: stop before hitting the 150s edge function limit
        if (Date.now() - bulkStartTime > MAX_BULK_MS) {
          console.log(`Bulk time limit reached after ${processed} districts — returning partial results`);
          timedOut = true;
          break;
        }
        try {
          await processDistrict(state, dist);
          processed++;
          console.log(`Processed ${dist} (${processed}/${uncached.length})`);
          if (processed < uncached.length) {
            await new Promise(r => setTimeout(r, 500));
          }
        } catch (e) {
          failed++;
          console.error(`Failed to process ${dist}:`, e instanceof Error ? e.message : e);
        }
      }

      return new Response(
        JSON.stringify({ 
          message: timedOut ? "Bulk pre-populate partial — time limit reached" : "Bulk pre-populate complete",
          alreadyCached: cachedSet.size,
          processed,
          failed,
          remaining: timedOut ? uncached.length - processed - failed : 0,
          total: districts.length
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === SINGLE DISTRICT MODE (default) ===
    if (!state || !district) {
      return new Response(JSON.stringify({ error: "State and district are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing intelligence for: ${district}, ${state} (forceRefresh: ${!!forceRefresh})`);

    // 1. Check cache first (skip if forceRefresh)
    if (!forceRefresh) {
      const cached = await getCachedResult(state, district);
      if (cached) {
        console.log(`Cache HIT for ${district}, ${state}`);
        return new Response(JSON.stringify(cached), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.log(`Force refresh — bypassing cache for ${district}, ${state}`);
    }

    console.log(`Cache MISS for ${district}, ${state} — generating...`);

    // 2. Generate fresh data
    const result = await processDistrict(state, district);

    // If Overpass failed completely, return an error instead of zeros
    if (result.overpassFailed) {
      return new Response(JSON.stringify({
        error: "All Overpass API endpoints are currently unavailable. Please try again in a few minutes.",
        counts: result.counts,
        aiSummary: result.aiSummary,
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("District intelligence error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
