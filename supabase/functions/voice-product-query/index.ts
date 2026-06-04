import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  corsHeaders,
  emptyBodyResponse,
  findRetailerByPhone,
  invalidPhoneResponse,
  json,
  parseBolnaPayload,
  searchProducts,
} from "../_shared/bolna.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  try {
    const { payload } = await parseBolnaPayload(req);
    const phone = (payload as any).phone;
    const query = String((payload as any).query ?? (payload as any).product_name ?? "");
    if (!phone) return emptyBodyResponse();
    if (!query) return json(200, { error: true, message: "No data found" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    const retailer = await findRetailerByPhone(supabase, phone);
    if (!retailer) return invalidPhoneResponse();

    const hits = await searchProducts(supabase, query, 3);
    if (hits.length === 0) {
      return json(200, { error: true, message: "No data found" });
    }

    const isCount = /\b(how many|kitne|count|stock|available|quantity)\b/i.test(query);
    const top = hits[0];

    if (isCount) {
      return json(200, {
        type: "count",
        value: Number(top.closing_stock ?? 0),
        product: top.name,
      });
    }
    return json(200, {
      type: "category",
      value: `${top.name} available`,
      product: top.name,
    });
  } catch (err) {
    console.error("voice-product-query error:", err);
    return json(500, { error: true, message: (err as Error).message });
  }
});
