import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, MapPin, Phone, AlertTriangle, ExternalLink, MessageCircle,
  ShieldCheck, ShieldAlert, Camera, FileText, User, Clock, XCircle,
  HelpCircle, Copy as CopyIcon, Sparkles, MapPinned,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface RetailerLike {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  owner_name?: string | null;
  contact_person?: string | null;
  beat_name?: string | null;
  territory_name?: string | null;
  category?: string | null;
  photo_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  whatsapp_verified?: boolean | null;
  gst_number?: string | null;
  verification_score?: number | null;
  duplicate_risk_score?: number | null;
  created_at?: string | null;
  profiles?: { full_name?: string | null } | null;
  order_count?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  retailer: RetailerLike | null;
  onCompleted?: () => void;
}

interface DupMatch {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  reason: string;
  risk: "low" | "medium" | "high";
}

// Weighted scoring — core 80% is name + phone + address + GPS
const WEIGHTS = {
  name: 20,
  phone: 25,
  address: 15,
  gps: 20,
  whatsapp: 10,
  photo: 5,
  gst: 5,
} as const;

function isValidPhone(p?: string | null) {
  if (!p) return false;
  const digits = p.replace(/\D/g, "");
  return digits.length >= 10;
}

function computeSignals(r: RetailerLike) {
  const name = !!r.name && r.name.trim().length >= 3;
  const phone = isValidPhone(r.phone);
  const address = !!r.address && r.address.trim().length >= 5;
  const gps = typeof r.latitude === "number" && typeof r.longitude === "number" && (r.latitude !== 0 || r.longitude !== 0);
  const whatsapp = !!r.whatsapp_verified;
  const photo = !!r.photo_url;
  const gst = !!r.gst_number && r.gst_number.trim().length >= 10;
  const score =
    (name ? WEIGHTS.name : 0) +
    (phone ? WEIGHTS.phone : 0) +
    (address ? WEIGHTS.address : 0) +
    (gps ? WEIGHTS.gps : 0) +
    (whatsapp ? WEIGHTS.whatsapp : 0) +
    (photo ? WEIGHTS.photo : 0) +
    (gst ? WEIGHTS.gst : 0);
  return { name, phone, address, gps, whatsapp, photo, gst, score };
}

