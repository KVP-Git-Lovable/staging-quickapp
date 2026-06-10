import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { useRetailerVerificationPolicy } from "@/hooks/useRetailerVerificationPolicy";
import { toast } from "@/hooks/use-toast";

export function VerificationPolicyCard() {
  const { policy, loading, save } = useRetailerVerificationPolicy();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(policy);

  // Sync draft when policy loads
  if (!loading && draft.id !== policy.id) setDraft(policy);

  const handleSave = async () => {
    setSaving(true);
    try {
      await save({
        enabled: draft.enabled,
        max_orders_unverified: Math.max(0, Number(draft.max_orders_unverified) || 0),
        block_after_limit: draft.block_after_limit,
        grace_days: Math.max(0, Number(draft.grace_days) || 0),
        require_verification_for_credit: draft.require_verification_for_credit,
        auto_whatsapp_on_create: draft.auto_whatsapp_on_create,
      });
      toast({ title: "Policy updated" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        className="cursor-pointer flex flex-row items-center justify-between gap-2"
        onClick={() => setOpen((o) => !o)}
      >
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Retailer Verification Policy
          <Badge variant={policy.enabled ? "default" : "outline"}>
            {policy.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </CardTitle>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="vp-enabled" className="font-medium">Enable policy</Label>
            <Switch
              id="vp-enabled"
              checked={draft.enabled}
              onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="vp-max">Max unverified orders</Label>
              <Input
                id="vp-max"
                type="number"
                min={0}
                value={draft.max_orders_unverified}
                onChange={(e) => setDraft({ ...draft, max_orders_unverified: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="vp-grace">Grace days after add</Label>
              <Input
                id="vp-grace"
                type="number"
                min={0}
                value={draft.grace_days}
                onChange={(e) => setDraft({ ...draft, grace_days: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="vp-block">Hard-block after limit (else warn)</Label>
            <Switch
              id="vp-block"
              checked={draft.block_after_limit}
              onCheckedChange={(v) => setDraft({ ...draft, block_after_limit: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="vp-credit">Require verification for credit orders</Label>
            <Switch
              id="vp-credit"
              checked={draft.require_verification_for_credit}
              onCheckedChange={(v) => setDraft({ ...draft, require_verification_for_credit: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="vp-auto-wa">Auto-send WhatsApp on retailer create</Label>
            <Switch
              id="vp-auto-wa"
              checked={draft.auto_whatsapp_on_create}
              onCheckedChange={(v) => setDraft({ ...draft, auto_whatsapp_on_create: v })}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? "Saving…" : "Save Policy"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default VerificationPolicyCard;
