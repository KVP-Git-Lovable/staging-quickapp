// QuickApp Copilot — Today's visit action plan.
// Deterministic SQL signals + Together.ai narration. Auth required.
import { createClient } from "npm:@supabase/supabase-js@2";
import { streamChat, TogetherError, type ChatMessage } from "./services/togetherClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONFIRMED = new Set(["confirmed", "delivered", "invoiced", "completed", "dispatched", "packed"]);
const LOOKBACK_DAYS = 90;

function jsonError(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function num(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function inr(v: unknown) {
  return `₹${num(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "method_not_allowed", "Use POST");

  try {
    const apiKey = Deno.env.get("TOGETHER_API_KEY");
    if (!apiKey) return jsonError(500, "missing_key", "AI provider is not configured");

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return jsonError(401, "unauthorized", "Missing bearer token");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    const userId = (claims as any)?.claims?.sub as string | undefined;
    if (claimsError || !userId) {
      console.error("[copilot-visit-actions] auth failed:", claimsError?.message);
      return jsonError(401, "unauthorized", "Invalid session");
    }


    const today = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, name")
      .eq("id", userId)
      .maybeSingle();
    const userName =
      String((profile as any)?.full_name || (profile as any)?.name || "there").split(" ")[0];

    // --- Today's visits ---
    const { data: todayVisits, error: visitsError } = await supabase
      .from("visits")
      .select("id, retailer_id, status, check_in_time, check_out_time")
      .eq("user_id", userId)
      .eq("planned_date", today)
      .order("created_at", { ascending: true })
      .limit(100);
    if (visitsError) throw visitsError;

    const retailerIds = [...new Set((todayVisits ?? []).map((v: any) => v.retailer_id).filter(Boolean))];
    if (!retailerIds.length) {
      return new Response(JSON.stringify({ plan: null, empty: true, date: today }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: retailers } = await supabase
      .from("retailers")
      .select("id, name, beat_name, pending_amount")
      .in("id", retailerIds);
    const retailerMap = new Map((retailers ?? []).map((r: any) => [r.id, r]));
    const nameOf = (id: string) => String(retailerMap.get(id)?.name ?? "Retailer");

    // --- History for these retailers ---
    const { data: histVisits } = await supabase
      .from("visits")
      .select("id, retailer_id, planned_date, check_in_time, check_out_time")
      .eq("user_id", userId)
      .in("retailer_id", retailerIds)
      .gte("planned_date", since)
      .lte("planned_date", today)
      .order("planned_date", { ascending: false })
      .limit(1000);

    const { data: histOrders } = await supabase
      .from("orders")
      .select("id, retailer_id, visit_id, status, total_amount, order_date")
      .eq("user_id", userId)
      .in("retailer_id", retailerIds)
      .gte("order_date", since)
      .limit(1000);

    const confirmedByVisit = new Set<string>();
    const orderValueByRetailer = new Map<string, number>();
    const confirmedCountByRetailer = new Map<string, number>();
    (histOrders ?? []).forEach((o: any) => {
      if (!CONFIRMED.has(String(o.status ?? "").toLowerCase())) return;
      if (o.visit_id) confirmedByVisit.add(String(o.visit_id));
      const rid = String(o.retailer_id);
      orderValueByRetailer.set(rid, (orderValueByRetailer.get(rid) ?? 0) + num(o.total_amount));
      confirmedCountByRetailer.set(rid, (confirmedCountByRetailer.get(rid) ?? 0) + 1);
    });

    const visitsByRetailer = new Map<string, any[]>();
    (histVisits ?? []).forEach((v: any) => {
      const rid = String(v.retailer_id);
      const list = visitsByRetailer.get(rid) ?? [];
      list.push(v);
      visitsByRetailer.set(rid, list);
    });

    // 1) Churn: no confirmed order across the last 3 visits.
    const churn: { name: string; visitsChecked: number; lastOrderValue: number }[] = [];
    // 2) Productivity: confirmed orders per visit + avg value.
    const productivity: { name: string; visits: number; orders: number; rate: number; value: number }[] = [];
    // 3) Dwell time: average minutes between check-in and check-out.
    const dwell: { name: string; avgMinutes: number; samples: number }[] = [];

    for (const rid of retailerIds) {
      const list = (visitsByRetailer.get(String(rid)) ?? []).filter((v: any) => v.check_in_time);
      const last3 = list.slice(0, 3);
      if (last3.length && last3.every((v: any) => !confirmedByVisit.has(String(v.id)))) {
        churn.push({
          name: nameOf(String(rid)),
          visitsChecked: last3.length,
          lastOrderValue: orderValueByRetailer.get(String(rid)) ?? 0,
        });
      }

      if (list.length) {
        const orders = confirmedCountByRetailer.get(String(rid)) ?? 0;
        productivity.push({
          name: nameOf(String(rid)),
          visits: list.length,
          orders,
          rate: Math.round((orders / list.length) * 100),
          value: orderValueByRetailer.get(String(rid)) ?? 0,
        });
      }

      const durations = list
        .filter((v: any) => v.check_in_time && v.check_out_time)
        .map((v: any) => (new Date(v.check_out_time).getTime() - new Date(v.check_in_time).getTime()) / 60000)
        .filter((m: number) => Number.isFinite(m) && m > 0 && m < 12 * 60);
      if (durations.length) {
        dwell.push({
          name: nameOf(String(rid)),
          avgMinutes: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
          samples: durations.length,
        });
      }
    }

    productivity.sort((a, b) => a.rate - b.rate || a.value - b.value);
    dwell.sort((a, b) => b.avgMinutes - a.avgMinutes);

    const facts = [
      `Today's date: ${today}`,
      `Planned visits today: ${(todayVisits ?? []).length} retailer stops.`,
      "",
      "### Churn risk — no confirmed order in their last 3 visits",
      churn.length
        ? churn.slice(0, 5).map((c) => `- ${c.name} (last ${c.visitsChecked} visits, 90-day order value ${inr(c.lastOrderValue)})`).join("\n")
        : "- None. Every retailer in today's plan ordered within their last 3 visits.",
      "",
      "### Lowest productivity (confirmed orders per visit, last 90 days)",
      productivity.length
        ? productivity.slice(0, 5).map((p) => `- ${p.name}: ${p.orders} orders in ${p.visits} visits (${p.rate}% strike rate, ${inr(p.value)})`).join("\n")
        : "- Not enough visit history to rank productivity.",
      "",
      "### Highest time spent per visit (check-out minus check-in, last 90 days)",
      dwell.length
        ? dwell.slice(0, 5).map((d) => `- ${d.name}: ${d.avgMinutes} min average across ${d.samples} visits`).join("\n")
        : "- No completed check-in/check-out pairs recorded.",
    ].join("\n");

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are QuickApp Copilot, a friendly and diplomatic field-sales assistant. " +
          `Greet the user as "Hi ${userName}, I have gathered some action plan for your Today's Visit..." and keep the tone warm, encouraging and never blaming. ` +
          "Use ONLY the figures in the DATA block — never invent retailers, numbers or dates. Use ₹ for currency. " +
          "Reply in compact markdown with exactly three short sections: 'Churn watch', 'Productivity focus', and 'Time spent'. " +
          "Under each section list the named retailers with their figures, then a single line starting with 'Suggested step:' giving one practical, respectful action. " +
          "Finish with one encouraging closing line. Keep the whole reply under 220 words.",
      },
      { role: "user", content: `DATA\n---\n${facts}\n---\nWrite my action plan for today's visit.` },
    ];

    const stream = await streamChat({ apiKey, messages, signal: req.signal });
    // streamChat is pull-based: fullText resolves only while tokens are actively
    // consumed. This endpoint returns JSON rather than forwarding the stream, so
    // drain it here to prevent the request from idling until the edge timeout.
    const drainTokens = (async () => {
      const reader = stream.tokens.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) return;
      }
    })();
    const [plan] = await Promise.all([stream.fullText, drainTokens]);

    return new Response(
      JSON.stringify({
        plan: plan.trim(),
        empty: false,
        date: today,
        retailers: (todayVisits ?? []).map((v: any) => ({
          id: v.id,
          retailerId: v.retailer_id,
          name: nameOf(String(v.retailer_id)),
          beat: retailerMap.get(v.retailer_id)?.beat_name ?? null,
          status: v.status ?? null,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof TogetherError) {
      console.error("[copilot-visit-actions] together error:", err.status, err.message);
      return jsonError(err.status === 429 ? 429 : 502, err.code, "AI provider request failed");
    }
    console.error("[copilot-visit-actions] fatal:", err);
    return jsonError(500, "internal_error", err instanceof Error ? err.message : "Unknown error");
  }
});
