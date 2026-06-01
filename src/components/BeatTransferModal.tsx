import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ChevronsRight, ChevronLeft, ChevronsLeft, Loader2, X, Info, GripVertical, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Beat {
  id: string;
  beat_name: string;
}
interface Retailer {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const PAGE_SIZE = 50;

export const BeatTransferModal = ({ open, onOpenChange, onSuccess }: Props) => {
  const [beats, setBeats] = useState<Beat[]>([]);
  const [loadingBeats, setLoadingBeats] = useState(false);

  const [sourceBeatId, setSourceBeatId] = useState("");
  const [destBeatId, setDestBeatId] = useState("");

  const [available, setAvailable] = useState<Retailer[]>([]);
  const [selected, setSelected] = useState<Retailer[]>([]);
  const [loadingRetailers, setLoadingRetailers] = useState(false);

  const [leftSearch, setLeftSearch] = useState("");
  const [rightSearch, setRightSearch] = useState("");
  const [leftChecked, setLeftChecked] = useState<Set<string>>(new Set());
  const [rightChecked, setRightChecked] = useState<Set<string>>(new Set());

  const [leftPage, setLeftPage] = useState(1);
  const [rightPage, setRightPage] = useState(1);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);

  // Reset state when closing
  useEffect(() => {
    if (!open) {
      setSourceBeatId(""); setDestBeatId("");
      setAvailable([]); setSelected([]);
      setLeftSearch(""); setRightSearch("");
      setLeftChecked(new Set()); setRightChecked(new Set());
      setLeftPage(1); setRightPage(1);
      setConfirmOpen(false);
    }
  }, [open]);

