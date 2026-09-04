// Ambient Order Scribe parser — same request/response contract as
// voice-order-parser, but served by the app's existing Together.ai
// configuration (_shared/together) instead of the Lovable gateway.
// The transcript reaches this function ONLY when the user explicitly
// presses Accept on the Order Scribe card; nothing is persisted here.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { MODEL, TOGETHER_URL } from "../_shared/together/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Defense in depth: the client clamps before sending, the server clamps again.
const MAX_TRANSCRIPT_CHARS = 4000;
const MAX_PRODUCT_NAMES = 150;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // verify_jwt=true already gates this, but reject explicitly as well so a
    // misconfigured deploy can never serve anonymous transcripts.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(401, { error: "Unauthorized" });
    }

    const { transcript, productNames } = await req.json();

    if (!transcript || !String(transcript).trim()) {
      return json(400, { error: "No transcript provided" });
    }

    const apiKey = Deno.env.get("TOGETHER_API_KEY");
    if (!apiKey) {
      console.error("TOGETHER_API_KEY not configured");
      // Explicit signal: the client falls back to its local heuristic and
      // does not send the transcript anywhere else.
      return json(500, { error: "parser_unavailable" });
    }

    const clippedTranscript = String(transcript).slice(-MAX_TRANSCRIPT_CHARS);
    const names: string[] = Array.isArray(productNames)
      ? productNames.map((n: unknown) => String(n)).filter(Boolean).slice(0, MAX_PRODUCT_NAMES)
      : [];

    const systemPrompt = `You are an order parsing assistant for a sales app. Parse a spoken conversation between a salesperson and a store owner into structured product orders.

CRITICAL PATTERN - Speakers say: "[quantity] [unit] [product name with variant]" or "[product name with variant] [quantity] [unit]".
The product name includes the variant/size info.

EXAMPLES:
- "mujhe 3 kg adarak chahiye" → productSearch: "adarak", quantity: 3, unit: "kg"
- "2kg red label" → productSearch: "red label", quantity: 2, unit: "kg"
- "5 kilo kadak gold 250" → productSearch: "kadak gold 250", quantity: 5, unit: "kg"
- "adrak 20 gram 2 kg" → productSearch: "adrak 20 gram", quantity: 2, unit: "kg"
- "mirch 100g 10 packets" → productSearch: "mirch 100g", quantity: 10, unit: "packets"
- "adarak 20g 5" (no unit spoken) → productSearch: "adarak 20g", quantity: 5, unit: ""

RULES:
1. The product name/search term includes variant info (like "20 gram", "50g", "250")
2. Normalise spoken units: "kilo"/"kilogram" → "kg", "gram"/"gm" → "g"
3. Handle Hindi/English mixed inputs (adrak, haldi, mirch, chahiye, de do, etc.)
4. Ignore conversation filler that is not an order line (greetings, prices being discussed, refusals like "nahi chahiye")
5. If quantity is unclear, default to 1
6. If unit is unclear or not clearly spoken, return unit as an empty string "" — do NOT guess "kg". A wrong "kg" guess on a product actually sold by the gram multiplies the order size 1000x, so an uncertain unit must be left blank for the app to resolve from the product's own catalog unit, not guessed here.
7. NEVER invent products that were not spoken.

AVAILABLE PRODUCTS (match product names to these):
${names.length ? names.join(", ") : "No product list provided"}

Return ONLY a valid JSON array:
[
  {"productSearch": "adarak", "quantity": 3, "unit": "kg"},
  {"productSearch": "kadak gold 250", "quantity": 5, "unit": "kg"}
]

If you cannot parse any products, return an empty array: []`;

    const response = await fetch(TOGETHER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        temperature: 0,
        max_tokens: 800,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Parse this conversation: "${clippedTranscript}"` },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Together error:", response.status, errorText);
      if (response.status === 429) {
        return json(429, { error: "Rate limit exceeded. Please try again later." });
      }
      if (response.status === 402) {
        return json(402, { error: "AI service credits exhausted." });
      }
      return json(500, { error: "AI processing failed" });
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || "[]";

    let parsedOrders: unknown[] = [];
    try {
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) parsedOrders = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      parsedOrders = [];
    }
    if (!Array.isArray(parsedOrders)) parsedOrders = [];

    return json(200, { orders: parsedOrders });
  } catch (error) {
    console.error("Ambient order parser error:", error);
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
