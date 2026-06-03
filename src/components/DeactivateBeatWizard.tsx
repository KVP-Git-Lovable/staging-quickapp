import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as beatService from "@/services/beatService";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Power } from "lucide-react";

type Mode = "keep" | "transfer_all" | "transfer_selected";

interface DeactivateBeatWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beat: { id: string; beat_id: string; beat_name: string };
  retailerCount: number;
  userId: string;
  onSuccess: () => void;
}

interface DestBeat {
  id: string;
  beat_id: string;
  beat_name: string;
}

interface RetailerRow {
  id: string;
  name: string | null;
}

export function DeactivateBeatWizard({
  open,
  onOpenChange,
  beat,
  retailerCount,
  userId,
  onSuccess,
}: DeactivateBeatWizardProps) {
  const { can, loading: permLoading } = usePermissions();
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<Mode>("keep");
  const [destBeatId, setDestBeatId] = useState<string>("");
  const [retailers, setRetailers] = useState<RetailerRow[]>([]);
  const [selectedRetailerIds, setSelectedRetailerIds] = useState<Set<string>>(
    new Set(),
  );
  const [destBeats, setDestBeats] = useState<DestBeat[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset & load when opening
  useEffect(() => {
    if (!open) return;
    setStep(retailerCount === 0 ? 2 : 1);
    setMode("keep");
    setDestBeatId("");
    setSelectedRetailerIds(new Set());
    setRetailers([]);
    setDestBeats([]);

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const nowIso = new Date().toISOString();
        const [retRes, ownRes, accessRes] = await Promise.all([
          retailerCount > 0
            ? supabase
                .from("retailers")
                .select("id, name")
                .eq("beat_id", beat.beat_id)
            : Promise.resolve({ data: [], error: null } as any),
          supabase
            .from("beats")
            .select("id, beat_id, beat_name")
            .eq("is_active", true)
            .eq("user_id", userId)
            .neq("beat_id", beat.beat_id),
          supabase
            .from("beat_user_access")
            .select("beat_id")
            .eq("user_id", userId)
            .eq("is_active", true)
            .or(`effective_to.is.null,effective_to.gt.${nowIso}`),
        ]);
        if (cancelled) return;
        if (retRes.error) throw retRes.error;
        if (ownRes.error) throw ownRes.error;

        let sharedBeats: DestBeat[] = [];
        const sharedBeatIds = ((accessRes as any)?.data ?? [])
          .map((r: any) => r.beat_id)
          .filter((id: string) => id && id !== beat.beat_id);
        if (sharedBeatIds.length > 0) {
          const { data: sb, error: sbErr } = await supabase
            .from("beats")
            .select("id, beat_id, beat_name")
            .eq("is_active", true)
            .in("beat_id", sharedBeatIds)
            .neq("beat_id", beat.beat_id);
          if (sbErr) {
            console.warn("Shared beats lookup failed:", sbErr.message);
          } else {
            sharedBeats = (sb ?? []) as DestBeat[];
          }
        }

        const all = [...((ownRes.data ?? []) as DestBeat[]), ...sharedBeats];
        const deduped = Array.from(
          new Map(all.map((b) => [b.beat_id, b])).values(),
        );

        setRetailers((retRes.data ?? []) as RetailerRow[]);
        setDestBeats(deduped);
      } catch (err: any) {
        toast.error(err?.message || "Failed to load wizard data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, beat.beat_id, retailerCount, userId]);

  const destBeat = destBeats.find((b) => b.beat_id === destBeatId);

  const transferIds: string[] =
    mode === "transfer_all"
      ? retailers.map((r) => r.id)
      : mode === "transfer_selected"
        ? Array.from(selectedRetailerIds)
        : [];

  const step1Valid =
    retailerCount === 0 ||
    mode === "keep" ||
    (mode === "transfer_all" && !!destBeatId) ||
    (mode === "transfer_selected" &&
      !!destBeatId &&
      selectedRetailerIds.size > 0);

  const toggleRetailer = (id: string, checked: boolean) => {
    setSelectedRetailerIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (permLoading) { toast.message("Checking permissions…"); return; }
    if (!can("action_beat_delete", "delete")) { toast.error("You don't have permission to deactivate beats"); return; }
    setSubmitting(true);
    try {
      if (
        (mode === "transfer_all" || mode === "transfer_selected") &&
        transferIds.length > 0 &&
        destBeat
      ) {
        await beatService.transferRetailers(
          transferIds,
          beat.id,
          destBeat.id,
          userId,
          "Beat deactivation",
        );
      }
      await beatService.deactivateBeat(beat.id, userId);
      toast.success(`Beat "${beat.beat_name}" deactivated`);
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to deactivate beat");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Power size={18} className="text-orange-500" />
            Deactivate Beat — {beat.beat_name}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Choose how to handle the retailers attached to this beat."
              : "Review and confirm the changes."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : step === 1 ? (
          <div className="space-y-4">
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <div className="flex items-start gap-2 rounded-md border p-3">
                <RadioGroupItem value="keep" id="opt-keep" className="mt-1" />
                <Label htmlFor="opt-keep" className="flex-1 cursor-pointer">
                  <div className="font-medium">Keep retailers attached</div>
                  <div className="text-sm text-muted-foreground">
                    Beat becomes inactive, retailers stay.
                  </div>
                </Label>
              </div>

              <div className="flex items-start gap-2 rounded-md border p-3">
                <RadioGroupItem
                  value="transfer_all"
                  id="opt-all"
                  className="mt-1"
                />
                <Label htmlFor="opt-all" className="flex-1 cursor-pointer">
                  <div className="font-medium">
                    Transfer all retailers ({retailerCount})
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Move every retailer to another active beat.
                  </div>
                </Label>
              </div>

              <div className="flex items-start gap-2 rounded-md border p-3">
                <RadioGroupItem
                  value="transfer_selected"
                  id="opt-sel"
                  className="mt-1"
                />
                <Label htmlFor="opt-sel" className="flex-1 cursor-pointer">
                  <div className="font-medium">Transfer selected retailers</div>
                  <div className="text-sm text-muted-foreground">
                    Pick specific retailers to move.
                  </div>
                </Label>
              </div>
            </RadioGroup>

            {(mode === "transfer_all" || mode === "transfer_selected") && (
              <div className="space-y-2">
                <Label>Destination beat</Label>
                <Select value={destBeatId} onValueChange={setDestBeatId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination beat" />
                  </SelectTrigger>
                  <SelectContent>
                    {destBeats.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">
                        No active beats available.
                      </div>
                    ) : (
                      destBeats.map((b) => (
                        <SelectItem key={b.beat_id} value={b.beat_id}>
                          {b.beat_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === "transfer_selected" && (
              <div className="space-y-2">
                <Label>
                  Retailers ({selectedRetailerIds.size}/{retailers.length}{" "}
                  selected)
                </Label>
                <ScrollArea className="h-48 rounded-md border p-2">
                  {retailers.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      No retailers found.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {retailers.map((r) => (
                        <label
                          key={r.id}
                          className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-accent"
                        >
                          <Checkbox
                            checked={selectedRetailerIds.has(r.id)}
                            onCheckedChange={(c) =>
                              toggleRetailer(r.id, !!c)
                            }
                          />
                          <span className="text-sm">
                            {r.name || "(unnamed)"}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 rounded-md border bg-muted/40 p-4 text-sm">
            <div>
              Beat{" "}
              <span className="font-semibold">{beat.beat_name}</span> will be
              marked <span className="font-semibold">Inactive</span>.
            </div>
            {mode === "keep" && retailerCount > 0 && (
              <div>
                <span className="font-semibold">{retailerCount}</span>{" "}
                retailer(s) will remain attached.
              </div>
            )}
            {(mode === "transfer_all" || mode === "transfer_selected") &&
              transferIds.length > 0 &&
              destBeat && (
                <div>
                  <span className="font-semibold">{transferIds.length}</span>{" "}
                  retailer(s) will move to{" "}
                  <span className="font-semibold">{destBeat.beat_name}</span>.
                </div>
              )}
            {retailerCount === 0 && (
              <div className="text-muted-foreground">
                This beat has no retailers.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 1 ? (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={() => setStep(2)}
                disabled={!step1Valid || loading}
              >
                Next
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setStep(retailerCount === 0 ? 2 : 1)}
                disabled={submitting || retailerCount === 0}
              >
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={submitting}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Confirm Deactivate
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeactivateBeatWizard;
