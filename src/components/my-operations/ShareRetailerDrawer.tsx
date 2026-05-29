import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useShareRetailer, useTeammates } from "@/hooks/useMyOperations";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  retailerId: string | null;
  retailerName?: string;
}

export function ShareRetailerDrawer({ open, onOpenChange, retailerId, retailerName }: Props) {
  const { data: teammates = [] } = useTeammates();
  const share = useShareRetailer();
  const [toUser, setToUser] = useState("");
  const [perms, setPerms] = useState({ view: true, order: false, collect: false, feedback: false });
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState<string>("");

  const submit = async () => {
    if (!retailerId || !toUser) return;
    await share.mutateAsync({
      retailerId,
      toUser,
      canView: perms.view,
      canTakeOrders: perms.order,
      canCollectPayment: perms.collect,
      canUpdateFeedback: perms.feedback,
      effectiveFrom: new Date(from).toISOString(),
      effectiveTo: to ? new Date(to + "T23:59:59").toISOString() : null,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Share Retailer Access</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          {retailerName && <div className="text-sm text-muted-foreground">{retailerName}</div>}
          <div className="space-y-1">
            <Label>Share with</Label>
            <Select value={toUser} onValueChange={setToUser}>
              <SelectTrigger><SelectValue placeholder="Pick teammate" /></SelectTrigger>
              <SelectContent>
                {teammates.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.full_name || t.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Permissions</Label>
            {(["view", "order", "collect", "feedback"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm capitalize">
                <Checkbox checked={perms[k]} onCheckedChange={(v) => setPerms({ ...perms, [k]: !!v })} />
                {k === "view" ? "Can view" : k === "order" ? "Can take orders" : k === "collect" ? "Can collect payment" : "Can update feedback"}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label>To (optional)</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <Button className="w-full" onClick={submit} disabled={!toUser || share.isPending}>
            {share.isPending ? "Sharing..." : "Share access"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