  // Load beats when opened
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoadingBeats(true);
      const { data, error } = await supabase
        .from("beats")
        .select("id, beat_name")
        .eq("is_active", true)
        .order("beat_name", { ascending: true });
      if (error) toast.error(error.message);
      setBeats((data as Beat[]) || []);
      setLoadingBeats(false);
    })();
  }, [open]);

  // Load retailers for source beat
  useEffect(() => {
    if (!sourceBeatId) {
      setAvailable([]); setSelected([]);
      setLeftChecked(new Set()); setRightChecked(new Set());
      return;
    }
    (async () => {
      setLoadingRetailers(true);
      const { data, error } = await supabase
        .from("retailers")
        .select("id, name")
        .eq("beat_id", sourceBeatId)
        .order("name", { ascending: true });
      if (error) toast.error(error.message);
      setAvailable((data as Retailer[]) || []);
      setSelected([]);
      setLeftChecked(new Set()); setRightChecked(new Set());
      setLeftPage(1); setRightPage(1);
      setLoadingRetailers(false);
    })();
  }, [sourceBeatId]);

  const sourceBeat = beats.find((b) => b.id === sourceBeatId);
  const destBeat = beats.find((b) => b.id === destBeatId);
  const sameBeat = !!sourceBeatId && !!destBeatId && sourceBeatId === destBeatId;

  const filteredLeft = useMemo(
    () => available.filter((r) => r.name.toLowerCase().includes(leftSearch.toLowerCase())),
    [available, leftSearch],
  );
  const filteredRight = useMemo(
    () => selected.filter((r) => r.name.toLowerCase().includes(rightSearch.toLowerCase())),
    [selected, rightSearch],
  );

  const leftTotal = filteredLeft.length;
  const rightTotal = filteredRight.length;
  const leftStart = leftTotal === 0 ? 0 : (leftPage - 1) * PAGE_SIZE + 1;
  const leftEnd = Math.min(leftPage * PAGE_SIZE, leftTotal);
  const rightStart = rightTotal === 0 ? 0 : (rightPage - 1) * PAGE_SIZE + 1;
  const rightEnd = Math.min(rightPage * PAGE_SIZE, rightTotal);
  const leftPageItems = filteredLeft.slice(leftStart === 0 ? 0 : leftStart - 1, leftEnd);
  const rightPageItems = filteredRight.slice(rightStart === 0 ? 0 : rightStart - 1, rightEnd);

  const toggleLeft = (id: string) => {
    const s = new Set(leftChecked);
    s.has(id) ? s.delete(id) : s.add(id);
    setLeftChecked(s);
  };
  const toggleRight = (id: string) => {
    const s = new Set(rightChecked);
    s.has(id) ? s.delete(id) : s.add(id);
    setRightChecked(s);
  };

  const moveRight = () => {
    if (leftChecked.size === 0) return;
    const moving = available.filter((r) => leftChecked.has(r.id));
    setSelected([...selected, ...moving].sort((a, b) => a.name.localeCompare(b.name)));
    setAvailable(available.filter((r) => !leftChecked.has(r.id)));
    setLeftChecked(new Set());
  };
  const moveAllRight = () => {
    if (filteredLeft.length === 0) return;
    const movingIds = new Set(filteredLeft.map((r) => r.id));
    setSelected([...selected, ...filteredLeft].sort((a, b) => a.name.localeCompare(b.name)));
    setAvailable(available.filter((r) => !movingIds.has(r.id)));
    setLeftChecked(new Set());
  };
  const moveLeft = () => {
    if (rightChecked.size === 0) return;
    const moving = selected.filter((r) => rightChecked.has(r.id));
    setAvailable([...available, ...moving].sort((a, b) => a.name.localeCompare(b.name)));
    setSelected(selected.filter((r) => !rightChecked.has(r.id)));
    setRightChecked(new Set());
  };
  const moveAllLeft = () => {
    if (filteredRight.length === 0) return;
    const movingIds = new Set(filteredRight.map((r) => r.id));
    setAvailable([...available, ...filteredRight].sort((a, b) => a.name.localeCompare(b.name)));
    setSelected(selected.filter((r) => !movingIds.has(r.id)));
    setRightChecked(new Set());
  };
  const removeOne = (id: string) => {
    const r = selected.find((x) => x.id === id);
    if (!r) return;
    setAvailable([...available, r].sort((a, b) => a.name.localeCompare(b.name)));
    setSelected(selected.filter((x) => x.id !== id));
    const s = new Set(rightChecked); s.delete(id); setRightChecked(s);
  };
  const clearAllSelected = () => {
    if (selected.length === 0) return;
    setAvailable([...available, ...selected].sort((a, b) => a.name.localeCompare(b.name)));
    setSelected([]);
    setRightChecked(new Set());
  };

  const canTransfer = !!sourceBeatId && !!destBeatId && !sameBeat && selected.length > 0 && !isTransferring;

  const handleTransfer = async () => {
    if (!canTransfer || !sourceBeat || !destBeat) return;
    setIsTransferring(true);
    try {
      const { data: userData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !userData.user) throw new Error("Not authenticated");
      const userId = userData.user.id;

      const ids = selected.map((r) => r.id);
      const { error: updErr } = await supabase
        .from("retailers")
        .update({
          beat_id: destBeat.id,
          beat_name: destBeat.beat_name,
          updated_at: new Date().toISOString(),
        })
        .in("id", ids);
      if (updErr) throw updErr;

      const historyRows = selected.map((r) => ({
        retailer_id: r.id,
        retailer_name: r.name,
        from_beat_id: sourceBeat.id,
        from_beat_name: sourceBeat.beat_name,
        to_beat_id: destBeat.id,
        to_beat_name: destBeat.beat_name,
        transferred_by: userId,
      }));
      const { error: histErr } = await supabase
        .from("retailer_beat_transfer_history")
        .insert(historyRows);
      if (histErr) throw histErr;

      const count = selected.length;
      toast.success(`${count} retailer${count === 1 ? "" : "s"} transferred successfully.`);
      setConfirmOpen(false);
      onSuccess?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Transfer failed");
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !isTransferring && onOpenChange(o)}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Beat Transfer</DialogTitle>
            <DialogDescription>
              Move retailers from one beat to another in a single operation.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">From Beat</label>
              <Select value={sourceBeatId} onValueChange={setSourceBeatId} disabled={loadingBeats || isTransferring}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingBeats ? "Loading beats..." : "Select source beat"} />
                </SelectTrigger>
                <SelectContent>
                  {beats.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.beat_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">To Beat</label>
              <Select value={destBeatId} onValueChange={setDestBeatId} disabled={loadingBeats || isTransferring || !sourceBeatId}>
                <SelectTrigger>
                  <SelectValue placeholder={!sourceBeatId ? "Select source first" : "Select destination beat"} />
                </SelectTrigger>
                <SelectContent>
                  {beats.filter((b) => b.id !== sourceBeatId).map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.beat_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sameBeat && (
                <p className="text-xs text-destructive">Source and destination beat cannot be the same.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-stretch mt-2">
            {/* Left */}
            <div className="border rounded-md flex flex-col bg-card">
              <div className="px-3 py-2 border-b">
                <h4 className="text-sm font-semibold">
                  Retailers in {sourceBeat?.beat_name || "—"} ({available.length})
                </h4>
              </div>
              <div className="p-3 space-y-2 flex-1 flex flex-col">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Search retailers"
                    value={leftSearch}
                    onChange={(e) => { setLeftSearch(e.target.value); setLeftPage(1); }}
                    disabled={!sourceBeatId || isTransferring}
                  />
                </div>
                <div className="flex-1 min-h-[260px] max-h-[340px] overflow-y-auto border rounded-md p-1 bg-background">
                  {loadingRetailers ? (
                    <div className="flex items-center justify-center h-32">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : !sourceBeatId ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Select a source beat to load retailers.</p>
                  ) : leftPageItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {available.length === 0 ? "No retailers found in this beat." : "No matches."}
                    </p>
                  ) : (
                    leftPageItems.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer text-sm">
                        <Checkbox
                          checked={leftChecked.has(r.id)}
                          onCheckedChange={() => toggleLeft(r.id)}
                          disabled={isTransferring}
                        />
                        <span className="flex-1 truncate">{r.name}</span>
                      </label>
                    ))
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Showing {leftStart} to {leftEnd} of {leftTotal}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2" disabled={leftPage <= 1} onClick={() => setLeftPage(leftPage - 1)}>Prev</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" disabled={leftEnd >= leftTotal} onClick={() => setLeftPage(leftPage + 1)}>Next</Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Middle */}
            <div className="flex md:flex-col flex-row justify-center items-center gap-2 md:py-4">
              <Button size="icon" variant="outline" onClick={moveRight} disabled={leftChecked.size === 0 || isTransferring} title="Move selected"><ChevronRight /></Button>
              <Button size="icon" variant="outline" onClick={moveAllRight} disabled={filteredLeft.length === 0 || isTransferring} title="Move all"><ChevronsRight /></Button>
              <Button size="icon" variant="outline" onClick={moveLeft} disabled={rightChecked.size === 0 || isTransferring} title="Return selected"><ChevronLeft /></Button>
              <Button size="icon" variant="outline" onClick={moveAllLeft} disabled={filteredRight.length === 0 || isTransferring} title="Return all"><ChevronsLeft /></Button>
            </div>

            {/* Right */}
            <div className="border rounded-md flex flex-col bg-card">
              <div className="px-3 py-2 border-b flex items-center justify-between">
                <h4 className="text-sm font-semibold">Selected for Transfer ({selected.length})</h4>
                <button
                  type="button"
                  onClick={clearAllSelected}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                  disabled={selected.length === 0 || isTransferring}
                >
                  Clear all
                </button>
              </div>
              <div className="p-3 space-y-2 flex-1 flex flex-col">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Search retailers"
                    value={rightSearch}
                    onChange={(e) => { setRightSearch(e.target.value); setRightPage(1); }}
                    disabled={isTransferring}
                  />
                </div>
                <div className="flex-1 min-h-[260px] max-h-[340px] overflow-y-auto border rounded-md p-1 bg-background">
                  {rightPageItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No retailers selected yet.</p>
                  ) : (
                    rightPageItems.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 text-sm">
                        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Checkbox
                          checked={rightChecked.has(r.id)}
                          onCheckedChange={() => toggleRight(r.id)}
                          disabled={isTransferring}
                          className="hidden"
                        />
                        <span className="flex-1 truncate cursor-pointer" onClick={() => toggleRight(r.id)}>{r.name}</span>
                        <button
                          type="button"
                          onClick={() => removeOne(r.id)}
                          className="text-muted-foreground hover:text-destructive"
                          disabled={isTransferring}
                          aria-label="Remove"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Showing {rightStart} to {rightEnd} of {rightTotal}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2" disabled={rightPage <= 1} onClick={() => setRightPage(rightPage - 1)}>Prev</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" disabled={rightEnd >= rightTotal} onClick={() => setRightPage(rightPage + 1)}>Next</Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {selected.length > 0 && sourceBeat && destBeat && !sameBeat && (
            <div className="flex items-center gap-2 text-sm rounded-md border border-primary/20 bg-primary/5 text-foreground px-3 py-2 mt-2">
              <Info className="h-4 w-4 text-primary" />
              <span>
                <strong>{selected.length}</strong> retailer{selected.length === 1 ? "" : "s"} will be moved from{" "}
                <strong>{sourceBeat.beat_name}</strong> to <strong>{destBeat.beat_name}</strong>.
              </span>
            </div>
          )}

          <DialogFooter className="flex-row gap-2 sm:justify-end pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isTransferring}>Cancel</Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={!canTransfer}>
              Transfer {selected.length} Retailer{selected.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={(o) => !isTransferring && setConfirmOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Transfer</DialogTitle>
            <DialogDescription>
              Are you sure you want to move <strong>{selected.length}</strong> retailer
              {selected.length === 1 ? "" : "s"} from <strong>{sourceBeat?.beat_name}</strong> to{" "}
              <strong>{destBeat?.beat_name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isTransferring}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={isTransferring}>
              {isTransferring ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Transferring…</>) : "Confirm Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BeatTransferModal;
