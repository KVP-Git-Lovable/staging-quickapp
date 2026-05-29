import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateDelegation, useTeammates } from "@/hooks/useMyOperations";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function DelegateDrawer({ open, onOpenChange }: Props) {
  const { data: teammates = [] } = useTeammates();
  const create = useCreateDelegation();
  const [toUser, setToUser] = useState("");
  const [scope, setScope] = useState<"all" | "beats" | "retailers">("all");
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const submit = async () => {
    if (!toUser) return;
    await create.mutateAsync({
      toUser,
      scope,
      effectiveFrom: new Date(from).toISOString(),
      effectiveTo: new Date(to + "T23:59:59").toISOString(),
      notes: notes || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Delegate (Leave Coverage)</SheetTitle></SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-1">
            <Label>Delegate to</Label>
            <Select value={toUser} onValueChange={setToUser}>
              <SelectTrigger><SelectValue placeholder="Pick teammate" /></SelectTrigger>
              <SelectContent>
                {teammates.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.full_name || t.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All my retailers</SelectItem>
                <SelectItem value="beats">Selected beats (coming soon)</SelectItem>
                <SelectItem value="retailers">Selected retailers (coming soon)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <Button className="w-full" onClick={submit} disabled={!toUser || create.isPending}>
            {create.isPending ? "Creating..." : "Create delegation"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
