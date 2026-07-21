// Employee Portal API — handles login lookup and retailer search using service role
// so the public (unauthenticated) portal doesn't need broad RLS grants.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Normalize phone: keep last 10 digits (India)
function normPhone(p: string) {
  const digits = (p || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "login") {
      const phone = normPhone(String(body.phone || ""));
      const pin = String(body.pin || "");
      if (!phone) return json(200, { success: false, error: "Phone is required" });

      // Match by trailing 10 digits — tolerant of stored formats
      const { data: emps, error } = await supabase
        .from("employee_directory")
        .select("*")
        .or(`phone.eq.${phone},phone.ilike.%${phone}`)
        .limit(5);
      if (error) return json(200, { success: false, error: error.message });

      const emp = (emps || []).find((e: any) => normPhone(e.phone) === phone);
      if (!emp) return json(200, { success: false, error: "No employee found with this phone" });
      if (!emp.portal_enabled)
        return json(200, { success: false, error: "Market intelligence portal is not enabled for you." });
      if (emp.portal_pin && emp.portal_pin !== pin)
        return json(200, { success: false, error: "Invalid PIN" });

      return json(200, { success: true, employee: emp });
    }

    if (action === "search_retailers") {
      const q = String(body.q || "").trim();
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      const limit = Math.min(Number(body.limit) || 100, 300);

      let query = supabase
        .from("retailers")
        .select("id,name,address,phone,latitude,longitude,territory_id");

      if (q) {
        // Case-insensitive OR search across name, phone, address
        const like = `%${q}%`;
        query = query.or(
          `name.ilike.${like},phone.ilike.${like},address.ilike.${like}`,
        );
      }
      const { data, error } = await query
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) return json(200, { success: false, error: error.message });

      let rows = data || [];
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const R = 6371;
        const toRad = (v: number) => (v * Math.PI) / 180;
        rows = rows
          .map((r: any) => {
            const rlat = Number(r.latitude);
            const rlng = Number(r.longitude);
            let dist = Infinity;
            if (Number.isFinite(rlat) && Number.isFinite(rlng)) {
              const dLat = toRad(rlat - lat);
              const dLon = toRad(rlng - lng);
              const a =
                Math.sin(dLat / 2) ** 2 +
                Math.cos(toRad(lat)) * Math.cos(toRad(rlat)) * Math.sin(dLon / 2) ** 2;
              dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            }
            return { ...r, _dist: dist };
          })
          .sort((a: any, b: any) => a._dist - b._dist);
      }
      return json(200, { success: true, retailers: rows });
    }

    if (action === "list_partners") {
      const excludeId = String(body.exclude_id || "");
      let q = supabase
        .from("employee_directory")
        .select("id,full_name,employee_code,department")
        .order("full_name", { ascending: true })
        .limit(500);
      if (excludeId) q = q.neq("id", excludeId);
      const { data, error } = await q;
      if (error) return json(200, { success: false, error: error.message });
      return json(200, { success: true, partners: data || [] });
    }

    if (action === "save_visit") {
      const v = body.visit || {};
      if (!v.employee_id) return json(200, { success: false, error: "employee_id required" });
      const { data, error } = await supabase
        .from("employee_market_visits")
        .insert(v)
        .select("*")
        .single();
      if (error) return json(200, { success: false, error: error.message });
      return json(200, { success: true, visit: data });
    }

    if (action === "list_visits") {
      const employeeId = String(body.employee_id || "");
      if (!employeeId) return json(200, { success: false, error: "employee_id required" });
      const { data, error } = await supabase
        .from("employee_market_visits")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return json(200, { success: false, error: error.message });
      return json(200, { success: true, visits: data || [] });
    }

    if (action === "update_visit") {
      const id = String(body.visit_id || "");
      const patch = body.patch || {};
      if (!id) return json(200, { success: false, error: "visit_id required" });
      const { data, error } = await supabase
        .from("employee_market_visits")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) return json(200, { success: false, error: error.message });
      return json(200, { success: true, visit: data });
    }

    if (action === "delete_visit") {
      const id = String(body.visit_id || "");
      if (!id) return json(200, { success: false, error: "visit_id required" });
      const { error } = await supabase
        .from("employee_market_visits")
        .delete()
        .eq("id", id);
      if (error) return json(200, { success: false, error: error.message });
      return json(200, { success: true });
    }

    return json(200, { success: false, error: `Unknown action: ${action}` });
  } catch (err) {
    console.error("employee-portal-api error:", err);
    return json(200, { success: false, error: (err as Error).message });
  }
});
