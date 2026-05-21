import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 100;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Count records needing pincode (pincode null/empty AND has city or address)
    const { count, error: countErr } = await supabase
      .from("retailer_external_db")
      .select("id", { count: "exact", head: true })
      .or("pincode.is.null,pincode.eq.")
      .not("city", "is", null);

    if (countErr) throw countErr;

    if (!count || count === 0) {
      return new Response(JSON.stringify({ message: "All records have pincodes", job_id: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job, error: jobErr } = await supabase
      .from("geocoding_jobs")
      .insert({ status: "processing", total_records: count, processed_records: 0, geocoded_count: 0, failed_count: 0 })
      .select()
      .single();

    if (jobErr) throw jobErr;

    EdgeRuntime.waitUntil(processAll(job.id, supabase));

    return new Response(JSON.stringify({ job_id: job.id, total_records: count, message: "Pincode matching started" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length >= 3);
}

function scoreMatch(record: { address: string | null; city: string | null }, pm: { officename: string | null; district: string | null }): number {
  const target = `${record.address || ""} ${record.city || ""}`.toLowerCase();
  const targetTokens = new Set(tokens(target));
  if (targetTokens.size === 0) return 0;
  const candTokens = tokens(`${pm.officename || ""} ${pm.district || ""}`);
  let overlap = 0;
  for (const t of candTokens) if (targetTokens.has(t)) overlap++;
  return overlap;
}

async function processAll(jobId: string, supabase: any) {
  let processed = 0;
  let matched = 0;
  let failed = 0;

  try {
    while (true) {
      const { data: rows, error } = await supabase
        .from("retailer_external_db")
        .select("id, address, city, state")
        .or("pincode.is.null,pincode.eq.")
        .not("city", "is", null)
        .limit(BATCH_SIZE);

      if (error) throw error;
      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        try {
          const city = (row.city || "").trim();
          if (!city) {
            await supabase.from("retailer_external_db").update({ pincode: "" }).eq("id", row.id);
            failed++;
            processed++;
            continue;
          }

          // Query pincode_master by city -> district ILIKE or officename ILIKE
          let q = supabase
            .from("pincode_master")
            .select("pincode, officename, district, statename")
            .or(`district.ilike.%${city}%,officename.ilike.%${city}%`)
            .limit(50);

          if (row.state) {
            q = q.ilike("statename", row.state);
          }

          const { data: candidates, error: cErr } = await q;

          if (cErr || !candidates || candidates.length === 0) {
            failed++;
            processed++;
            continue;
          }

          // Score and pick best
          let best = candidates[0];
          let bestScore = scoreMatch(row, best);
          for (const c of candidates.slice(1)) {
            const s = scoreMatch(row, c);
            if (s > bestScore) {
              bestScore = s;
              best = c;
            }
          }

          if (best?.pincode) {
            const { error: uErr } = await supabase
              .from("retailer_external_db")
              .update({ pincode: best.pincode })
              .eq("id", row.id);
            if (uErr) failed++;
            else matched++;
          } else {
            failed++;
          }
        } catch (e) {
          console.error(`Error for ${row.id}:`, e);
          failed++;
        }
        processed++;

        if (processed % 20 === 0) {
          await supabase.from("geocoding_jobs").update({
            processed_records: processed,
            geocoded_count: matched,
            failed_count: failed,
            updated_at: new Date().toISOString(),
          }).eq("id", jobId);
        }
      }
    }

    await supabase.from("geocoding_jobs").update({
      status: "completed",
      processed_records: processed,
      geocoded_count: matched,
      failed_count: failed,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    console.log(`Pincode match job ${jobId} done: ${matched} matched, ${failed} failed of ${processed}`);
  } catch (err) {
    console.error(`Job ${jobId} failed:`, err);
    await supabase.from("geocoding_jobs").update({
      status: "failed",
      processed_records: processed,
      geocoded_count: matched,
      failed_count: failed,
      error_message: err instanceof Error ? err.message : "Unknown",
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
  }
}
