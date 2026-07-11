// Copilot tool registry — Phase 1
// Read tools run with the user's Supabase client so RLS scopes results.
// Write tools use needsApproval so the UI shows a confirm step before running.
import { tool } from "npm:ai@7.0.22";
import { z } from "npm:zod@4.4.3";

type SupaClient = ReturnType<typeof import("npm:@supabase/supabase-js@2").createClient>;

interface ToolCtx {
  supabase: SupaClient;
  userId: string;
  today: string; // YYYY-MM-DD in server tz
}

// ---------- READ TOOLS ----------

export function buildReadTools(ctx: ToolCtx) {
  const { supabase, userId, today } = ctx;

  return {
    get_leave_balance: tool({
      description: "Get the current user's leave balance grouped by leave type.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("leave_balance")
          .select("leave_type, total_days, used_days, pending_days")
          .eq("user_id", userId);
        if (error) return { error: error.message };
        const balances = (data ?? []).map((r: any) => ({
          leave_type: r.leave_type,
          available: Number(r.total_days || 0) - Number(r.used_days || 0) - Number(r.pending_days || 0),
          used: Number(r.used_days || 0),
          pending: Number(r.pending_days || 0),
        }));
        return { balances };
      },
    }),

    get_attendance_summary: tool({
      description:
        "Get the current user's attendance records (present/absent/leave/half-day counts, plus per-day rows) for any date range — current month, past months, or a custom range. ALWAYS call this tool when the user asks about their attendance, check-in/out, working days, or absences for any period (including past months like 'June 2026'). Never say you don't have access.",
      inputSchema: z.object({
        from_date: z.string().nullable().describe("YYYY-MM-DD; defaults to first of current month"),
        to_date: z.string().nullable().describe("YYYY-MM-DD; defaults to today"),
      }),
      execute: async ({ from_date, to_date }) => {
        const to = to_date || today;
        const from = from_date || `${today.slice(0, 7)}-01`;
        const { data, error } = await supabase
          .from("attendance")
          .select("date, status, check_in_time, check_out_time, total_hours")
          .eq("user_id", userId)
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: true });
        if (error) return { error: error.message };
        const counts: Record<string, number> = {};
        for (const r of data ?? []) counts[r.status] = (counts[r.status] || 0) + 1;
        return { from, to, counts, total_days: data?.length ?? 0, records: data ?? [] };
      },
    }),

    get_my_targets_vs_actual: tool({
      description: "Get the current user's active targets and their actual achievement so far.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("user_period_targets")
          .select("target_value, actual_value, target_metric, period_start, period_end, status")
          .eq("user_id", userId)
          .order("period_end", { ascending: false })
          .limit(10);
        if (error) return { error: error.message };
        return { targets: data ?? [] };
      },
    }),

    get_beats_not_visited: tool({
      description:
        "List beats the user hasn't visited in the last N days. Useful for coverage gaps.",
      inputSchema: z.object({ days: z.number().int().min(1).max(180).default(20) }),
      execute: async ({ days }) => {
        const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
        const { data: myBeats, error: bErr } = await supabase
          .from("beats")
          .select("id, beat_id, beat_name, area")
          .eq("assigned_to", userId);
        if (bErr) return { error: bErr.message };
        const { data: recentPlans } = await supabase
          .from("beat_plans")
          .select("beat_id, plan_date")
          .eq("user_id", userId)
          .gte("plan_date", since);
        const visited = new Set((recentPlans ?? []).map((p: any) => p.beat_id));
        const stale = (myBeats ?? []).filter((b: any) => !visited.has(b.id) && !visited.has(b.beat_id));
        return { days, count: stale.length, beats: stale.slice(0, 20) };
      },
    }),

    get_top_retailers: tool({
      description:
        "Top retailers by total order value in a period. Optionally scoped to a beat_id.",
      inputSchema: z.object({
        beat_id: z.string().nullable(),
        limit: z.number().int().min(1).max(50).default(10),
        days: z.number().int().min(1).max(365).default(30),
      }),
      execute: async ({ beat_id, limit, days }) => {
        const since = new Date(Date.now() - days * 86400_000).toISOString();
        let q = supabase
          .from("orders")
          .select("retailer_id, total_amount, retailers(name, beat_id)")
          .gte("created_at", since);
        if (beat_id) q = q.eq("retailers.beat_id", beat_id);
        const { data, error } = await q.limit(2000);
        if (error) return { error: error.message };
        const agg = new Map<string, { name: string; total: number }>();
        for (const o of data ?? []) {
          const rid = (o as any).retailer_id;
          if (!rid) continue;
          const prev = agg.get(rid) ?? { name: (o as any).retailers?.name ?? rid, total: 0 };
          prev.total += Number((o as any).total_amount || 0);
          agg.set(rid, prev);
        }
        const top = [...agg.entries()]
          .map(([id, v]) => ({ retailer_id: id, name: v.name, total: v.total }))
          .sort((a, b) => b.total - a.total)
          .slice(0, limit);
        return { period_days: days, retailers: top };
      },
    }),

    get_pending_collections: tool({
      description: "List retailers with pending payment amounts owed to the current user.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(15) }),
      execute: async ({ limit }) => {
        const { data, error } = await supabase
          .from("retailers")
          .select("id, name, pending_amount, phone")
          .gt("pending_amount", 0)
          .order("pending_amount", { ascending: false })
          .limit(limit);
        if (error) return { error: error.message };
        return { retailers: data ?? [] };
      },
    }),

    search_help: tool({
      description:
        "Search FAQs / help articles. Placeholder for Phase 2 RAG — currently returns nothing.",
      inputSchema: z.object({ query: z.string().min(1) }),
      execute: async ({ query }) => ({ query, results: [], note: "Knowledge base rolls out in Phase 2" }),
    }),

    find_screen: tool({
      description:
        "Given a user intent (e.g. 'add a retailer', 'apply leave'), return the app route.",
      inputSchema: z.object({ intent: z.string().min(1) }),
      execute: async ({ intent }) => {
        const map: Array<[RegExp, string, string]> = [
          [/add.*retailer|new retailer|create retailer/i, "/retailers/add", "Add Retailer"],
          [/apply.*leave|leave.*apply|new leave/i, "/leaves/apply", "Apply Leave"],
          [/attendance|check.?in|check.?out/i, "/attendance", "Attendance"],
          [/beat.*plan|plan.*journey|auto.?plan/i, "/my-visits", "My Visits / Plan Journey"],
          [/expense|petty cash|reimburs/i, "/expenses", "Expenses"],
          [/order|new order|place order/i, "/my-visits", "My Visits (Place Order)"],
          [/target|goal/i, "/targets", "Targets"],
          [/report/i, "/reports", "Reports"],
        ];
        for (const [rx, route, label] of map) {
          if (rx.test(intent)) return { route, label };
        }
        return { route: "/dashboard", label: "Dashboard", note: "No direct match; opened Dashboard." };
      },
    }),
  };
}