function statusFromScore(score: number): { label: string; cls: string } {
  if (score >= 90) return { label: "Gold Verified", cls: "bg-amber-100 text-amber-800 border-amber-300" };
  if (score >= 80) return { label: "Verified", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" };
  if (score >= 50) return { label: "Partially Verified", cls: "bg-sky-100 text-sky-800 border-sky-300" };
  return { label: "Unverified", cls: "bg-zinc-100 text-zinc-700 border-zinc-300" };
}

function Pill({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  const cls = ok
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : warn
    ? "bg-amber-50 text-amber-800 border-amber-200"
    : "bg-rose-50 text-rose-700 border-rose-200";
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  return (
    <div className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs ${cls}`}>
      <span className="font-medium">{label}</span>
      <Icon className="h-3.5 w-3.5 shrink-0" />
    </div>
  );
}

type SignalKey = "name" | "phone" | "address" | "gps" | "whatsapp" | "photo" | "gst";

export function ApprovalChecklistDialog({ open, onOpenChange, retailer, onCompleted }: Props) {
  const [confirmDup, setConfirmDup] = useState(false);
  const [confirmEvidence, setConfirmEvidence] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [dupes, setDupes] = useState<DupMatch[]>([]);
  const [dupLoading, setDupLoading] = useState(false);
  const [manual, setManual] = useState<Record<SignalKey, boolean>>({
    name: false, phone: false, address: false, gps: false, whatsapp: false, photo: false, gst: false,
  });

  useEffect(() => {
    if (!open) return;
    setConfirmDup(false); setConfirmEvidence(false); setConfirmApprove(false);
    setNotes(""); setDupes([]);
    setManual({ name: false, phone: false, address: false, gps: false, whatsapp: false, photo: false, gst: false });
    if (!retailer) return;

    (async () => {
      setDupLoading(true);
      try {
        const orFilter: string[] = [];
        if (retailer.phone) orFilter.push(`phone.eq.${retailer.phone}`);
        if (retailer.name) orFilter.push(`name.ilike.%${retailer.name.trim().slice(0, 20)}%`);
        if (!orFilter.length) { setDupes([]); return; }
        const { data } = await supabase
          .from("retailers")
          .select("id,name,phone,address")
          .or(orFilter.join(","))
          .neq("id", retailer.id)
          .limit(5);
        const matches: DupMatch[] = (data || []).map((d: any) => {
          const phoneMatch = !!retailer.phone && d.phone === retailer.phone;
          const nameMatch = !!retailer.name && d.name?.toLowerCase().includes(retailer.name.toLowerCase().slice(0, 8));
          const risk: DupMatch["risk"] = phoneMatch ? "high" : nameMatch ? "medium" : "low";
          const reason = phoneMatch ? "Same phone number" : nameMatch ? "Similar name" : "Possible match";
          return { id: d.id, name: d.name, phone: d.phone, address: d.address, reason, risk };
        });
        setDupes(matches);
      } finally {
        setDupLoading(false);
      }
    })();
  }, [open, retailer?.id]);

  const auto = useMemo(() => (retailer ? computeSignals(retailer) : null), [retailer]);

  const signals = useMemo(() => {
    if (!auto) return null;
    const merged: Record<SignalKey, boolean> = {
      name: auto.name || manual.name,
      phone: auto.phone || manual.phone,
      address: auto.address || manual.address,
      gps: auto.gps || manual.gps,
      whatsapp: auto.whatsapp || manual.whatsapp,
      photo: auto.photo || manual.photo,
      gst: auto.gst || manual.gst,
    };
    const score =
      (merged.name ? WEIGHTS.name : 0) +
      (merged.phone ? WEIGHTS.phone : 0) +
      (merged.address ? WEIGHTS.address : 0) +
      (merged.gps ? WEIGHTS.gps : 0) +
      (merged.whatsapp ? WEIGHTS.whatsapp : 0) +
      (merged.photo ? WEIGHTS.photo : 0) +
      (merged.gst ? WEIGHTS.gst : 0);
    return { ...merged, score };
  }, [auto, manual]);

  if (!retailer || !signals || !auto) return null;
  const status = statusFromScore(signals.score);
  const toggle = (k: SignalKey) => setManual((m) => ({ ...m, [k]: !m[k] }));

  // Missing required = core 80% fields not present
  const missing: string[] = [];
  if (!signals.name) missing.push("Retailer name");
  if (!signals.phone) missing.push("Valid phone number");
  if (!signals.address) missing.push("Address");
  if (!signals.gps) missing.push("GPS location");

  const highRiskDup = dupes.some((d) => d.risk === "high");
  const allConfirmed = confirmDup && confirmEvidence && confirmApprove;
  const approveBlocked = missing.length > 0 || !allConfirmed;

  const performAction = async (
    action: "verified" | "needs_attention" | "rejected" | "duplicate"
  ) => {
    if (action === "needs_attention" && !notes.trim()) {
      toast({ title: "Reason required", description: "Please add a note explaining what's missing.", variant: "destructive" });
      return;
    }
    if (action === "rejected" && !notes.trim()) {
      toast({ title: "Reason required", description: "Please add a rejection reason.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id ?? null;
      let verifierName: string | null = null;
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles").select("full_name, username").eq("id", uid).maybeSingle();
        verifierName = prof?.full_name || prof?.username || userRes.user?.email || null;
      }

      const patch: Record<string, any> = {
        verification_score: signals.score,
        verification_notes: notes || null,
      };
      if (action === "verified") {
        patch.verified = true;
        patch.verification_status = "verified";
        patch.verification_address = signals.address;
        patch.verification_contact = signals.phone;
        patch.verification_territory = true;
        patch.verification_method = "manual";
        patch.verified_by = uid;
        patch.verified_by_name = verifierName;
        patch.verified_at = new Date().toISOString();
      } else if (action === "needs_attention") {
        patch.verified = false;
        patch.verification_status = "needs_attention";
      } else if (action === "rejected") {
        patch.verified = false;
        patch.verification_status = "dropped";
      } else if (action === "duplicate") {
        patch.verified = false;
        patch.verification_status = "needs_attention";
        patch.duplicate_risk_score = Math.max(retailer.duplicate_risk_score ?? 0, 90);
      }

      const { error } = await supabase.from("retailers").update(patch).eq("id", retailer.id);
      if (error) throw error;

      await supabase.from("retailer_verification_audit").insert({
        retailer_id: retailer.id,
        action,
        method: "manual",
        verified_items: {
          score: signals.score,
          signals,
          dup_matches: dupes.length,
          high_risk_dup: highRiskDup,
        },
        notes: notes || null,
        performed_by: uid,
        performed_by_name: verifierName,
      });

      toast({
        title:
          action === "verified" ? "Retailer approved"
          : action === "duplicate" ? "Marked as duplicate"
          : action === "rejected" ? "Retailer rejected"
          : "Sent back for correction",
        description: retailer.name,
      });
      onOpenChange(false);
      onCompleted?.();
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const createdOn = retailer.created_at ? new Date(retailer.created_at).toLocaleDateString() : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Retailer Risk Assessment
            <span className="text-muted-foreground font-normal text-sm">· {retailer.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 space-y-4">
          {/* Section 1: Verification Score */}
          <div className="rounded-xl border bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Verification Score</div>
                <div className="mt-1 flex items-end gap-2">
                  <div className="text-4xl font-bold tabular-nums">{signals.score}%</div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${status.cls}`}>{status.label}</span>
                </div>
                <div className="mt-2 h-2 w-64 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full ${signals.score >= 90 ? "bg-amber-500" : signals.score >= 80 ? "bg-emerald-500" : signals.score >= 50 ? "bg-sky-500" : "bg-zinc-400"}`}
                    style={{ width: `${Math.min(100, signals.score)}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Core 80% = Name · Phone · Address · GPS. WhatsApp / Photo / GST contribute the remaining 20%.
                </p>
              </div>
              <div className="text-right text-xs space-y-1 shrink-0">
                <div>Created by <span className="font-medium">{retailer.profiles?.full_name || "—"}</span></div>
                <div>On <span className="font-medium">{createdOn}</span></div>
                <div>Orders <span className="font-medium">{retailer.order_count ?? 0}</span></div>
              </div>
            </div>
          </div>

          {/* Section 2: Risk Indicators */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" /> Risk Indicators
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Pill ok={!highRiskDup} warn={dupes.length > 0 && !highRiskDup} label={`Duplicate Risk: ${highRiskDup ? "HIGH" : dupes.length ? "MED" : "LOW"}`} />
              <Pill ok={signals.phone} label={`Phone: ${signals.phone ? "VALID" : "MISSING"}`} />
              <Pill ok={signals.whatsapp} warn label={`WhatsApp: ${signals.whatsapp ? "VERIFIED" : "PENDING"}`} />
              <Pill ok={signals.gps} label={`GPS: ${signals.gps ? "CAPTURED" : "MISSING"}`} />
              <Pill ok={signals.photo} warn label={`Shop Photo: ${signals.photo ? "YES" : "NO"}`} />
              <Pill ok={!!(retailer.owner_name || retailer.contact_person)} warn label={`Owner: ${(retailer.owner_name || retailer.contact_person) ? "YES" : "NO"}`} />
            </div>
          </div>

          {/* Section 3: Duplicate Analysis */}
          <div className="rounded-lg border">
            <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <CopyIcon className="h-3.5 w-3.5" /> Duplicate Analysis
              {dupLoading && <span className="ml-2 font-normal normal-case text-[10px]">scanning…</span>}
            </div>
            {dupes.length === 0 && !dupLoading && (
              <div className="p-3 text-xs text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> No potential duplicates detected.
              </div>
            )}
            {dupes.map((d) => (
              <div key={d.id} className="px-3 py-2 border-t first:border-t-0 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{d.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{d.phone || "no phone"} · {d.address || "no address"}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{d.reason}</span>
                  <Badge variant="outline" className={
                    d.risk === "high" ? "bg-rose-50 text-rose-700 border-rose-200" :
                    d.risk === "medium" ? "bg-amber-50 text-amber-800 border-amber-200" :
                    "bg-zinc-50 text-zinc-700 border-zinc-200"
                  }>{d.risk.toUpperCase()}</Badge>
                </div>
              </div>
            ))}
          </div>

          {/* Section 4: Field Validation (click any card to mark as verified) */}
          <div className="text-[11px] text-muted-foreground -mb-1">
            Tip: Click any field card below to manually mark it as verified. The score updates instantly.
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <FieldCard
              icon={User} title="Shop Name" value={retailer.name}
              ok={signals.name} weight={WEIGHTS.name}
              manual={manual.name} autoOk={auto.name}
              onToggle={() => toggle("name")}
              checks={[
                { label: "Name provided", ok: signals.name },
                { label: "No exact duplicate", ok: !highRiskDup, warn: dupes.length > 0 && !highRiskDup },
              ]}
            />
            <FieldCard
              icon={Phone} title="Phone" value={retailer.phone || "—"}
              ok={signals.phone} weight={WEIGHTS.phone}
              manual={manual.phone} autoOk={auto.phone}
              onToggle={() => toggle("phone")}
              checks={[
                { label: "10+ digits", ok: signals.phone },
                { label: "WhatsApp verified", ok: signals.whatsapp, warn: !signals.whatsapp },
                { label: "Not used elsewhere", ok: !dupes.some(d => d.phone === retailer.phone), warn: dupes.some(d => d.phone === retailer.phone) },
              ]}
              extra={retailer.phone ? (
                <div className="flex gap-3 mt-1">
                  <a onClick={(e) => e.stopPropagation()} href={`tel:${retailer.phone}`} className="text-[11px] text-primary inline-flex items-center gap-1 hover:underline"><Phone className="h-3 w-3" />Call</a>
                  <a onClick={(e) => e.stopPropagation()} href={`https://wa.me/${retailer.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary inline-flex items-center gap-1 hover:underline"><MessageCircle className="h-3 w-3" />WhatsApp</a>
                </div>
              ) : null}
            />
            <FieldCard
              icon={MapPin} title="Address" value={retailer.address || "—"}
              ok={signals.address} weight={WEIGHTS.address}
              manual={manual.address} autoOk={auto.address}
              onToggle={() => toggle("address")}
              checks={[{ label: "Address provided", ok: signals.address }]}
              extra={retailer.address ? (
                <a onClick={(e) => e.stopPropagation()} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(retailer.address)}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary inline-flex items-center gap-1 hover:underline">Open in Maps <ExternalLink className="h-3 w-3" /></a>
              ) : null}
            />
            <FieldCard
              icon={MapPinned} title="GPS Location"
              value={auto.gps ? `${retailer.latitude?.toFixed(5)}, ${retailer.longitude?.toFixed(5)}` : "Not captured"}
              ok={signals.gps} weight={WEIGHTS.gps}
              manual={manual.gps} autoOk={auto.gps}
              onToggle={() => toggle("gps")}
              checks={[
                { label: "Coordinates captured", ok: signals.gps },
                { label: `Beat: ${retailer.beat_name || "—"}`, ok: !!retailer.beat_name, warn: !retailer.beat_name },
              ]}
            />
            <FieldCard
              icon={Camera} title="Shop Photo" value={retailer.photo_url ? "Uploaded" : "Not uploaded"}
              ok={signals.photo} weight={WEIGHTS.photo}
              manual={manual.photo} autoOk={auto.photo}
              onToggle={() => toggle("photo")}
              checks={[{ label: "Front photo present", ok: signals.photo, warn: !signals.photo }]}
              extra={retailer.photo_url ? (
                <a onClick={(e) => e.stopPropagation()} href={retailer.photo_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary inline-flex items-center gap-1 hover:underline">View photo <ExternalLink className="h-3 w-3" /></a>
              ) : null}
            />
            <FieldCard
              icon={FileText} title="GST" value={retailer.gst_number || "—"}
              ok={signals.gst} weight={WEIGHTS.gst}
              manual={manual.gst} autoOk={auto.gst}
              onToggle={() => toggle("gst")}
              checks={[{ label: "GST number provided", ok: signals.gst, warn: !signals.gst }]}
            />
          </div>


          {/* Missing Information Alert */}
          {missing.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <div className="flex items-center gap-2 text-rose-800 font-semibold text-sm mb-1.5">
                <AlertTriangle className="h-4 w-4" /> Missing Required Items
              </div>
              <ul className="text-xs text-rose-700 space-y-0.5">
                {missing.map((m) => <li key={m}>⚠ {m}</li>)}
              </ul>
              <div className="text-[11px] text-rose-700 mt-1.5">Approval is disabled until the core 80% fields are present.</div>
            </div>
          )}

          {/* Timeline */}
          <div className="rounded-lg border">
            <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Retailer Timeline
            </div>
            <ol className="p-3 space-y-1.5 text-xs">
              <TLItem date={createdOn} label="Retailer created" ok />
              <TLItem date={createdOn} label="GPS captured" ok={signals.gps} />
              <TLItem date={createdOn} label="Photo uploaded" ok={signals.photo} />
              <TLItem date="—" label="WhatsApp verified" ok={signals.whatsapp} />
              <TLItem date="now" label="Submitted for approval" ok />
            </ol>
          </div>

          {/* Approval Decision */}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Approval Decision
            </div>

            <div className="space-y-2">
              <Confirm id="c1" checked={confirmDup} onChange={setConfirmDup} label="I have reviewed duplicate risk." />
              <Confirm id="c2" checked={confirmEvidence} onChange={setConfirmEvidence} label="I have reviewed retailer evidence (name, phone, address, GPS)." />
              <Confirm id="c3" checked={confirmApprove} onChange={setConfirmApprove} label="I approve this retailer for business transactions." />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="approval-notes" className="text-xs">Notes / Reason</Label>
              <Textarea
                id="approval-notes"
                placeholder="Required for Request Info / Reject. Optional for Approve."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[60px] text-sm"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <Button
                onClick={() => performAction("verified")}
                disabled={approveBlocked || saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
              </Button>
              <Button variant="outline" onClick={() => performAction("needs_attention")} disabled={saving}>
                <HelpCircle className="h-4 w-4 mr-1" /> Request Info
              </Button>
              <Button variant="outline" onClick={() => performAction("duplicate")} disabled={saving} className="border-amber-300 text-amber-800 hover:bg-amber-50">
                <CopyIcon className="h-4 w-4 mr-1" /> Mark Duplicate
              </Button>
              <Button variant="destructive" onClick={() => performAction("rejected")} disabled={saving}>
                <XCircle className="h-4 w-4 mr-1" /> Reject
              </Button>
            </div>

            {approveBlocked && missing.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Tick all 3 confirmations to enable Approve.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldCard({
  icon: Icon, title, value, ok, weight, checks, extra,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  ok: boolean;
  weight: number;
  checks: { label: string; ok: boolean; warn?: boolean }[];
  extra?: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-3 ${ok ? "bg-white" : "bg-rose-50/30 border-rose-200"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <Icon className="h-3.5 w-3.5" />{title}
        </div>
        <Badge variant="outline" className="text-[10px]">+{weight}%</Badge>
      </div>
      <div className="mt-1 text-sm font-medium break-words">{value}</div>
      <ul className="mt-1.5 space-y-0.5">
        {checks.map((c, i) => (
          <li key={i} className={`text-[11px] flex items-center gap-1 ${c.ok ? "text-emerald-700" : c.warn ? "text-amber-700" : "text-rose-700"}`}>
            {c.ok ? <CheckCircle2 className="h-3 w-3" /> : c.warn ? <AlertTriangle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {c.label}
          </li>
        ))}
      </ul>
      {extra}
    </div>
  );
}

function Confirm({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      <Label htmlFor={id} className="text-xs cursor-pointer leading-snug">{label}</Label>
    </div>
  );
}

function TLItem({ date, label, ok }: { date: string; label: string; ok?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-zinc-300"}`} />
      <span className="text-muted-foreground tabular-nums w-20">{date}</span>
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}

export default ApprovalChecklistDialog;
