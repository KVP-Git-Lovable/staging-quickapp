import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  corsHeaders,
  emptyBodyResponse,
  findRetailerByPhone,
  formatShortDate,
  invalidPhoneResponse,
  json,
  parseBolnaPayload,
} from "../_shared/bolna.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  try {
    const { payload } = await parseBolnaPayload(req);
    const phone = (payload as any).phone;
    if (!phone) return emptyBodyResponse();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    const retailer = await findRetailerByPhone(supabase, phone);
    if (!retailer) return invalidPhoneResponse();

    const { data: orders } = await supabase
      .from("orders")
      .select("id, invoice_number, status, delivery_date, created_at, total_amount")
      .eq("retailer_id", retailer.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!orders || orders.length === 0) {
      return json(200, { error: true, message: "No data found" });
    }

    const o = orders[0];
    const baseDate = o.delivery_date
      ? new Date(o.delivery_date)
      : new Date(new Date(o.created_at).getTime() + 3 * 86400000);

    return json(200, {
      order_id: o.invoice_number || String(o.id).slice(0, 8).toUpperCase(),
      status: o.status || "pending",
      expected_delivery: formatShortDate(baseDate),
    });
  } catch (err) {
    console.error("voice-order-status error:", err);
    return json(500, { error: true, message: (err as Error).message });
  }
});
