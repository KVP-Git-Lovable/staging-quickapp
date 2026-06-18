import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, AlertCircle } from "lucide-react";

type PaymentTerm =
  | "immediate" | "net_7" | "net_15" | "net_30" | "net_45"
  | "advance" | "partial" | "credit_based";
type PaymentMode = "credit" | "bank_transfer" | "upi" | "cash" | "cheque" | "neft_rtgs";

interface ConfigRow {
  id?: string;
  distributor_id: string;
  credit_allowed: boolean;
  credit_limit: number;
  credit_warning_threshold_pct: number;
  allow_orders_beyond_limit: boolean;
  approval_required_beyond_limit: boolean;
  default_payment_term: PaymentTerm;
  default_payment_mode: PaymentMode;
  allowed_payment_modes: PaymentMode[];
  require_advance_payment: boolean;
  advance_payment_pct: number;
  require_payment_proof: boolean;
  max_outstanding_allowed: number | null;
  overdue_blocking_enabled: boolean;
  max_overdue_days: number | null;
  approval_required_high_risk: boolean;
}


interface Snapshot {
  credit_limit: number;
  outstanding: number;
  available_credit: number;
  credit_utilization_pct: number;
  last_payment_date: string | null;
  overdue_amount: number;
}

const DEFAULTS = (distributorId: string): ConfigRow => ({
  distributor_id: distributorId,
  credit_allowed: false,
  credit_limit: 0,
  credit_warning_threshold_pct: 80,
  allow_orders_beyond_limit: false,
  approval_required_beyond_limit: true,
  default_payment_term: "immediate",
  default_payment_mode: "bank_transfer",
  allowed_payment_modes: ["bank_transfer"],
  require_advance_payment: false,
  advance_payment_pct: 0,
  require_payment_proof: false,
  max_outstanding_allowed: null,
  overdue_blocking_enabled: false,
  max_overdue_days: null,
  approval_required_high_risk: false,
});

const TERM_LABELS: Record<PaymentTerm, string> = {
  immediate: "Immediate Payment",
  net_7: "Net 7",
  net_15: "Net 15",
  net_30: "Net 30",
  net_45: "Net 45",
  advance: "Advance Payment",
  partial: "Partial Payment",
  credit_based: "Credit Based",
};

const MODE_LABELS: Record<PaymentMode, string> = {
  credit: "Credit",
  bank_transfer: "Bank Transfer",
  upi: "UPI",
  cash: "Cash",
  cheque: "Cheque",
  neft_rtgs: "NEFT / RTGS",
};