// ---------- WRITE TOOLS (needsApproval) ----------

export function buildWriteTools(ctx: ToolCtx) {
  const { supabase, userId } = ctx;

  return {
    apply_leave: tool({
      description: "Apply for leave. Requires user confirmation before executing.",
      inputSchema: z.object({
        leave_type: z.string(),
        from_date: z.string().describe("YYYY-MM-DD"),
        to_date: z.string().describe("YYYY-MM-DD"),
        reason: z.string().min(3),
      }),
      needsApproval: true,
      execute: async ({ leave_type, from_date, to_date, reason }) => {
        const { data, error } = await supabase
          .from("leave_applications")
          .insert({ user_id: userId, leave_type, from_date, to_date, reason, status: "pending" })
          .select("id")
          .maybeSingle();
        if (error) return { ok: false, error: error.message };
        return { ok: true, leave_id: data?.id };
      },
    }),

    mark_attendance: tool({
      description: "Mark attendance as check-in or check-out. Requires confirmation.",
      inputSchema: z.object({ kind: z.enum(["check_in", "check_out"]) }),
      needsApproval: true,
      execute: async ({ kind }) => {
        const nowIso = new Date().toISOString();
        const today = nowIso.slice(0, 10);
        if (kind === "check_in") {
          const { data, error } = await supabase
            .from("attendance")
            .insert({ user_id: userId, attendance_date: today, check_in_time: nowIso, status: "present" })
            .select("id")
            .maybeSingle();
          if (error) return { ok: false, error: error.message };
          return { ok: true, attendance_id: data?.id, kind };
        }
        const { data, error } = await supabase
          .from("attendance")
          .update({ check_out_time: nowIso })
          .eq("user_id", userId).eq("attendance_date", today)
          .select("id").maybeSingle();
        if (error) return { ok: false, error: error.message };
        return { ok: true, attendance_id: data?.id, kind };
      },
    }),

    raise_support: tool({
      description: "Raise a support ticket. Requires confirmation.",
      inputSchema: z.object({
        title: z.string().min(3),
        description: z.string().min(5),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
      }),
      needsApproval: true,
      execute: async ({ title, description, priority }) => {
        const { data, error } = await supabase
          .from("support_requests")
          .insert({ user_id: userId, title, description, priority, status: "open" })
          .select("id").maybeSingle();
        if (error) return { ok: false, error: error.message };
        return { ok: true, ticket_id: data?.id };
      },
    }),

    // Placeholders — full workflow ships in Phase 2 alongside RAG.
    create_order: tool({
      description:
        "Draft a secondary order for a retailer. Requires confirmation. Phase 1 returns a draft only.",
      inputSchema: z.object({
        retailer_id: z.string().uuid(),
        items: z.array(z.object({
          product_id: z.string().uuid(),
          quantity: z.number().positive(),
        })).min(1),
      }),
      needsApproval: true,
      execute: async ({ retailer_id, items }) => {
        return {
          ok: true,
          draft: true,
          message: "Draft prepared. Full order placement lands in Phase 2 — please review in the Cart screen.",
          retailer_id,
          items,
        };
      },
    }),

    plan_visit: tool({
      description: "Add retailers to today's or a future date's beat plan. Requires confirmation.",
      inputSchema: z.object({
        retailer_ids: z.array(z.string().uuid()).min(1),
        date: z.string().describe("YYYY-MM-DD"),
      }),
      needsApproval: true,
      execute: async ({ retailer_ids, date }) => {
        const { data, error } = await supabase
          .from("beat_plans")
          .upsert({
            user_id: userId,
            plan_date: date,
            beat_data: { retailer_ids },
          }, { onConflict: "user_id,plan_date" })
          .select("id").maybeSingle();
        if (error) return { ok: false, error: error.message };
        return { ok: true, plan_id: data?.id, added: retailer_ids.length };
      },
    }),
  };
}
