import { useEffect, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBeatLifecycle } from "@/hooks/useBeatLifecycle";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  retailerId: string;
  retailerName: string;
  currentBeatId?: string | null;
  currentBeatName?: string | null;
  onTransferred?: () => void;
}

interface BeatOption {
  beat_id: string;
  beat_name: string;
}

export const TransferRetailerBeatModal = ({
  open,
  onOpenChange,
  retailerId,
  retailerName,
  currentBeatId,
  currentBeatName,
  onTransferred,
}: Props) => {
  const { user } = useAuth();
  const { loading, transferRetailer } = useBeatLifecycle();
  const [beats, setBeats] = useState<BeatOption[]>([]);
  const [targetBeatId, setTargetBeatId] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      const { data } = await supabase
        .from("beats")
        .select("beat_id, beat_name")
        .eq("is_active", true)
        .eq("user_id", user.id)
        .order("beat_name");
      setBeats((data as any) || []);
    })();
  }, [open, user]);

  const submit = async () => {
    if (!targetBeatId || !reason.trim()) return;
    const ok = await transferRetailer(retailerId, targetBeatId, reason.trim());
    if (ok) {
      onTransferred?.();
      onOpenChange(false);
      setTargetBeatId("");
      setReason("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft size={18} className="text-primary" />
            Transfer Retailer Beat
          </DialogTitle>
          <DialogDescription>
            Move <span className="font-medium text-foreground">{retailerName}</span> to a new beat. Full history is preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Current Beat</Label>
            <div className="text-sm rounded-md border bg-muted/40 px-3 py-2">
              {currentBeatName || (currentBeatId ? currentBeatId : "Unassigned")}
            </div>
          </div>

          <div className="space-y-1">
            <Label>New Beat</Label>
            <Select value={targetBeatId} onValueChange={setTargetBeatId}>
              <SelectTrigger>
                <SelectValue placeholder="Select destination beat" />
              </SelectTrigger>
              <SelectContent>
                {beats
                  .filter((b) => b.beat_id !== currentBeatId)
                  .map((b) => (
                    <SelectItem key={b.beat_id} value={b.beat_id}>
                      {b.beat_name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Transfer Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this retailer moving?"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="flex-1 sm:flex-none">
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading || !targetBeatId || !reason.trim()} className="flex-1 sm:flex-none">
            {loading ? "Transferring..." : "Confirm Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
