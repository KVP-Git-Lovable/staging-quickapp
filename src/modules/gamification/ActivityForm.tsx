import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, AlertTriangle, Star, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import {
  AWARD_MODES, CAP_SCOPES, CONDITION_FIELDS, EXPIRY_OPTIONS, GROWTH_COMPARE,
  GROWTH_METRICS, OPERATORS, ProgramCategory, TARGET_PERIODS, TRIGGERS,
} from "./constants";
import { EligibilityPicker } from "./EligibilityPicker";
import { useActivityTiers, useFocusedProductCount, useGamSettings, useTargetKpis } from "./hooks";

interface Condition { field: string; operator: string; value: any }
interface Tier { id?: string; threshold_pct: number; points: number }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  programId: string;
  category: ProgramCategory;
  activity?: any | null;
}

export function ActivityForm({ open, onOpenChange, programId, category, activity }: Props) {
  const qc = useQueryClient();
  const { data: settings } = useGamSettings();
  const { data: kpis = [] } = useTargetKpis();
  const { data: focusedCount = 0 } = useFocusedProductCount();
  const { data: existingTiers = [] } = useActivityTiers(activity?.id);

  const isTiered = category === "targets";
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);

  useEffect(() => {
    if (!open) return;
    const a = activity ?? {};
    const expiry = a.expiry_type === "days" ? `days:${a.expiry_days ?? 180}` : a.expiry_type ?? "fy_end";
    setForm({
      action_name: a.action_name ?? "",
      description: a.description ?? "",
      is_enabled: a.is_enabled ?? true,
      trigger_type: a.trigger_type ?? a.action_type ?? TRIGGERS[category]?.[0]?.value ?? "",
      points: a.points ?? 5,
      expiry,
      validity_from: a.validity_from ?? "",
      validity_to: a.validity_to ?? "",
      cap_scope: a.cap_scope ?? (category === "captures" ? "user_day" : "none"),
      cap_value: a.cap_value ?? (category === "captures" ? 3 : ""),
      redemption_min: a.redemption_min ?? "",
      award_mode: a.award_mode ?? settings?.default_award_mode ?? "auto",
      leaderboard: a.leaderboard ?? true,
      eligibility_mode: a.eligibility_mode ?? "all",
      eligibility_ids: a.eligibility_ids ?? [],
      kpi_id: a.kpi_id ?? "",
      target_period: a.target_period ?? "monthly",
      growth_metric: a.conditions_json?.growth_metric ?? "total_sales",
      growth_compare: a.conditions_json?.compare_against ?? "previous_month",
      min_growth_percentage: a.min_growth_percentage ?? 10,
    });
    setConditions(Array.isArray(a.conditions_json) ? a.conditions_json : []);
  }, [open, activity, category, settings?.default_award_mode]);

  useEffect(() => {
    setTiers(
      existingTiers.length
        ? existingTiers.map((t: any) => ({ id: t.id, threshold_pct: t.threshold_pct, points: Number(t.points) }))
        : [{ threshold_pct: 80, points: 5 }],
    );
  }, [existingTiers, open]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.action_name?.trim()) return toast.error("Give the activity a name");
    if (category === "captures" && (!form.cap_value || Number(form.cap_value) <= 0)) {
      return toast.error("Capture activities need a daily cap");
    }
    if (isTiered && kpis.length === 0) {
      return toast.error("No KPIs defined yet. Set up KPIs in the Targets module first.");
    }
    if (isTiered && !form.kpi_id) {
      return toast.error("Choose a KPI from the Targets module");
    }

    setSaving(true);
    const [expType, expDays] = String(form.expiry).split(":");
    const conditionsJson =
      category === "beats"
        ? { growth_metric: form.growth_metric, compare_against: form.growth_compare, min_growth_percentage: Number(form.min_growth_percentage) || 0 }
        : conditions;

    const payload: any = {
      game_id: programId,
      action_name: form.action_name.trim(),
      description: form.description || null,
      is_enabled: form.is_enabled,
      action_type: form.trigger_type,
      trigger_type: form.trigger_type,
      points: Number(form.points) || 0,
      conditions_json: conditionsJson,
      expiry_type: expType,
      expiry_days: expType === "days" ? Number(expDays) : null,
      validity_from: form.validity_from || null,
      validity_to: form.validity_to || null,
      cap_scope: form.cap_scope,
      cap_value: form.cap_value ? Number(form.cap_value) : null,
      redemption_min: form.redemption_min ? Number(form.redemption_min) : null,
      award_mode: form.award_mode,
      leaderboard: form.leaderboard,
      eligibility_mode: form.eligibility_mode,
      eligibility_ids: form.eligibility_ids,
      is_tiered: isTiered,
      tier_mode: "highest",
      kpi_id: isTiered ? form.kpi_id : null,
      target_period: isTiered ? form.target_period : null,
      min_growth_percentage: category === "beats" ? Number(form.min_growth_percentage) || 0 : null,
    };

    let actionId = activity?.id;
    if (actionId) {
      const { error } = await supabase.from("gamification_actions").update(payload).eq("id", actionId);
      if (error) { setSaving(false); return toast.error(error.message); }
    } else {
      const { data, error } = await supabase.from("gamification_actions").insert(payload).select("id").single();
      if (error) { setSaving(false); return toast.error(error.message); }
      actionId = data.id;
    }

    if (isTiered && actionId) {
      await supabase.from("activity_tiers").delete().eq("action_id", actionId);
      const rows = tiers
        .filter((t) => t.threshold_pct !== null && t.threshold_pct !== undefined)
        .map((t, i) => ({ action_id: actionId, threshold_pct: Number(t.threshold_pct), points: Number(t.points) || 0, sort: i }));
      if (rows.length) await supabase.from("activity_tiers").insert(rows);
    }

    setSaving(false);
    qc.invalidateQueries({ queryKey: ["gam-activities"] });
    qc.invalidateQueries({ queryKey: ["gam-tiers", actionId] });
    toast.success(activity ? "Activity updated" : "Activity created");
    onOpenChange(false);
  };

  const fields = CONDITION_FIELDS[form.trigger_type] ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-pixel text-sm text-orange-600">
            {activity ? "EDIT ACTIVITY" : "NEW ACTIVITY"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* 1. Activity details */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="font-pixel text-[8.5px] uppercase tracking-[0.05em] text-[#9aa1b5] leading-relaxed">1 · ACTIVITY DETAILS</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={form.action_name ?? ""} onChange={(e) => set("action_name", e.target.value)} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea rows={2} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label className="mb-0">Activity active</Label>
                <Switch checked={!!form.is_enabled} onCheckedChange={(v) => set("is_enabled", v)} />
              </div>
            </CardContent>
          </Card>

          {/* 2. Trigger & conditions */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="font-pixel text-[8.5px] uppercase tracking-[0.05em] text-[#9aa1b5] leading-relaxed">2 · TRIGGER & CONDITIONS</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Trigger type</Label>
                <Select value={form.trigger_type} onValueChange={(v) => { set("trigger_type", v); setConditions([]); }}>
                  <SelectTrigger><SelectValue placeholder="Choose a trigger" /></SelectTrigger>
                  <SelectContent>
                    {(TRIGGERS[category] ?? []).map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {category === "products" && (
                <div className="rounded-lg border bg-purple-50 border-purple-200 p-3 space-y-2">
                  <p className="text-sm text-purple-900 flex items-center gap-2">
                    <Star className="h-4 w-4" /> Focus products · auto-detected — awards when an order contains a product flagged Focused in Product Management.
                  </p>
                  <Link to="/gamification-admin/focus-products" className="text-sm underline text-purple-700">
                    Manage focus products
                  </Link>
                  {focusedCount === 0 && (
                    <p className="text-sm text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" /> No products are flagged focused — this activity will not award.
                    </p>
                  )}
                  {focusedCount > 0 && <p className="text-xs text-purple-700">{focusedCount} products flagged</p>}
                </div>
              )}

              {category === "beats" && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Growth metric</Label>
                    <Select value={form.growth_metric} onValueChange={(v) => set("growth_metric", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GROWTH_METRICS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Compare against</Label>
                    <Select value={form.growth_compare} onValueChange={(v) => set("growth_compare", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GROWTH_COMPARE.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Minimum growth %</Label>
                    <Input type="number" value={form.min_growth_percentage ?? ""} onChange={(e) => set("min_growth_percentage", e.target.value)} />
                  </div>
                </div>
              )}

              {category === "captures" && (
                <div className="rounded-lg border bg-pink-50 border-pink-200 p-3 text-sm text-pink-900">
                  Awards on form submission. A daily cap is required below.
                </div>
              )}

              {isTiered && (
                <div className="space-y-3">
                  <div className="rounded-lg border bg-indigo-50 border-indigo-200 p-3 text-sm text-indigo-900">
                    Reads the Targets module — each rep is scored on their own achievement %. No target is entered here.
                  </div>
                  {kpis.length === 0 ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>
                        No KPIs defined yet. Set up KPIs in the Targets module before this activity can award points.{" "}
                        <Link to="/admin/performance-module" className="underline font-medium">Open Targets module</Link>
                      </span>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>KPI</Label>
                        <Select value={form.kpi_id} onValueChange={(v) => set("kpi_id", v)}>
                          <SelectTrigger><SelectValue placeholder="Choose a KPI" /></SelectTrigger>
                          <SelectContent>
                            {kpis.map((k: any) => (
                              <SelectItem key={k.id} value={k.id}>{k.kpi_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Target period</Label>
                        <Select value={form.target_period} onValueChange={(v) => set("target_period", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TARGET_PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}


                  <div className="space-y-2">
                    <Label>Tiers (achievement % ≥ → points)</Label>
                    {tiers.map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          type="number" className="w-28" value={t.threshold_pct}
                          onChange={(e) => setTiers(tiers.map((x, xi) => xi === i ? { ...x, threshold_pct: Number(e.target.value) } : x))}
                        />
                        <span className="text-sm text-muted-foreground">% →</span>
                        <Input
                          type="number" className="w-28" value={t.points}
                          onChange={(e) => setTiers(tiers.map((x, xi) => xi === i ? { ...x, points: Number(e.target.value) } : x))}
                        />
                        <span className="text-sm text-muted-foreground">points</span>
                        <Button type="button" variant="ghost" size="icon" onClick={() => setTiers(tiers.filter((_, xi) => xi !== i))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => setTiers([...tiers, { threshold_pct: 100, points: 10 }])}>
                      <Plus className="h-4 w-4 mr-1" /> Add tier
                    </Button>
                    <p className="text-xs text-muted-foreground">When multiple tiers are reached: <strong>Highest only</strong></p>
                  </div>
                </div>
              )}

              {!isTiered && category !== "products" && category !== "beats" && category !== "captures" && (
                <div className="space-y-2">
                  <Label>Conditions</Label>
                  {conditions.map((c, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <Select value={c.field} onValueChange={(v) => setConditions(conditions.map((x, xi) => xi === i ? { ...x, field: v } : x))}>
                        <SelectTrigger className="w-48"><SelectValue placeholder="Field" /></SelectTrigger>
                        <SelectContent>
                          {fields.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={c.operator} onValueChange={(v) => setConditions(conditions.map((x, xi) => xi === i ? { ...x, operator: v } : x))}>
                        <SelectTrigger className="w-40"><SelectValue placeholder="Operator" /></SelectTrigger>
                        <SelectContent>
                          {OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {!["is_true", "is_false"].includes(c.operator) && (
                        <Input
                          className="w-36" value={c.value ?? ""}
                          onChange={(e) => setConditions(conditions.map((x, xi) => xi === i ? { ...x, value: e.target.value } : x))}
                        />
                      )}
                      <Button type="button" variant="ghost" size="icon" onClick={() => setConditions(conditions.filter((_, xi) => xi !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button" variant="outline" size="sm" disabled={!fields.length}
                    onClick={() => setConditions([...conditions, { field: fields[0]?.value, operator: ">=", value: "" }])}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add condition
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 3. Reward */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="font-pixel text-[8.5px] uppercase tracking-[0.05em] text-[#9aa1b5] leading-relaxed">3 · REWARD</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {!isTiered && (
                <div>
                  <Label>Reward points per activity</Label>
                  <Input type="number" value={form.points ?? 0} onChange={(e) => set("points", e.target.value)} />
                </div>
              )}
              {isTiered && <p className="text-sm text-muted-foreground">Points come from the tier table above.</p>}
              <p className="text-xs text-muted-foreground">
                1 point = ₹{settings?.point_conversion ?? 1} · set in Global settings
              </p>
            </CardContent>
          </Card>

          {/* 4. Policy */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="font-pixel text-[8.5px] uppercase tracking-[0.05em] text-[#9aa1b5] leading-relaxed">4 · POLICY · THIS ACTIVITY</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Expiry</Label>
                  <Select value={form.expiry} onValueChange={(v) => set("expiry", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXPIRY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Award mode</Label>
                  <Select value={form.award_mode} onValueChange={(v) => set("award_mode", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AWARD_MODES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valid from</Label>
                  <Input type="date" value={form.validity_from ?? ""} onChange={(e) => set("validity_from", e.target.value)} />
                </div>
                <div>
                  <Label>Valid to</Label>
                  <Input type="date" value={form.validity_to ?? ""} onChange={(e) => set("validity_to", e.target.value)} />
                </div>
                <div>
                  <Label>Cap scope</Label>
                  <Select value={form.cap_scope} onValueChange={(v) => set("cap_scope", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CAP_SCOPES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cap value</Label>
                  <Input
                    type="number" disabled={form.cap_scope === "none"}
                    value={form.cap_value ?? ""} onChange={(e) => set("cap_value", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Redemption minimum</Label>
                  <Input type="number" value={form.redemption_min ?? ""} onChange={(e) => set("redemption_min", e.target.value)} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label className="mb-0">Counts on leaderboard</Label>
                  <Switch checked={!!form.leaderboard} onCheckedChange={(v) => set("leaderboard", v)} />
                </div>
              </div>

              <EligibilityPicker
                mode={form.eligibility_mode ?? "all"}
                ids={form.eligibility_ids ?? []}
                onChange={(mode, ids) => setForm((f: any) => ({ ...f, eligibility_mode: mode, eligibility_ids: ids }))}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2 pb-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || (isTiered && kpis.length === 0)}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save activity
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
