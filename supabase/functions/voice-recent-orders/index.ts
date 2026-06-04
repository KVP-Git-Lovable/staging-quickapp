import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  corsHeaders,
  emptyBodyResponse,
  findRetailerByPhone,
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
      .select("id, status, total_amount, created_at")
      .eq("retailer_id", retailer.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!orders || orders.length === 0) {
      return json(200, { error: true, message: "No data found" });
    }

    return json(200, {
      count: orders.length,
      latest_order_amount: Number(orders[0].total_amount ?? 0),
      latest_order_status: orders[0].status || "pending",
    });
  } catch (err) {
    console.error("voice-recent-orders error:", err);
    return json(500, { error: true, message: (err as Error).message });
  }
});
