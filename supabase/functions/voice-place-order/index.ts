import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  corsHeaders,
  emptyBodyResponse,
  findRetailerByPhone,
  invalidPhoneResponse,
  json,
  parseBolnaPayload,
  searchProducts,
  type ProductHit,
} from "../_shared/bolna.ts";

function splitNames(raw: string): string[] {
  // Split on common conjunctions / separators.
  const parts = String(raw)
    .split(/\s*(?:,| and | & | aur )\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [String(raw).trim()];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  try {
    const { payload } = await parseBolnaPayload(req);
    console.log("RAW PAYLOAD:", JSON.stringify(payload));

    const cleanValue = (value: any): string => {
      if (value == null) return "";
      return String(value)
        .trim()
        .replace(/^\{+/, "")
        .replace(/\}+$/, "")
        .trim();
    };

    const phone = cleanValue((payload as any).phone);
    const productNameRaw = cleanValue((payload as any).product_name);
    const quantityClean = cleanValue((payload as any).quantity);
    let quantityRaw: any;
    if (quantityClean.includes(",")) {
      quantityRaw = quantityClean.split(",").map((s) => Number(cleanValue(s)) || 1);
    } else {
      quantityRaw = Number(quantityClean) || 1;
    }

    console.log("SANITIZED:", { phone, quantity: quantityRaw, product_name: productNameRaw });

    if (!phone) return emptyBodyResponse();
    if (!productNameRaw) {
      return json(200, { success: false, message: "Missing product_name" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    const retailer = await findRetailerByPhone(supabase, phone);
    if (!retailer) return invalidPhoneResponse();

    // Build (name, qty) pairs supporting multi-product.
    const names = splitNames(String(productNameRaw));
    const qtyArr: number[] = Array.isArray(quantityRaw)
      ? quantityRaw.map((q) => Number(q) || 1)
      : names.map(() => Number(quantityRaw) || 1);
    while (qtyArr.length < names.length) qtyArr.push(qtyArr[qtyArr.length - 1] || 1);

    const isMulti = names.length > 1;
    const resolved: Array<{ hit: ProductHit; quantity: number }> = [];
    const failed: string[] = [];

    for (let i = 0; i < names.length; i++) {
      if (i === 0) {
        const probe = await supabase
          .from("products")
          .select("id,name,is_active")
          .ilike("name", `%${names[i].split(" ")[0]}%`)
          .limit(3);
        console.log("DEBUG PRODUCT PROBE:", {
          term: names[i].split(" ")[0],
          error: probe.error,
          count: probe.data?.length ?? 0,
          sample: probe.data?.map((p) => p.name),
        });
      }
      console.log("QUERY:", names[i]);
      const hits = await searchProducts(supabase, names[i], 3);
      if (hits.length === 0) {
        failed.push(names[i]);
        continue;
      }
      const top = hits[0];
      const delta = hits.length > 1 ? top.score - hits[1].score : 1;
      console.log("FINAL MATCH:", { requested: names[i], picked: top.name, score: top.score, delta });

      // Voice ordering: prefer "best probable match" over rejection.
      // Only ask for disambiguation when confidence is low AND multiple
      // candidates cluster near the top.
      if (!isMulti && top.score < 0.55 && delta < 0.1) {
        return json(200, {
          success: false,
          multiple_matches: true,
          matches: hits.slice(0, 3).map((h) => h.name),
        });
      }

      // Reject only when confidence is genuinely low.
      if (top.score < 0.35) {
        failed.push(names[i]);
        continue;
      }
      resolved.push({ hit: top, quantity: qtyArr[i] });
    }

    if (resolved.length === 0) {
      return json(200, {
        success: false,
        product_found: false,
        message: "Product not found",
      });
    }

    // Build order rows (raw insert mirrors prior Bolna implementation;
    // intentionally does NOT touch inventory/credit/visit logic).
    const today = new Date().toISOString().slice(0, 10);
    const subtotal = resolved.reduce(
      (sum, r) => sum + (Number(r.hit.rate) || 0) * r.quantity,
      0,
    );

    const orderRow: Record<string, unknown> = {
      retailer_id: retailer.id,
      retailer_name: retailer.name,
      user_id: retailer.user_id ?? retailer.owner_id ?? retailer.created_by ?? null,
      distributor_id: retailer.distributor_id ?? null,
      territory_id: retailer.territory_id ?? null,
      beat_id: retailer.beat_id ?? null,
      beat_name_snapshot: retailer.beat_name ?? null,
      subtotal,
      discount_amount: 0,
      total_amount: subtotal,
      status: "pending",
      order_source: "Voice",
      sales_channel: "field",
      order_date: today,
      idempotency_key: `bolna-${crypto.randomUUID()}`,
    };

    console.log("VOICE ORDER INSERT:", JSON.stringify(orderRow));
    const { data: orderIns, error: orderErr } = await supabase
      .from("orders")
      .insert(orderRow)
      .select("id, invoice_number")
      .single();

    if (orderErr || !orderIns) {
      console.error("Order insert failed:", orderErr);
      return json(500, {
        success: false,
        message: "Failed to create order",
        detail: orderErr?.message,
      });
    }

    const itemRows = resolved.map((r) => {
      const rate = Number(r.hit.rate) || 0;
      return {
        order_id: orderIns.id,
        product_id: r.hit.id,
        product_name: r.hit.name,
        rate,
        original_rate: rate,
        unit: r.hit.unit ?? "pcs",
        category: r.hit.category ?? "General",
        quantity: r.quantity,
        total: rate * r.quantity,
        discount_amount: 0,
      };
    });

    const { error: itemErr } = await supabase.from("order_items").insert(itemRows);
    if (itemErr) {
      console.error("Order items insert failed:", itemErr);
      // Best-effort cleanup of the parent row.
      await supabase.from("orders").delete().eq("id", orderIns.id);
      return json(500, {
        success: false,
        message: "Failed to create order items",
        detail: itemErr.message,
      });
    }

    const friendlyOrderId =
      orderIns.invoice_number || String(orderIns.id).slice(0, 8).toUpperCase();

    if (isMulti) {
      return json(200, {
        success: true,
        multi_product: true,
        order_id: friendlyOrderId,
        items: resolved.map((r) => ({ product: r.hit.name, quantity: r.quantity })),
        failed,
      });
    }

    const r0 = resolved[0];
    return json(200, {
      success: true,
      product_found: true,
      product_name: r0.hit.name,
      product: r0.hit.name,
      quantity: r0.quantity,
      order_id: friendlyOrderId,
    });
  } catch (err) {
    console.error("voice-place-order error:", err);
    return json(500, { success: false, message: (err as Error).message });
  }
});
