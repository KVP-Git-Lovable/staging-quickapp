// Lovable AI Gateway-backed route suggestion for coordinator beat planning
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Stop {
  name: string;
  priority?: string | null;
  pending_amount?: number | null;
  last_visit_date?: string | null;
  daysSinceLastVisit?: number | null;
  avg_order_per_visit_3m?: number | null;
  productive_visits_3m?: number | null;
  total_visits_3m?: number | null;
  avgTimeMin?: number | null;
  distFromPrev?: number | string | null;
  dist_from_prev_km?: number | null;
}

interface Payload {
  repName: string;
  designation?: string;
  startLabel?: string;
  startLat?: number | null;
  startLng?: number | null;
  sortMode?: string;
  totalKm?: number;
  totalDistanceKm?: number;
  totalStops?: number;
  priorityACount?: number;
  totalPendingDues?: number;
  alreadyTravelledKm?: number | null;
  stops: Stop[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const payload = (await req.json()) as Payload;
    if (!payload?.repName || !Array.isArray(payload.stops)) {
      return new Response(
        JSON.stringify({ error: "repName and stops are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const totalKm = payload.totalDistanceKm ?? payload.totalKm ?? 0;
    const totalStops = payload.totalStops ?? payload.stops.length;
    const priorityACount =
      payload.priorityACount ??
      payload.stops.filter((s) => (s.priority || "").toUpperCase() === "A").length;
    const totalPending =
      payload.totalPendingDues ??
      payload.stops.reduce((s, r) => s + (r.pending_amount ?? 0), 0);

    const stopsList = payload.stops
      .map((s, i) => {
        const dist = s.distFromPrev ?? s.dist_from_prev_km ?? 0;
        const distStr =
          typeof dist === "number" ? dist.toFixed(2) : String(dist);
        return (
          `${i + 1}. ${s.name}` +
          ` | Priority ${s.priority || "-"}` +
          ` | Pending ₹${s.pending_amount ?? 0}` +
          ` | Last visit ${
            s.daysSinceLastVisit != null
              ? s.daysSinceLastVisit + "d ago"
              : s.last_visit_date || "never"
          }` +
          ` | Avg order ₹${Math.round(s.avg_order_per_visit_3m ?? 0)}` +
          ` | Productive ${s.productive_visits_3m ?? 0}/${s.total_visits_3m ?? 0}` +
          ` | Visit ~${s.avgTimeMin ?? 15}min` +
          ` | ${distStr}km from prev`
        );
      })
      .join("\n");

    const prompt = `You are an expert FMCG field sales route optimizer for India.

Rep: ${payload.repName}${payload.designation ? ` (${payload.designation})` : ""}
Starting from: ${payload.startLabel || `${payload.startLat ?? "?"}, ${payload.startLng ?? "?"}`}
${payload.alreadyTravelledKm ? `Already travelled today: ${payload.alreadyTravelledKm} km` : ""}

Today's ${totalStops} retailers in geo-optimised order:
${stopsList}

Route summary: ${totalKm.toFixed(1)} km total · ${priorityACount} Priority A · ₹${totalPending.toLocaleString("en-IN")} pending dues

Give a practical 4-5 sentence suggestion covering:
1. Which retailers to prioritise first by name (use pending dues + priority)
2. Any geo reorder that saves significant distance (mention specific names)
3. Retailers needing special attention (high dues or long since visit)
4. Realistic time estimate for completing the route
5. One specific business insight

Rules: Use retailer names directly. Be specific with numbers. Plain text only, no markdown, no bullets, no headers. Max 5 sentences.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: "You are an expert FMCG field sales route optimizer. Reply in plain text only. No markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const suggestion: string = data?.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ suggestion }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-route-suggestion error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
