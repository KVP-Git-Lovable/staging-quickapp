// AI weekly route plan for a rep — recommends a Mon-Sat beat order based on
// retailer geography, last-served recency, and pending dues.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Beat {
  beat_id: string;
  beat_name: string;
  retailer_count: number;
  centroid_lat: number | null;
  centroid_lng: number | null;
  last_served_days_ago: number | null;
  pending_dues: number;
}

interface Payload {
  repName: string;
  weekStart: string; // Mon
  beats: Beat[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    const payload = (await req.json()) as Payload;
    if (!payload?.repName || !Array.isArray(payload.beats) || payload.beats.length === 0) {
      return new Response(JSON.stringify({ error: "repName and beats are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const beatLines = payload.beats.map((b, i) =>
      `${i + 1}. ${b.beat_name} | ${b.retailer_count} retailers | ` +
      `last served ${b.last_served_days_ago ?? "never"}d ago | ` +
      `pending ₹${Math.round(b.pending_dues)} | ` +
      `centroid ${b.centroid_lat?.toFixed(4) ?? "?"},${b.centroid_lng?.toFixed(4) ?? "?"}`,
    ).join("\n");

    const prompt = `You are an expert FMCG route planner.

Rep: ${payload.repName}
Week starting: ${payload.weekStart} (Monday)

Owned beats:
${beatLines}

Goal: Suggest which beat(s) to assign on each weekday (Mon-Sat) so that:
- Stale beats (high days-since-served) are covered earlier in the week.
- Beats with high pending dues get priority.
- Travel is minimised — group geographically close beats on consecutive days.
- Larger beats (more retailers) get full days; smaller beats can share a day.

Return STRICT JSON only (no markdown), shape:
{"days":[{"date":"YYYY-MM-DD","day":"Mon","beats":[{"beat_id":"...","beat_name":"..."}],"reason":"short"}],
"summary":"2-3 sentence plain text overview"}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: "Return strict JSON only. No markdown, no commentary." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) return new Response(JSON.stringify({ error: "Rate limit, retry shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = { raw: content }; }
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ai-weekly-route-plan error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
