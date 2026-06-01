import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ChevronsRight, ChevronLeft, ChevronsLeft, Loader2, X, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Beat {
  beat_id: string;
  beat_name: string;
}

interface Retailer {
  id: string;
  name: string;
}

const PAGE_SIZE = 50;

export default function MassBeatTransfer() {
  const navigate = useNavigate();

  const [beats, setBeats] = useState<Beat[]>([]);
  const [loadingBeats, setLoadingBeats] = useState(true);

  const [sourceBeatId, setSourceBeatId] = useState<string>("");
  const [destBeatId, setDestBeatId] = useState<string>("");

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

  useEffect(() => {
    (async () => {
      setLoadingBeats(true);
      const { data, error } = await supabase
        .from("beats")
        .select("beat_id, beat_name")
        .eq("is_active", true)
        .order("beat_name", { ascending: true });
      if (error) toast.error(error.message);
      setBeats((data as Beat[]) || []);
      setLoadingBeats(false);
    })();
  }, []);

  useEffect(() => {
    if (!sourceBeatId) {
      setAvailable([]);
      setSelected([]);
      setLeftChecked(new Set());
      setRightChecked(new Set());
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
      setLeftChecked(new Set());
      setRightChecked(new Set());
      setLeftPage(1);
      setRightPage(1);
      setLoadingRetailers(false);
    })();
  }, [sourceBeatId]);

  const sourceBeat = beats.find((b) => b.beat_id === sourceBeatId);
  const destBeat = beats.find((b) => b.beat_id === destBeatId);
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

  const allLeftPageChecked = leftPageItems.length > 0 && leftPageItems.every((r) => leftChecked.has(r.id));
  const toggleSelectAllLeft = () => {
    const s = new Set(leftChecked);
    if (allLeftPageChecked) leftPageItems.forEach((r) => s.delete(r.id));
    else leftPageItems.forEach((r) => s.add(r.id));
    setLeftChecked(s);
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
    const s = new Set(rightChecked);
    s.delete(id);
    setRightChecked(s);
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
      setSelected([]);
      setRightChecked(new Set());

      const { data, error } = await supabase
        .from("retailers")
        .select("id, name")
        .eq("beat_id", sourceBeatId)
        .order("name", { ascending: true });
      if (error) throw error;
      setAvailable((data as Retailer[]) || []);
    } catch (e: any) {
      toast.error(e.message || "Transfer failed");
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mass Beat Transfer</h1>
        <p className="text-sm text-muted-foreground">
          Move multiple retailers from one beat to another in a single operation.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Source Beat</label>
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
            <label className="text-xs font-medium text-muted-foreground">Destination Beat</label>
            <Select value={destBeatId} onValueChange={setDestBeatId} disabled={loadingBeats || isTransferring}>
              <SelectTrigger>
                <SelectValue placeholder={loadingBeats ? "Loading beats..." : "Select destination beat"} />
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
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
        {/* Left card */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Retailers in {sourceBeat?.beat_name || "—"} ({available.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col space-y-3">
            <Input
              placeholder="Search retailers..."
              value={leftSearch}
              onChange={(e) => { setLeftSearch(e.target.value); setLeftPage(1); }}
              disabled={!sourceBeatId || isTransferring}
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allLeftPageChecked}
                onCheckedChange={toggleSelectAllLeft}
                disabled={leftPageItems.length === 0 || isTransferring}
              />
              <span>Select All (this page)</span>
            </label>
            <div className="flex-1 min-h-[280px] max-h-[420px] overflow-y-auto border rounded-md p-2 space-y-1 bg-background">
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
                  <label key={r.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/40 cursor-pointer text-sm">
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
                <Button size="sm" variant="outline" disabled={leftPage <= 1} onClick={() => setLeftPage(leftPage - 1)}>Prev</Button>
                <Button size="sm" variant="outline" disabled={leftEnd >= leftTotal} onClick={() => setLeftPage(leftPage + 1)}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Middle move buttons */}
        <div className="flex md:flex-col flex-row justify-center items-center gap-2">
          <Button size="icon" variant="outline" onClick={moveRight} disabled={leftChecked.size === 0 || isTransferring} title="Move selected">
            <ChevronRight />
          </Button>
          <Button size="icon" variant="outline" onClick={moveAllRight} disabled={filteredLeft.length === 0 || isTransferring} title="Move all">
            <ChevronsRight />
          </Button>
          <Button size="icon" variant="outline" onClick={moveLeft} disabled={rightChecked.size === 0 || isTransferring} title="Remove selected">
            <ChevronLeft />
          </Button>
          <Button size="icon" variant="outline" onClick={moveAllLeft} disabled={filteredRight.length === 0 || isTransferring} title="Remove all">
            <ChevronsLeft />
          </Button>
        </div>

        {/* Right card */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Selected for Transfer ({selected.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col space-y-3">
            <Input
              placeholder="Search selected..."
              value={rightSearch}
              onChange={(e) => { setRightSearch(e.target.value); setRightPage(1); }}
              disabled={isTransferring}
            />
            <div className="h-[34px]" />
            <div className="flex-1 min-h-[280px] max-h-[420px] overflow-y-auto border rounded-md p-2 space-y-1 bg-background">
              {rightPageItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No retailers selected yet.</p>
              ) : (
                rightPageItems.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/40 text-sm">
                    <Checkbox
                      checked={rightChecked.has(r.id)}
                      onCheckedChange={() => toggleRight(r.id)}
                      disabled={isTransferring}
                    />
                    <span className="flex-1 truncate">{r.name}</span>
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
                <Button size="sm" variant="outline" disabled={rightPage <= 1} onClick={() => setRightPage(rightPage - 1)}>Prev</Button>
                <Button size="sm" variant="outline" disabled={rightEnd >= rightTotal} onClick={() => setRightPage(rightPage + 1)}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {selected.length > 0 && sourceBeat && destBeat && !sameBeat && (
        <div className="flex items-center gap-2 text-sm rounded-md border border-primary/20 bg-primary/5 text-foreground px-3 py-2">
          <Info className="h-4 w-4 text-primary" />
          <span>
            <strong>{selected.length}</strong> retailer{selected.length === 1 ? "" : "s"} will be moved from{" "}
            <strong>{sourceBeat.beat_name}</strong> to <strong>{destBeat.beat_name}</strong>.
          </span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate(-1)} disabled={isTransferring}>Cancel</Button>
        <Button onClick={() => setConfirmOpen(true)} disabled={!canTransfer}>
          Transfer {selected.length} Retailer{selected.length === 1 ? "" : "s"}
        </Button>
      </div>

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
              {isTransferring ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" />Transferring...</>) : "Confirm Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
