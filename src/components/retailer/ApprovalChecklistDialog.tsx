import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, MapPin, Phone, User, MapPinned, AlertTriangle, ExternalLink, MessageCircle } from "lucide-react";
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
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  retailer: RetailerLike | null;
  onCompleted?: () => void;
}

interface ChecklistItem {
  key: string;
  label: string;
  value: string | null | undefined;
  icon: React.ComponentType<{ className?: string }>;
  required: boolean;
  extra?: React.ReactNode;
}

export function ApprovalChecklistDialog({ open, onOpenChange, retailer, onCompleted }: Props) {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setChecks({});
      setNotes("");
    }
  }, [open, retailer?.id]);

  if (!retailer) return null;

  const ownerLabel = retailer.owner_name || retailer.contact_person || null;

  const items: ChecklistItem[] = [
    { key: "name", label: "Retailer name is genuine", value: retailer.name, icon: CheckCircle2, required: true },
    {
      key: "address",
      label: "Address & GPS look correct",
      value: retailer.address,
      icon: MapPin,
      required: true,
      extra: retailer.address ? (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(retailer.address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
        >
          Open in Maps <ExternalLink className="h-3 w-3" />
        </a>
      ) : null,
    },
    {
      key: "phone",
      label: "Phone number is genuine",
      value: retailer.phone,
      icon: Phone,
      required: !!retailer.phone,
      extra: retailer.phone ? (
        <div className="flex gap-2 mt-1">
          <a href={`tel:${retailer.phone}`} className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
            <Phone className="h-3 w-3" /> Call
          </a>
          <a
            href={`https://wa.me/${retailer.phone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
          >
            <MessageCircle className="h-3 w-3" /> WhatsApp
          </a>
        </div>
      ) : null,
    },
    ...(ownerLabel
      ? [{ key: "owner", label: "Owner / contact person is genuine", value: ownerLabel, icon: User, required: true }]
      : []),
    {
      key: "beat",
      label: "Beat & Territory assignment is correct",
      value: [retailer.beat_name, retailer.territory_name].filter(Boolean).join(" • ") || "—",
      icon: MapPinned,
      required: true,
    },
    ...(retailer.category
      ? [{ key: "category", label: "Shop category / type looks right", value: retailer.category, icon: CheckCircle2, required: false }]
      : []),
  ];

  const requiredKeys = items.filter((i) => i.required).map((i) => i.key);
  const allRequiredTicked = requiredKeys.every((k) => checks[k]);

  const handleApprove = async () => {
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id ?? null;

      let verifierName: string | null = null;
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name, username")
          .eq("id", uid)
          .maybeSingle();
        verifierName = prof?.full_name || prof?.username || userRes.user?.email || null;
      }

      const { error } = await supabase
        .from("retailers")
        .update({
          verified: true,
          verification_status: "verified",
          verification_address: true,
          verification_contact: true,
          verification_territory: true,
          verification_method: "manual",
          verification_notes: notes || null,
          verified_by: uid,
          verified_by_name: verifierName,
          verified_at: new Date().toISOString(),
        })
        .eq("id", retailer.id);

      if (error) throw error;

      await supabase.from("retailer_verification_audit").insert({
        retailer_id: retailer.id,
        action: "verified",
        method: "manual",
        verified_items: checks,
        notes: notes || null,
        performed_by: uid,
        performed_by_name: verifierName,
      });

      toast({ title: "Retailer verified", description: `${retailer.name} approved successfully.` });
      onOpenChange(false);
      onCompleted?.();
    } catch (e: any) {
      toast({ title: "Approval failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id ?? null;

      const { error } = await supabase
        .from("retailers")
        .update({
          verified: false,
          verification_status: "needs_attention",
          verification_notes: notes || null,
        })
        .eq("id", retailer.id);
      if (error) throw error;

      await supabase.from("retailer_verification_audit").insert({
        retailer_id: retailer.id,
        action: "rejected",
        method: "manual",
        verified_items: checks,
        notes: notes || null,
        performed_by: uid,
      });

      toast({ title: "Marked as Needs Attention", description: notes || "Sent back for correction." });
      onOpenChange(false);
      onCompleted?.();
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-blue-600" />
            Approve Retailer — Confirmation Checklist
          </DialogTitle>
          <DialogDescription>
            Tick every required item below after confirming each detail is genuine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.key} className="flex items-start gap-3 p-3 rounded-lg border">
                <Checkbox
                  id={`chk-${item.key}`}
                  checked={!!checks[item.key]}
                  onCheckedChange={(c) => setChecks((s) => ({ ...s, [item.key]: !!c }))}
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <Label htmlFor={`chk-${item.key}`} className="flex items-center gap-2 cursor-pointer">
                    <Icon className="h-4 w-4 text-primary" />
                    {item.label}
                    {item.required && <Badge variant="outline" className="text-[10px] py-0">Required</Badge>}
                  </Label>
                  <p className="text-sm text-foreground break-words">{item.value || "—"}</p>
                  {item.extra}
                </div>
              </div>
            );
          })}

          <div className="space-y-2">
            <Label htmlFor="approval-notes">Notes (optional)</Label>
            <Textarea
              id="approval-notes"
              placeholder="Any observations…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[70px]"
            />
          </div>

          {!allRequiredTicked && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-xs">
              <AlertTriangle className="h-4 w-4" />
              Tick every required item to enable Approve.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleReject} disabled={saving}>
            Needs Attention
          </Button>
          <Button onClick={handleApprove} disabled={!allRequiredTicked || saving}>
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ApprovalChecklistDialog;