const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export function PaymentCreditTab({ distributorId }: { distributorId: string }) {
  const [config, setConfig] = useState<ConfigRow>(DEFAULTS(distributorId));
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    const [{ data: cfg, error: cfgErr }, { data: snap }] = await Promise.all([
      (supabase as any)
        .from("distributor_payment_config")
        .select("*")
        .eq("distributor_id", distributorId)
        .maybeSingle(),
      (supabase as any).rpc("get_distributor_financial_snapshot", { p_distributor_id: distributorId }),
    ]);
    if (cfgErr) toast.error("Failed to load config");
    if (cfg) setConfig({ ...DEFAULTS(distributorId), ...cfg });
    if (Array.isArray(snap) && snap[0]) setSnapshot(snap[0]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distributorId]);

  const update = <K extends keyof ConfigRow>(key: K, value: ConfigRow[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = { ...config, updated_by: user?.id ?? null };
    const { error } = await (supabase as any)
      .from("distributor_payment_config")
      .upsert(payload, { onConflict: "distributor_id" });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Failed to save");
      return;
    }
    toast.success("Payment & Credit settings saved");
    loadAll();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const showAdvancePct = config.require_advance_payment ||
    config.default_payment_term === "advance" ||
    config.default_payment_term === "partial";

  return (
    <div className="space-y-4">
      {/* Section 1 — Credit Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Credit Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="credit_allowed">Credit Allowed</Label>
            <Switch
              id="credit_allowed"
              checked={config.credit_allowed}
              onCheckedChange={(v) => update("credit_allowed", v)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Credit Limit (₹)</Label>
              <Input
                type="number"
                min={0}
                value={config.credit_limit}
                onChange={(e) => update("credit_limit", Number(e.target.value) || 0)}
                disabled={!config.credit_allowed}
              />
            </div>
            <div>
              <Label>Warning Threshold (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={config.credit_warning_threshold_pct}
                onChange={(e) => update("credit_warning_threshold_pct", Number(e.target.value) || 0)}
                disabled={!config.credit_allowed}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="allow_beyond">Allow Orders Beyond Credit Limit</Label>
            <Switch
              id="allow_beyond"
              checked={config.allow_orders_beyond_limit}
              onCheckedChange={(v) => update("allow_orders_beyond_limit", v)}
              disabled={!config.credit_allowed}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="approval_beyond">Approval Required Beyond Credit Limit</Label>
            <Switch
              id="approval_beyond"
              checked={config.approval_required_beyond_limit}
              onCheckedChange={(v) => update("approval_required_beyond_limit", v)}
              disabled={!config.credit_allowed}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 2 — Payment Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Payment Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Default Payment Term</Label>
              <Select
                value={config.default_payment_term}
                onValueChange={(v) => update("default_payment_term", v as PaymentTerm)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TERM_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Default Payment Mode</Label>
              <Select
                value={config.default_payment_mode}
                onValueChange={(v) => {
                  const mode = v as PaymentMode;
                  setConfig((prev) => ({
                    ...prev,
                    default_payment_mode: mode,
                    allowed_payment_modes: prev.allowed_payment_modes.includes(mode)
                      ? prev.allowed_payment_modes
                      : [...prev.allowed_payment_modes, mode],
                  }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MODE_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Allowed Payment Modes</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Tick every mode this distributor may use. The default above is auto-included.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.entries(MODE_LABELS) as [PaymentMode, string][]).map(([k, l]) => {
                const checked = config.allowed_payment_modes.includes(k);
                const isDefault = config.default_payment_mode === k;
                return (
                  <label
                    key={k}
                    className={`flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer ${
                      checked ? "bg-accent border-primary" : ""
                    } ${isDefault ? "opacity-90" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={checked}
                      disabled={isDefault}
                      onChange={(e) => {
                        setConfig((prev) => {
                          const next = e.target.checked
                            ? Array.from(new Set([...prev.allowed_payment_modes, k]))
                            : prev.allowed_payment_modes.filter((m) => m !== k);
                          return {
                            ...prev,
                            allowed_payment_modes: next.length ? next : [prev.default_payment_mode],
                          };
                        });
                      }}
                    />
                    <span>{l}</span>
                    {isDefault && (
                      <span className="ml-auto text-[10px] uppercase text-muted-foreground">Default</span>
                    )}
                  </label>
                );
              })}
            </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="req_adv">Require Advance Payment</Label>
            <Switch
              id="req_adv"
              checked={config.require_advance_payment}
              onCheckedChange={(v) => update("require_advance_payment", v)}
            />
          </div>
          {showAdvancePct && (
            <div>
              <Label>Advance Payment Percentage (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={config.advance_payment_pct}
                onChange={(e) => update("advance_payment_pct", Number(e.target.value) || 0)}
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label htmlFor="req_proof">Require Payment Proof</Label>
            <Switch
              id="req_proof"
              checked={config.require_payment_proof}
              onCheckedChange={(v) => update("require_payment_proof", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 3 — Financial Snapshot */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Financial Snapshot
            <span className="text-xs font-normal text-muted-foreground">(read-only)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!snapshot ? (
            <div className="text-sm text-muted-foreground">No data yet.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <Stat label="Current Outstanding" value={fmtMoney(snapshot.outstanding)} />
              <Stat label="Available Credit" value={fmtMoney(snapshot.available_credit)} />
              <Stat
                label="Credit Utilization"
                value={`${Number(snapshot.credit_utilization_pct || 0).toFixed(1)}%`}
                warn={snapshot.credit_utilization_pct >= config.credit_warning_threshold_pct}
              />
              <Stat
                label="Last Payment"
                value={snapshot.last_payment_date ? new Date(snapshot.last_payment_date).toLocaleDateString() : "—"}
              />
              <Stat
                label="Overdue Amount"
                value={fmtMoney(snapshot.overdue_amount)}
                warn={(snapshot.overdue_amount || 0) > 0}
              />
              <Stat label="Credit Limit" value={fmtMoney(snapshot.credit_limit)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 4 — Financial Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Financial Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Maximum Outstanding Allowed (₹)</Label>
              <Input
                type="number"
                min={0}
                value={config.max_outstanding_allowed ?? ""}
                onChange={(e) =>
                  update("max_outstanding_allowed", e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </div>
            <div>
              <Label>Maximum Overdue Days</Label>
              <Input
                type="number"
                min={0}
                value={config.max_overdue_days ?? ""}
                onChange={(e) =>
                  update("max_overdue_days", e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="overdue_block">Overdue Blocking Enabled</Label>
            <Switch
              id="overdue_block"
              checked={config.overdue_blocking_enabled}
              onCheckedChange={(v) => update("overdue_blocking_enabled", v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="hr_approval">Order Approval Required For High Risk Accounts</Label>
            <Switch
              id="hr_approval"
              checked={config.approval_required_high_risk}
              onCheckedChange={(v) => update("approval_required_high_risk", v)}
            />
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end sticky bottom-0 bg-background py-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {warn && <AlertCircle className="h-3 w-3 text-destructive" />}
        {label}
      </div>
      <div className={`text-sm font-semibold mt-1 ${warn ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}
