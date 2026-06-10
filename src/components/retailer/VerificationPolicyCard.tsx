import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Gauge,
  Copy,
  Workflow,
  Trophy,
  Save,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { useRetailerVerificationPolicy, type RetailerVerificationPolicy } from "@/hooks/useRetailerVerificationPolicy";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Draft = RetailerVerificationPolicy;

const SectionHeader = ({
  icon: Icon,
  title,
  description,
  accent = "primary",
}: {
  icon: any;
  title: string;
  description?: string;
  accent?: "primary" | "emerald" | "amber" | "rose" | "violet";
}) => {
  const ring: Record<string, string> = {
    primary: "bg-primary/10 text-primary ring-primary/20",
    emerald: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-400",
    violet: "bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-400",
  };
  return (
    <div className="flex items-start gap-3">
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center ring-1", ring[accent])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-semibold leading-tight">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
};

const ToggleRow = ({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2.5 hover:bg-accent/40 transition-colors">
    <div className="min-w-0">
      <p className="text-sm font-medium leading-none">{label}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

const NumberField = ({
  label,
  value,
  onChange,
  min = 0,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) => (
  <div className="space-y-1.5">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <div className="relative">
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="pr-12 h-9"
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>
      )}
    </div>
  </div>
);

export function VerificationPolicyCard() {
  const { policy, loading, save } = useRetailerVerificationPolicy();
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(policy);
  const [tab, setTab] = useState("basics");

  useEffect(() => {
    if (!loading) setDraft(policy);
  }, [loading, policy]);

  const upd = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const scoreTotal = useMemo(
    () =>
      draft.pts_mobile +
      draft.pts_whatsapp +
      draft.pts_gps +
      draft.pts_shop_photo +
      draft.pts_address +
      draft.pts_gst +
      draft.pts_owner +
      draft.pts_first_visit +
      draft.pts_first_order,
    [draft]
  );

  const gpTotal = useMemo(
    () =>
      draft.gp_created +
      draft.gp_mobile +
      draft.gp_whatsapp +
      draft.gp_gps +
      draft.gp_photo +
      draft.gp_first_visit +
      draft.gp_first_order,
    [draft]
  );

  const dirty = JSON.stringify(draft) !== JSON.stringify(policy);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { id, ...patch } = draft;
      await save(patch);
      toast({ title: "Policy saved", description: "All retailer governance rules updated." });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setDraft(policy);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-3 bg-gradient-to-r from-primary/5 via-violet-500/5 to-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              Retailer Governance & Verification
              <Badge
                variant={policy.enabled ? "default" : "outline"}
                className={policy.enabled ? "bg-emerald-500 hover:bg-emerald-500 text-white" : ""}
              >
                {policy.enabled ? "Active" : "Disabled"}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Verification rules, scoring, duplicate prevention, approvals & gamification
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
          {/* Master switch */}
          <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className={cn("h-5 w-5", draft.enabled ? "text-emerald-500" : "text-muted-foreground")} />
              <div>
                <p className="text-sm font-semibold">Enable governance policy</p>
                <p className="text-xs text-muted-foreground">
                  Turns on verification, scoring, duplicate prevention & order restrictions.
                </p>
              </div>
            </div>
            <Switch checked={draft.enabled} onCheckedChange={(v) => upd("enabled", v)} />
          </div>

          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="w-full grid grid-cols-3 md:grid-cols-6 h-auto p-1 gap-1">
              <TabsTrigger value="basics" className="text-xs gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Basics
              </TabsTrigger>
              <TabsTrigger value="requirements" className="text-xs gap-1.5">
                <ListChecks className="h-3.5 w-3.5" /> Requirements
              </TabsTrigger>
              <TabsTrigger value="score" className="text-xs gap-1.5">
                <Gauge className="h-3.5 w-3.5" /> Score Engine
              </TabsTrigger>
              <TabsTrigger value="duplicate" className="text-xs gap-1.5">
                <Copy className="h-3.5 w-3.5" /> Duplicates
              </TabsTrigger>
              <TabsTrigger value="approval" className="text-xs gap-1.5">
                <Workflow className="h-3.5 w-3.5" /> Approval
              </TabsTrigger>
              <TabsTrigger value="rewards" className="text-xs gap-1.5">
                <Trophy className="h-3.5 w-3.5" /> Rewards
              </TabsTrigger>
            </TabsList>

            {/* BASICS */}
            <TabsContent value="basics" className="space-y-4 mt-4">
              <SectionHeader
                icon={ShieldCheck}
                title="Order restrictions"
                description="Limit ordering for unverified retailers"
                accent="primary"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <NumberField
                  label="Max unverified orders"
                  value={draft.max_orders_unverified}
                  onChange={(n) => upd("max_orders_unverified", Math.max(0, n))}
                  suffix="orders"
                />
                <NumberField
                  label="Grace days after add"
                  value={draft.grace_days}
                  onChange={(n) => upd("grace_days", Math.max(0, Math.min(90, n)))}
                  max={90}
                  suffix="days"
                />
              </div>
              <ToggleRow
                label="Hard-block after limit"
                hint="If off, system shows a warning but still allows the order."
                checked={draft.block_after_limit}
                onChange={(v) => upd("block_after_limit", v)}
              />
              <ToggleRow
                label="Require verification for credit orders"
                hint="Credit orders blocked until retailer reaches verified status."
                checked={draft.require_verification_for_credit}
                onChange={(v) => upd("require_verification_for_credit", v)}
              />
              <ToggleRow
                label="Auto-send WhatsApp on retailer create"
                hint="Sends a verification link with shop details for confirmation."
                checked={draft.auto_whatsapp_on_create}
                onChange={(v) => upd("auto_whatsapp_on_create", v)}
              />
            </TabsContent>

            {/* REQUIREMENTS */}
            <TabsContent value="requirements" className="space-y-3 mt-4">
              <SectionHeader
                icon={ListChecks}
                title="Mandatory verification items"
                description="Each toggle decides what is required for full verification"
                accent="violet"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <ToggleRow label="Mobile (OTP) verification" checked={draft.req_mobile} onChange={(v) => upd("req_mobile", v)} />
                <ToggleRow label="WhatsApp confirmation" checked={draft.req_whatsapp} onChange={(v) => upd("req_whatsapp", v)} />
                <ToggleRow label="GPS coordinates" checked={draft.req_gps} onChange={(v) => upd("req_gps", v)} />
                <ToggleRow label="Shop photo upload" checked={draft.req_shop_photo} onChange={(v) => upd("req_shop_photo", v)} />
                <ToggleRow label="Owner name" checked={draft.req_owner_name} onChange={(v) => upd("req_owner_name", v)} />
                <ToggleRow label="GST verification" checked={draft.req_gst} onChange={(v) => upd("req_gst", v)} />
                <ToggleRow
                  label="First productive visit"
                  hint="Retailer can't be fully verified without it"
                  checked={draft.req_first_visit}
                  onChange={(v) => upd("req_first_visit", v)}
                />
              </div>
            </TabsContent>

            {/* SCORE ENGINE */}
            <TabsContent value="score" className="space-y-4 mt-4">
              <div className="flex items-center justify-between gap-3">
                <SectionHeader
                  icon={Gauge}
                  title="Verification score engine"
                  description="Points awarded for each completed item (0–100)"
                  accent="emerald"
                />
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 text-xs",
                    scoreTotal === 100
                      ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                      : "border-amber-500/40 text-amber-600 dark:text-amber-400"
                  )}
                >
                  Total: {scoreTotal} {scoreTotal !== 100 && <AlertTriangle className="h-3 w-3 ml-1" />}
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <NumberField label="Mobile" value={draft.pts_mobile} onChange={(n) => upd("pts_mobile", n)} suffix="pts" />
                <NumberField label="WhatsApp" value={draft.pts_whatsapp} onChange={(n) => upd("pts_whatsapp", n)} suffix="pts" />
                <NumberField label="GPS" value={draft.pts_gps} onChange={(n) => upd("pts_gps", n)} suffix="pts" />
                <NumberField label="Shop photo" value={draft.pts_shop_photo} onChange={(n) => upd("pts_shop_photo", n)} suffix="pts" />
                <NumberField label="Address" value={draft.pts_address} onChange={(n) => upd("pts_address", n)} suffix="pts" />
                <NumberField label="GST" value={draft.pts_gst} onChange={(n) => upd("pts_gst", n)} suffix="pts" />
                <NumberField label="Owner details" value={draft.pts_owner} onChange={(n) => upd("pts_owner", n)} suffix="pts" />
                <NumberField label="First visit" value={draft.pts_first_visit} onChange={(n) => upd("pts_first_visit", n)} suffix="pts" />
                <NumberField label="First order" value={draft.pts_first_order} onChange={(n) => upd("pts_first_order", n)} suffix="pts" />
              </div>

              <Separator />

              <SectionHeader
                icon={Gauge}
                title="Status thresholds"
                description="Score brackets that label each retailer"
                accent="primary"
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <NumberField
                  label="Partially verified ≥"
                  value={draft.threshold_partial}
                  onChange={(n) => upd("threshold_partial", n)}
                  suffix="score"
                />
                <NumberField
                  label="Verified ≥"
                  value={draft.threshold_verified}
                  onChange={(n) => upd("threshold_verified", n)}
                  suffix="score"
                />
                <NumberField
                  label="Gold verified ≥"
                  value={draft.threshold_gold}
                  onChange={(n) => upd("threshold_gold", n)}
                  suffix="score"
                />
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="border-slate-400/40">0–{draft.threshold_partial - 1} Unverified</Badge>
                <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                  {draft.threshold_partial}–{draft.threshold_verified - 1} Partial
                </Badge>
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                  {draft.threshold_verified}–{draft.threshold_gold - 1} Verified
                </Badge>
                <Badge variant="outline" className="border-yellow-500/40 text-yellow-600 dark:text-yellow-400">
                  {draft.threshold_gold}+ Gold
                </Badge>
              </div>
            </TabsContent>

            {/* DUPLICATES */}
            <TabsContent value="duplicate" className="space-y-4 mt-4">
              <SectionHeader
                icon={Copy}
                title="Duplicate detection"
                description="Stop creation of repeat retailers"
                accent="rose"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <ToggleRow label="Same mobile number" checked={draft.dup_check_mobile} onChange={(v) => upd("dup_check_mobile", v)} />
                <ToggleRow label="Same GST number" checked={draft.dup_check_gst} onChange={(v) => upd("dup_check_gst", v)} />
                <ToggleRow label="Similar shop name" checked={draft.dup_check_name} onChange={(v) => upd("dup_check_name", v)} />
                <ToggleRow label="Same address" checked={draft.dup_check_address} onChange={(v) => upd("dup_check_address", v)} />
                <ToggleRow label="Same GPS coordinates" checked={draft.dup_check_gps} onChange={(v) => upd("dup_check_gps", v)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Action when duplicate detected</Label>
                  <Select value={draft.dup_action} onValueChange={(v) => upd("dup_action", v as any)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="warn">Warn only</SelectItem>
                      <SelectItem value="require_approval">Require approval</SelectItem>
                      <SelectItem value="block">Block creation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <NumberField
                  label="Risk threshold (Suspect ≥)"
                  value={draft.dup_risk_threshold}
                  onChange={(n) => upd("dup_risk_threshold", Math.max(0, Math.min(100, n)))}
                  max={100}
                  suffix="/ 100"
                />
              </div>
            </TabsContent>

            {/* APPROVAL */}
            <TabsContent value="approval" className="space-y-4 mt-4">
              <SectionHeader
                icon={Workflow}
                title="Approval workflow"
                description="Who approves new retailers and when"
                accent="amber"
              />
              <ToggleRow
                label="Retailer approval required"
                hint="New retailers stay 'Awaiting Approval' until reviewed"
                checked={draft.approval_required}
                onChange={(v) => upd("approval_required", v)}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Approval level</Label>
                  <Select value={draft.approval_level} onValueChange={(v) => upd("approval_level", v as any)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="coordinator">Coordinator</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="asm">ASM</SelectItem>
                      <SelectItem value="multi">Multi-level</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <NumberField
                  label="Expire pending after"
                  value={draft.expire_pending_days}
                  onChange={(n) => upd("expire_pending_days", n)}
                  suffix="days"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <NumberField
                  label="Auto-approve when score ≥"
                  value={draft.auto_approve_score}
                  onChange={(n) => upd("auto_approve_score", n)}
                  suffix="score"
                />
                <NumberField
                  label="Auto-reject when dup risk ≥"
                  value={draft.auto_reject_dup_risk}
                  onChange={(n) => upd("auto_reject_dup_risk", n)}
                  suffix="risk"
                />
              </div>
            </TabsContent>

            {/* REWARDS */}
            <TabsContent value="rewards" className="space-y-4 mt-4">
              <div className="flex items-center justify-between gap-3">
                <SectionHeader
                  icon={Trophy}
                  title="Sales gamification rewards"
                  description="Points awarded to reps for quality retailer onboarding"
                  accent="amber"
                />
                <Badge variant="outline" className="shrink-0 text-xs border-amber-500/40 text-amber-600 dark:text-amber-400">
                  Max: {gpTotal} pts
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <NumberField label="Retailer created" value={draft.gp_created} onChange={(n) => upd("gp_created", n)} suffix="pts" />
                <NumberField label="Mobile verified" value={draft.gp_mobile} onChange={(n) => upd("gp_mobile", n)} suffix="pts" />
                <NumberField label="WhatsApp verified" value={draft.gp_whatsapp} onChange={(n) => upd("gp_whatsapp", n)} suffix="pts" />
                <NumberField label="GPS verified" value={draft.gp_gps} onChange={(n) => upd("gp_gps", n)} suffix="pts" />
                <NumberField label="Shop photo" value={draft.gp_photo} onChange={(n) => upd("gp_photo", n)} suffix="pts" />
                <NumberField label="First visit" value={draft.gp_first_visit} onChange={(n) => upd("gp_first_visit", n)} suffix="pts" />
                <NumberField label="First order" value={draft.gp_first_order} onChange={(n) => upd("gp_first_order", n)} suffix="pts" />
              </div>
              <ToggleRow
                label="Revoke points on fraud"
                hint="Automatically take back points if retailer is marked duplicate, rejected, or deleted."
                checked={draft.gp_revoke_on_fraud}
                onChange={(v) => upd("gp_revoke_on_fraud", v)}
              />
            </TabsContent>
          </Tabs>

          {/* Sticky action bar */}
          <div className="sticky bottom-0 -mx-6 px-6 py-3 bg-background/95 backdrop-blur border-t flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {dirty ? (
                <span className="text-amber-600 dark:text-amber-400 font-medium">Unsaved changes</span>
              ) : (
                "All changes saved"
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleReset} disabled={!dirty || saving}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reset
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!dirty || saving || loading}>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saving ? "Saving…" : "Save Policy"}
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default VerificationPolicyCard;
