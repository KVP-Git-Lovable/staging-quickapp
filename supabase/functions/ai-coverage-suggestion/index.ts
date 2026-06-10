// AI coverage suggestion — ranks candidate teammates for covering a rep's beats
// during a leave window, based on proximity, workload, and recent coverage history.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Candidate {
  user_id: string;
  full_name: string;
  designation?: string | null;
  current_workload: number;       // retailers planned today
  proximity_km: number | null;    // distance from leave rep's beats centroid
  covered_recent_count: number;   // recent coverage assignments
}

interface Payload {
  leaveRepName: string;
  beatsToCover: { beat_id: string; beat_name: string; retailer_count: number }[];
  dateRange: { start: string; end: string };
  candidates: Candidate[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const p = (await req.json()) as Payload;
    if (!p?.leaveRepName || !Array.isArray(p.candidates)) {
      return new Response(JSON.stringify({ error: "leaveRepName and candidates required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const beatLine = (p.beatsToCover || []).map((b) => `${b.beat_name} (${b.retailer_count})`).join(", ") || "—";
    const candLines = p.candidates.map((c, i) =>
      `${i + 1}. ${c.full_name} | workload ${c.current_workload} retailers | ` +
      `proximity ${c.proximity_km != null ? c.proximity_km.toFixed(1) + " km" : "?"} | ` +
      `recent covers ${c.covered_recent_count}`,
    ).join("\n");

    const prompt = `You help a sales coordinator pick the best teammate to cover a rep on leave.

Rep on leave: ${p.leaveRepName}
Date range: ${p.dateRange.start} → ${p.dateRange.end}
Beats to cover: ${beatLine}

Candidates:
${candLines}

Rank candidates by suitability (proximity weighs most, then low current workload, then fair recent-cover distribution).
Return STRICT JSON only:
{"ranked":[{"user_id":"...","full_name":"...","score":0-100,"reason":"short 1 sentence"}]}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Return strict JSON only." },
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
    console.error("ai-coverage-suggestion error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
