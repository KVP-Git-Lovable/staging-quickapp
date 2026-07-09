import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, ArrowRight, AlertTriangle } from "lucide-react";

interface RetailerLite {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  duplicate_of?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface Stats {
  orders: number;
  pending: number;
}

interface MergeRetailerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicate: RetailerLite | null; // the row the admin clicked "Merge" on
  onMerged?: () => void;
}

async function fetchStats(retailerId: string): Promise<Stats> {
  const [{ count: orders }, { data: r }] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("retailer_id", retailerId),
    supabase.from("retailers").select("pending_amount").eq("id", retailerId).maybeSingle(),
  ]);
  return {
    orders: orders ?? 0,
    pending: Number((r as any)?.pending_amount ?? 0),
  };
}

export const MergeRetailerDialog = ({ open, onOpenChange, duplicate, onMerged }: MergeRetailerDialogProps) => {
  const [survivor, setSurvivor] = useState<RetailerLite | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState<RetailerLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [reason, setReason] = useState("");
  const [merging, setMerging] = useState(false);
  const [dupStats, setDupStats] = useState<Stats | null>(null);
  const [survStats, setSurvStats] = useState<Stats | null>(null);

  // Reset + pre-fill survivor from duplicate_of when opened
  useEffect(() => {
    if (!open) return;
    setSurvivor(null);
    setSearchTerm("");
    setSuggestions([]);
    setReason("");
    setDupStats(null);
    setSurvStats(null);
    if (!duplicate) return;

    fetchStats(duplicate.id).then(setDupStats).catch(() => {});

    (async () => {
      // Pre-fill from duplicate_of if set
      if (duplicate.duplicate_of) {
        const { data } = await supabase
          .from("retailers")
          .select("id, name, phone, address")
          .eq("id", duplicate.duplicate_of)
          .maybeSingle();
        if (data) setSurvivor(data as any);
      }
      // Also try find_duplicate_retailers to suggest candidates
      try {
        const { data } = await supabase.rpc("find_duplicate_retailers" as any, {
          p_name: duplicate.name,
          p_phone: duplicate.phone ?? null,
          p_lat: duplicate.latitude ?? null,
          p_lng: duplicate.longitude ?? null,
        });
        if (Array.isArray(data)) {
          setSuggestions(
            (data as any[])
              .filter((r: any) => r.id !== duplicate.id)
              .slice(0, 5)
              .map((r: any) => ({ id: r.id, name: r.name, phone: r.phone, address: r.address }))
          );
        }
      } catch {}
    })();
  }, [open, duplicate]);

  // Fetch survivor stats whenever survivor changes
  useEffect(() => {
    if (!survivor) {
      setSurvStats(null);
      return;
    }
    fetchStats(survivor.id).then(setSurvStats).catch(() => {});
  }, [survivor]);

  // Search other retailers by name/phone
  useEffect(() => {
    if (!open) return;
    const q = searchTerm.trim();
    if (q.length < 2) return;
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("retailers")
        .select("id, name, phone, address")
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(10);
      if (cancelled) return;
      setSuggestions(((data as any[]) || []).filter((r) => r.id !== duplicate?.id));
      setSearching(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchTerm, open, duplicate?.id]);

  const canMerge = useMemo(
    () => !!duplicate && !!survivor && duplicate.id !== survivor.id && !merging,
    [duplicate, survivor, merging]
  );

  const handleMerge = async () => {
    if (!duplicate || !survivor) return;
    setMerging(true);
    try {
      const { data, error } = await supabase.rpc("merge_retailers" as any, {
        p_source: duplicate.id,
        p_target: survivor.id,
        p_reason: reason || null,
      });
      if (error) throw error;
      const res = (data as any) || {};
      toast({
        title: "Retailers merged",
        description: `Moved ${res.total_rows_moved ?? 0} rows to "${survivor.name}". Pending: ₹${Number(res.pending_after ?? 0).toFixed(2)}. The duplicate is now inactive and can be deleted.`,
      });
      onMerged?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error("merge_retailers failed", e);
      toast({ title: "Merge failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setMerging(false);
    }
  };

  const StatBlock = ({ label, stats }: { label: string; stats: Stats | null }) => (
    <div className="text-xs text-muted-foreground">
      <div>{label}: {stats ? `${stats.orders} orders · ₹${stats.pending.toFixed(2)} pending` : "…"}</div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge duplicate retailer</DialogTitle>
          <DialogDescription>
            All transactional history (orders, visits, credit, payments) from the duplicate will be repointed to the survivor,
            and the survivor's pending will be recomputed. For one-row-per-retailer tables (loyalty summary, credit score,
            current beat, cart) the survivor's row is kept and the duplicate's is dropped. The duplicate is then marked inactive.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3 border-destructive/40">
            <div className="text-xs uppercase text-destructive font-semibold mb-1">Duplicate (merge & deactivate)</div>
            {duplicate ? (
              <>
                <div className="font-medium truncate">{duplicate.name}</div>
                <div className="text-xs text-muted-foreground truncate">{duplicate.phone || "—"}</div>
                <div className="text-xs text-muted-foreground truncate">{duplicate.address || "—"}</div>
                <div className="mt-2"><StatBlock label="History" stats={dupStats} /></div>
              </>
            ) : <div className="text-sm text-muted-foreground">—</div>}
          </Card>

          <Card className="p-3 border-emerald-500/40">
            <div className="text-xs uppercase text-emerald-700 dark:text-emerald-400 font-semibold mb-1">Survivor (keep)</div>
            {survivor ? (
              <>
                <div className="font-medium truncate">{survivor.name}</div>
                <div className="text-xs text-muted-foreground truncate">{survivor.phone || "—"}</div>
                <div className="text-xs text-muted-foreground truncate">{survivor.address || "—"}</div>
                <div className="mt-2"><StatBlock label="History" stats={survStats} /></div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2 h-7 px-2 text-xs"
                  onClick={() => setSurvivor(null)}
                >
                  Change
                </Button>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Pick a survivor below.</div>
            )}
          </Card>
        </div>

        {!survivor && (
          <div className="space-y-2">
            <Label htmlFor="survivor-search">Search survivor by name or phone</Label>
            <Input
              id="survivor-search"
              placeholder="Type at least 2 characters…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="max-h-56 overflow-y-auto rounded border divide-y">
              {searching && (
                <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                </div>
              )}
              {!searching && suggestions.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground">No suggestions yet.</div>
              )}
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSurvivor(s)}
                  className="w-full text-left p-2 hover:bg-accent flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.phone || "—"} · {s.address || "—"}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="merge-reason">Reason (optional)</Label>
          <Textarea
            id="merge-reason"
            placeholder="e.g. Same shop, duplicate entry created offline."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
        </div>

        <div className="flex items-start gap-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>This action cannot be undone. Confirm you have picked the correct survivor.</span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={merging}>
            Cancel
          </Button>
          <Button onClick={handleMerge} disabled={!canMerge}>
            {merging ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Merging…</>) : "Merge & deactivate duplicate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MergeRetailerDialog;
