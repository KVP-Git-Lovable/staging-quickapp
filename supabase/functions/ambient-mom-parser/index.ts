// Retailer Meet Summary (MOM) parser — turns the Order Scribe transcript
// into structured meeting notes. Same privacy/auth posture as
// ambient-order-parser: the transcript reaches this function ONLY when the
// user explicitly presses Generate MOM; nothing is persisted here. Served by
// the app's existing Together.ai configuration (_shared/together).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { MODEL, TOGETHER_URL } from "../_shared/together/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_TRANSCRIPT_CHARS = 6000;
const MAX_ORDER_ITEMS = 40;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const strArr = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v)
    ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim().slice(0, maxLen)).slice(0, maxItems)
    : [];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(401, { error: "Unauthorized" });
    }

    const { transcript, retailerName, orderItems } = await req.json();
    if (!transcript || !String(transcript).trim()) {
      return json(400, { error: "No transcript provided" });
    }

    const apiKey = Deno.env.get("TOGETHER_API_KEY");
    if (!apiKey) {
      console.error("TOGETHER_API_KEY not configured");
      return json(500, { error: "parser_unavailable" });
    }

    const clippedTranscript = String(transcript).slice(-MAX_TRANSCRIPT_CHARS);
    const store = String(retailerName ?? "").trim().slice(0, 120);
    const items: string[] = Array.isArray(orderItems)
      ? orderItems.map((i: unknown) => String(i)).filter(Boolean).slice(0, MAX_ORDER_ITEMS)
      : [];

    const systemPrompt = `You write concise minutes-of-meeting (MOM) notes from a spoken conversation between a field salesperson and a retail store owner.

LANGUAGE RULE: Write in the SAME language as the conversation. Hindi conversation (Devanagari) → Hindi notes in Devanagari. Kannada conversation (ಕನ್ನಡ script) → Kannada notes in Kannada script. English → English. Hinglish → Hinglish as spoken. Never translate.

CONTENT RULES:
1. Summarize concisely — short plain sentences, no filler.
2. Capture: retailer requirements/preferences, complaints/issues/requests/opportunities, commitments made by EITHER party, actionable follow-ups, and a next-visit date/time ONLY if one was actually spoken.
3. STRICTLY distinguish facts from inference: anything not stated outright in the conversation but reasonably inferred MUST end with "(inferred)". NEVER invent commitments, dates, quantities, or promises — omit rather than guess.
4. Empty arrays are correct when the conversation contains nothing for a section.
5. nextVisit is a short string only if a next visit was explicitly discussed, else null.
${store ? `\nSTORE CONTEXT: this conversation is at "${store}".` : ""}${items.length ? `\nORDER ITEMS ALREADY CAPTURED (do not repeat them as commitments; reference only if discussed): ${items.join(", ")}` : ""}

Return STRICT JSON only, exactly this shape — no markdown, no extra keys:
{"summary":"...","discussionPoints":[],"customerNeeds":[],"commitments":[],"followUps":[],"issues":[],"nextVisit":null}`;

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
        max_tokens: 900,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `CONVERSATION\n---\n${clippedTranscript}\n---\nWrite the MOM notes.` },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Together error:", response.status, errorText);
      if (response.status === 429) return json(429, { error: "Rate limit exceeded. Please try again later." });
      if (response.status === 402) return json(402, { error: "AI service credits exhausted." });
      return json(500, { error: "AI processing failed" });
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || "{}";

    let parsed: Record<string, unknown> = {};
    try {
      const match = aiResponse.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      return json(500, { error: "AI returned an unreadable response" });
    }

    // Deterministic shape validation — the client renders only these fields.
    const mom = {
      summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 1200) : "",
      discussionPoints: strArr(parsed.discussionPoints, 12, 240),
      customerNeeds: strArr(parsed.customerNeeds, 12, 240),
      commitments: strArr(parsed.commitments, 12, 240),
      followUps: strArr(parsed.followUps, 12, 240),
      issues: strArr(parsed.issues, 12, 240),
      nextVisit: typeof parsed.nextVisit === "string" && parsed.nextVisit.trim()
        ? parsed.nextVisit.trim().slice(0, 160)
        : null,
    };
    if (!mom.summary) return json(500, { error: "AI returned no summary" });

    // Diagnostics: section sizes only — never the transcript or note content.
    console.log(
      `[ambient-mom-parser] mom generated: summaryChars=${mom.summary.length} points=${mom.discussionPoints.length} needs=${mom.customerNeeds.length} commitments=${mom.commitments.length} followUps=${mom.followUps.length} issues=${mom.issues.length} nextVisit=${mom.nextVisit ? "yes" : "no"}`,
    );

    return json(200, { mom });
  } catch (error) {
    console.error("Ambient MOM parser error:", error);
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
