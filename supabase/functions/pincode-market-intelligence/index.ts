import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { pincode, territories, taluka, retailer_count, categories } = await req.json();

    if (!pincode) {
      return new Response(JSON.stringify({ error: "pincode is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const categoryDesc = categories && categories.length > 0
      ? categories.map((c: any) => `${c.category} (${(c.subcategories || []).join(", ")})`).join("; ")
      : "FMCG products";

    const prompt = `You are a market intelligence analyst for an FMCG distribution company in India.

Given this context:
- PIN Code: ${pincode}
- Area/Taluka: ${taluka || "Unknown"}
- Territories: ${(territories || []).join(", ") || "Unknown"}
- Number of external retailers found in this area: ${retailer_count || 0}
- Company's product categories: ${categoryDesc}

Provide 3-4 concise bullet points of market intelligence specific to this PIN code area:
1. Demand potential for the company's products in this area
2. Competition landscape and existing distribution
3. Distribution strategy recommendation
4. Any seasonal or demographic insights

Keep each bullet to 1-2 sentences. Be specific and actionable. Do not use markdown headers, just bullet points starting with •.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a concise market intelligence analyst for Indian FMCG distribution. Give actionable, location-specific insights." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const insight = result.choices?.[0]?.message?.content || "No insights available.";

    return new Response(JSON.stringify({ insight, pincode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("pincode-market-intelligence error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
