import { useState } from "react";
import { Database, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toLocalISODate } from "@/utils/dateUtils";

/**
 * Demo-data seeder for QuickApp Sahaya. Purely additive tooling: creates a
 * demo beat, four demo retailers on it, a 5-day beat plan with planned
 * visits, and one dummy order per retailer with 3-4 lines taken from the
 * EXISTING active products master (never invented products). Re-running is
 * idempotent for the beat/retailers/plans/visits and skips retailers that
 * already ordered today. No existing feature or data is modified.
 */

const BEAT_NAME = "Sahaya Demo Beat";
const RETAILER_COUNT = 4;
const DAYS = 5;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface SeedSummary {
  beat: string;
  retailers: number;
  plans: number;
  visits: number;
  orders: number;
  items: number;
}

export function SeedDummyDataCard() {
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<SeedSummary | null>(null);

  const seed = async () => {
    if (!user?.id) {
      toast.error("Please sign in again.");
      return;
    }
    setRunning(true);
    setSummary(null);
    try {
      // 0. Existing ACTIVE products only — the orders must come from these.
      const { data: products, error: prodErr } = await supabase
        .from("products")
        .select("id, name, rate, base_unit")
        .or("is_active.eq.true,is_active.is.null")
        .order("name")
        .limit(24);
      if (prodErr) throw prodErr;
      if (!products || products.length < 3) {
        toast.error("Need at least 3 active products in the master to seed orders.");
        return;
      }

      // 1. Demo beat (reused when it already exists).
      let { data: beat } = await supabase
        .from("beats")
        .select("id, beat_id, beat_name")
        .eq("user_id", user.id)
        .eq("beat_name", BEAT_NAME)
        .maybeSingle();
      if (!beat) {
        const legacyKey = `beat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        const { data: created, error } = await supabase
          .from("beats")
          .insert({ beat_name: BEAT_NAME, user_id: user.id, beat_id: legacyKey, is_active: true } as any)
          .select("id, beat_id, beat_name")
          .single();
        if (error) throw error;
        beat = created;
      }
      // The legacy text key is what orders.beat_id carries and what the
      // orders RLS policy checks via user_has_beat_access(uid, beat_id) —
      // an order without it violates row-level security. Backfill it if a
      // previous run somehow left it empty.
      let beatLegacyId = String((beat as any).beat_id ?? "");
      if (!beatLegacyId) {
        beatLegacyId = `beat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        const { error } = await supabase
          .from("beats")
          .update({ beat_id: beatLegacyId } as any)
          .eq("id", (beat as any).id);
        if (error) throw error;
      }

      // 2. Demo retailers on the beat (reused when they already exist).
      const retailers: Array<{ id: string; name: string }> = [];
      for (let i = 1; i <= RETAILER_COUNT; i++) {
        const name = `Sahaya Demo Store ${i}`;
        const { data: existing } = await supabase
          .from("retailers")
          .select("id, name")
          .eq("user_id", user.id)
          .eq("name", name)
          .maybeSingle();
        if (existing) {
          retailers.push({ id: String((existing as any).id), name });
          continue;
        }
        const { data: created, error } = await supabase
          .from("retailers")
          .insert({
            user_id: user.id,
            name,
            address: "Demo address (seeded by Sahaya)",
            beat_id: beatLegacyId,
            beat_name: BEAT_NAME,
          } as any)
          .select("id, name")
          .single();
        if (error) throw error;
        retailers.push({ id: String((created as any).id), name });
      }

      // 3. Five days starting today, with a beat plan per day.
      const days: string[] = [];
      const base = new Date();
      base.setHours(0, 0, 0, 0);
      for (let i = 0; i < DAYS; i++) {
        const d = new Date(base);
        d.setDate(base.getDate() + i);
        days.push(toLocalISODate(d));
      }

      let plans = 0;
      for (const date of days) {
        const { error } = await supabase
          .from("beat_plans")
          .upsert(
            [{
              user_id: user.id,
              beat_id: String((beat as any).id),
              beat_name: BEAT_NAME,
              plan_date: date,
              beat_data: {
                beat_name: BEAT_NAME,
                demo: true,
                auto_generated: false,
                day_of_week: DAY_NAMES[new Date(`${date}T00:00:00`).getDay()],
                retailers: retailers.map((r) => ({ id: r.id, name: r.name })),
              },
            }] as any,
            { onConflict: "user_id,plan_date,beat_id", ignoreDuplicates: false },
          );
        if (error) throw error;
        plans += 1;
      }

      // 4. Planned visits: every demo retailer on every seeded day.
      let visitsCreated = 0;
      const todayVisitByRetailer = new Map<string, string>();
      for (const date of days) {
        for (const r of retailers) {
          const { data: existing } = await supabase
            .from("visits")
            .select("id")
            .eq("user_id", user.id)
            .eq("retailer_id", r.id)
            .eq("planned_date", date)
            .maybeSingle();
          let visitId = existing ? String((existing as any).id) : null;
          if (!visitId) {
            const { data: created, error } = await supabase
              .from("visits")
              .insert({ user_id: user.id, retailer_id: r.id, planned_date: date, status: "planned" } as any)
              .select("id")
              .single();
            if (error) throw error;
            visitId = String((created as any).id);
            visitsCreated += 1;
          }
          if (date === days[0] && visitId) todayVisitByRetailer.set(r.id, visitId);
        }
      }

      // 5. One dummy order per retailer, 3-4 lines from the active products
      //    master. Skips retailers that already have an order today.
      let ordersCreated = 0;
      let itemsCreated = 0;
      for (let idx = 0; idx < retailers.length; idx++) {
        const r = retailers[idx];
        const { data: existingOrder } = await supabase
          .from("orders")
          .select("id")
          .eq("user_id", user.id)
          .eq("retailer_id", r.id)
          .eq("order_date", days[0])
          .limit(1)
          .maybeSingle();
        if (existingOrder) continue;

        const lineCount = 3 + (idx % 2); // 3 or 4 products per retailer
        const picked = Array.from({ length: lineCount }, (_, j) => products[(idx * 3 + j) % products.length]);
        const lines = picked.map((p: any, j: number) => {
          const qty = 2 + ((idx + j) % 4); // 2..5
          const rate = Number(p.rate) || 100;
          return {
            product_id: String(p.id),
            product_name: String(p.name),
            category: "General",
            unit: String(p.base_unit || "PIECE"),
            quantity: qty,
            rate,
            total: +(rate * qty).toFixed(2),
          };
        });
        const subtotal = +lines.reduce((s, l) => s + l.total, 0).toFixed(2);

        // Write through the app's standard order sync RPC (security definer):
        // it inserts the order AND its items, validates totals, recomputes
        // retailer pending, and marks the visit productive — direct inserts
        // would be blocked by the orders/order_items RLS policies.
        const payload = {
          order: {
            id: crypto.randomUUID(),
            idempotency_key: `sahaya_seed_${r.id}_${Date.now()}`,
            retailer_id: r.id,
            retailer_name: r.name,
            visit_id: todayVisitByRetailer.get(r.id) ?? null,
            order_date: days[0],
            status: "confirmed",
            subtotal,
            total_amount: subtotal,
            beat_id: beatLegacyId,
          },
          items: lines,
        };
        const { data: syncResult, error: syncErr } = await supabase.rpc(
          "sync_order_with_items_v2" as any,
          { p_payload: payload as any },
        );
        if (syncErr) throw syncErr;
        const status = (syncResult as any)?.status;
        if (status !== "ok" && status !== "duplicate") {
          const errs = (syncResult as any)?.errors;
          throw new Error(
            `Order for ${r.name} failed: ${Array.isArray(errs) ? errs.join("; ") : String(status)}`,
          );
        }
        if (status === "ok") {
          ordersCreated += 1;
          itemsCreated += lines.length;
        }
      }

      const result: SeedSummary = {
        beat: BEAT_NAME,
        retailers: retailers.length,
        plans,
        visits: visitsCreated,
        orders: ordersCreated,
        items: itemsCreated,
      };
      setSummary(result);
      toast.success(
        `Seeded: ${result.retailers} retailers on "${BEAT_NAME}", ${result.plans} day plans, ` +
        `${result.visits} new visits, ${result.orders} orders (${result.items} lines).`,
      );
    } catch (e: any) {
      console.error("[SeedDummyData] failed:", e);
      toast.error(e?.message ?? "Seeding failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-primary" />
          Demo Data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Seed a ready-to-demo setup: the "{BEAT_NAME}" with {RETAILER_COUNT} demo retailers,
          planned visits for the next {DAYS} days, and a dummy order per retailer with 3–4 lines
          from your existing active products.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="w-full gap-2" disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              {running ? "Seeding…" : "Seed dummy data"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Seed demo data?</AlertDialogTitle>
              <AlertDialogDescription>
                This creates (or reuses) "{BEAT_NAME}" with {RETAILER_COUNT} demo retailers, plans
                the beat for the next {DAYS} days with planned visits, and places one dummy order
                per retailer using products from your existing active product list. Nothing
                existing is changed or deleted; re-running skips what is already there.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={seed} disabled={running}>Seed data</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {summary && (
          <p className="text-xs text-muted-foreground">
            Done — {summary.retailers} retailers · {summary.plans} day plans · {summary.visits} new
            visits · {summary.orders} orders with {summary.items} lines. Check My Beats, My Visits
            and the order lists to see it.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
