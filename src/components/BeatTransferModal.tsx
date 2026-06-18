import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ChevronsRight, ChevronLeft, ChevronsLeft, Loader2, Search, ArrowRightLeft } from "lucide-react";
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
  beat_id: string;
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

type Side = "A" | "B";
const PAGE_SIZE = 50;
const UNASSIGNED_ID = "__unassigned__";
const UNASSIGNED_BEAT: Beat = { id: UNASSIGNED_ID, beat_id: "", beat_name: "Unassigned" };
const isUnassigned = (b: Beat | undefined) => !!b && b.id === UNASSIGNED_ID;
const sortByName = (xs: Retailer[]) => [...xs].sort((a, b) => a.name.localeCompare(b.name));

export const BeatTransferModal = ({ open, onOpenChange, onSuccess }: Props) => {
  const [beats, setBeats] = useState<Beat[]>([]);
  const [ownableBeatIds, setOwnableBeatIds] = useState<Set<string>>(new Set());
  const [loadingBeats, setLoadingBeats] = useState(false);

  const [beatAId, setBeatAId] = useState("");
  const [beatBId, setBeatBId] = useState("");

  const [panelA, setPanelA] = useState<Retailer[]>([]);
  const [panelB, setPanelB] = useState<Retailer[]>([]);
  const [originalA, setOriginalA] = useState<Set<string>>(new Set());
  const [originalB, setOriginalB] = useState<Set<string>>(new Set());
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [checkedA, setCheckedA] = useState<Set<string>>(new Set());
  const [checkedB, setCheckedB] = useState<Set<string>>(new Set());
  const [pageA, setPageA] = useState(1);
  const [pageB, setPageB] = useState(1);

  const [dragOverSide, setDragOverSide] = useState<Side | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const beatA = beatAId === UNASSIGNED_ID ? UNASSIGNED_BEAT : beats.find((b) => b.id === beatAId);
  const beatB = beatBId === UNASSIGNED_ID ? UNASSIGNED_BEAT : beats.find((b) => b.id === beatBId);
  const sameBeat = !!beatAId && !!beatBId && beatAId === beatBId;

  // Reset when closing
  useEffect(() => {
    if (!open) {
      setBeatAId(""); setBeatBId("");
      setPanelA([]); setPanelB([]);
      setOriginalA(new Set()); setOriginalB(new Set());
      setSearchA(""); setSearchB("");
      setCheckedA(new Set()); setCheckedB(new Set());
      setPageA(1); setPageB(1);
      setConfirmOpen(false);
      setOwnableBeatIds(new Set());
    }
  }, [open]);

  // Load beats on open — scoped to current user (owned + CO_OWNER/OPERATIONAL access)
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoadingBeats(true);
      try {
        const { data: userRes, error: authErr } = await supabase.auth.getUser();
        if (authErr || !userRes?.user) {
          toast.error("Not authenticated");
          setBeats([]);
          setOwnableBeatIds(new Set());
          return;
        }
        const userId = userRes.user.id;
        const nowIso = new Date().toISOString();

        const [ownedRes, accessRes] = await Promise.all([
          supabase
            .from("beats")
            .select("id, beat_id, beat_name")
            .eq("is_active", true)
            .eq("user_id", userId)
            .order("beat_name", { ascending: true }),
          supabase
            .from("beat_user_access")
            .select("beat_id, access_type, effective_to, beats!beat_user_access_beat_id_fkey(id, beat_id, beat_name, is_active)")
            .eq("user_id", userId)
            .eq("is_active", true)
            .in("access_type", ["CO_OWNER", "OPERATIONAL"])
            .or(`effective_to.is.null,effective_to.gt.${nowIso}`),
        ]);

        if (ownedRes.error) toast.error(ownedRes.error.message);
        if (accessRes.error) toast.error(accessRes.error.message);

        const ownedBeats = (ownedRes.data || []) as Beat[];
        const sharedBeats = ((accessRes.data || []) as any[])
          .map((r) => r.beats)
          .filter((b: any) => b && b.is_active)
          .map((b: any) => ({ id: b.id, beat_id: b.beat_id, beat_name: b.beat_name })) as Beat[];

        const merged: Beat[] = [...ownedBeats];
        for (const b of sharedBeats) {
          if (!merged.some((x) => x.beat_id === b.beat_id)) merged.push(b);
        }
        merged.sort((a, b) => a.beat_name.localeCompare(b.beat_name));

        setBeats(merged);
        setOwnableBeatIds(new Set(ownedBeats.map((b) => b.beat_id)));
      } finally {
        setLoadingBeats(false);
      }
    })();
  }, [open]);

  const loadSide = async (side: Side, beat: Beat | undefined) => {
    if (!beat) {
      if (side === "A") { setPanelA([]); setOriginalA(new Set()); }
      else { setPanelB([]); setOriginalB(new Set()); }
      return;
    }
    side === "A" ? setLoadingA(true) : setLoadingB(true);
    let query = supabase.from("retailers").select("id, name, beat_id");
    if (isUnassigned(beat)) {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      query = query.or("beat_id.is.null,beat_id.eq.");
      if (uid) query = query.eq("user_id", uid);
    } else {
      query = query.eq("beat_id", beat.beat_id);
    }
    const { data, error } = await query.order("name", { ascending: true });
    if (error) toast.error(error.message);
    const rows = ((data as Retailer[]) || []).map((r) => ({ id: r.id, name: r.name }));
    const ids = new Set(rows.map((r) => r.id));
    if (side === "A") { setPanelA(rows); setOriginalA(ids); setLoadingA(false); }
    else { setPanelB(rows); setOriginalB(ids); setLoadingB(false); }
  };

  // Reload both sides whenever either beat changes — clears pending moves
  useEffect(() => {
    if (!open || sameBeat) return;
    setCheckedA(new Set()); setCheckedB(new Set());
    setPageA(1); setPageB(1);
    loadSide("A", beatA);
    loadSide("B", beatB);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatAId, beatBId, open]);

  const filteredA = useMemo(
    () => panelA.filter((r) => r.name.toLowerCase().includes(searchA.toLowerCase())),
    [panelA, searchA],
  );
  const filteredB = useMemo(
    () => panelB.filter((r) => r.name.toLowerCase().includes(searchB.toLowerCase())),
    [panelB, searchB],
  );

  const aTotal = filteredA.length;
  const bTotal = filteredB.length;
  const aStart = aTotal === 0 ? 0 : (pageA - 1) * PAGE_SIZE + 1;
  const aEnd = Math.min(pageA * PAGE_SIZE, aTotal);
  const bStart = bTotal === 0 ? 0 : (pageB - 1) * PAGE_SIZE + 1;
  const bEnd = Math.min(pageB * PAGE_SIZE, bTotal);
  const aPageItems = filteredA.slice(aStart === 0 ? 0 : aStart - 1, aEnd);
  const bPageItems = filteredB.slice(bStart === 0 ? 0 : bStart - 1, bEnd);

  const toggleCheck = (side: Side, id: string) => {
    if (side === "A") {
      const s = new Set(checkedA); s.has(id) ? s.delete(id) : s.add(id); setCheckedA(s);
    } else {
      const s = new Set(checkedB); s.has(id) ? s.delete(id) : s.add(id); setCheckedB(s);
    }
  };
  const toggleSelectAll = (side: Side) => {
    if (side === "A") {
      const ids = filteredA.map((r) => r.id);
      const all = ids.every((id) => checkedA.has(id));
      const s = new Set(checkedA);
      if (all) ids.forEach((id) => s.delete(id)); else ids.forEach((id) => s.add(id));
      setCheckedA(s);
    } else {
      const ids = filteredB.map((r) => r.id);
      const all = ids.every((id) => checkedB.has(id));
      const s = new Set(checkedB);
      if (all) ids.forEach((id) => s.delete(id)); else ids.forEach((id) => s.add(id));
      setCheckedB(s);
    }
  };

  const moveIds = (from: Side, to: Side, ids: string[]) => {
    if (from === to || ids.length === 0) return;
    const idSet = new Set(ids);
    if (from === "A") {
      const moving = panelA.filter((r) => idSet.has(r.id));
      setPanelA(panelA.filter((r) => !idSet.has(r.id)));
      setPanelB(sortByName([...panelB, ...moving]));
      const c = new Set(checkedA); ids.forEach((id) => c.delete(id)); setCheckedA(c);
    } else {
      const moving = panelB.filter((r) => idSet.has(r.id));
      setPanelB(panelB.filter((r) => !idSet.has(r.id)));
      setPanelA(sortByName([...panelA, ...moving]));
      const c = new Set(checkedB); ids.forEach((id) => c.delete(id)); setCheckedB(c);
    }
  };

  const movedToB = useMemo(() => panelB.filter((r) => originalA.has(r.id)), [panelB, originalA]);
  const movedToA = useMemo(() => panelA.filter((r) => originalB.has(r.id)), [panelA, originalB]);
  const totalMoves = movedToA.length + movedToB.length;

  const canConfirm = !!beatAId && !!beatBId && !sameBeat && totalMoves > 0 && !isSaving;

  // Drag handlers
  const onDragStart = (e: React.DragEvent, side: Side, id: string) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ side, id }));
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: React.DragEvent, side: Side) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverSide !== side) setDragOverSide(side);
  };
  const onDragLeave = (side: Side) => {
    if (dragOverSide === side) setDragOverSide(null);
  };
  const onDrop = (e: React.DragEvent, target: Side) => {
    e.preventDefault();
    setDragOverSide(null);
    try {
      const { side, id } = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (side && id && side !== target) moveIds(side, target, [id]);
    } catch { /* ignore */ }
  };

  const handleConfirm = async () => {
    if (!canConfirm || !beatA || !beatB) return;
    const aOk = isUnassigned(beatA) || ownableBeatIds.has(beatA.beat_id);
    const bOk = isUnassigned(beatB) || ownableBeatIds.has(beatB.beat_id);
    if (!aOk || !bOk) {
      toast.error("You can only move retailers between beats you own");
      return;
    }
    setIsSaving(true);
    try {
      const { data: userData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !userData.user) throw new Error("Not authenticated");
      const userId = userData.user.id;
      const nowIso = new Date().toISOString();

      const payloadFor = (target: Beat) =>
        isUnassigned(target)
          ? { beat_id: null, beat_name: null, updated_at: nowIso }
          : { beat_id: target.beat_id, beat_name: target.beat_name, updated_at: nowIso };

      if (movedToB.length > 0) {
        const { error } = await supabase
          .from("retailers")
          .update(payloadFor(beatB))
          .in("id", movedToB.map((r) => r.id));
        if (error) throw error;
      }
      if (movedToA.length > 0) {
        const { error } = await supabase
          .from("retailers")
          .update(payloadFor(beatA))
          .in("id", movedToA.map((r) => r.id));
        if (error) throw error;
      }

      const historyRows = [
        ...movedToB.map((r) => ({
          retailer_id: r.id, retailer_name: r.name,
          from_beat_id: isUnassigned(beatA) ? null : beatA.beat_id,
          from_beat_name: beatA.beat_name,
          to_beat_id: isUnassigned(beatB) ? null : beatB.beat_id,
          to_beat_name: beatB.beat_name,
          transferred_by: userId,
        })),
        ...movedToA.map((r) => ({
          retailer_id: r.id, retailer_name: r.name,
          from_beat_id: isUnassigned(beatB) ? null : beatB.beat_id,
          from_beat_name: beatB.beat_name,
          to_beat_id: isUnassigned(beatA) ? null : beatA.beat_id,
          to_beat_name: beatA.beat_name,
          transferred_by: userId,
        })),
      ];
      if (historyRows.length > 0) {
        const { error: histErr } = await supabase
          .from("retailer_beat_transfer_history")
          .insert(historyRows);
        if (histErr) throw histErr;
      }

      const x = movedToB.length, y = movedToA.length;
      toast.success(`Exchange complete. ${x} retailers moved to ${beatB.beat_name}, ${y} moved to ${beatA.beat_name}.`);
      setConfirmOpen(false);
      // Reload both panels
      setCheckedA(new Set()); setCheckedB(new Set());
      setPageA(1); setPageB(1);
      await Promise.all([loadSide("A", beatA), loadSide("B", beatB)]);
      onSuccess?.();
    } catch (e: any) {
      toast.error(e.message || "Exchange failed");
    } finally {
      setIsSaving(false);
    }
  };

  const renderPanel = (side: Side) => {
    const beat = side === "A" ? beatA : beatB;
    const panel = side === "A" ? panelA : panelB;
    const loading = side === "A" ? loadingA : loadingB;
    const search = side === "A" ? searchA : searchB;
    const setSearch = side === "A" ? setSearchA : setSearchB;
    const setPage = side === "A" ? setPageA : setPageB;
    const filtered = side === "A" ? filteredA : filteredB;
    const pageItems = side === "A" ? aPageItems : bPageItems;
    const checked = side === "A" ? checkedA : checkedB;
    const start = side === "A" ? aStart : bStart;
    const end = side === "A" ? aEnd : bEnd;
    const total = side === "A" ? aTotal : bTotal;
    const page = side === "A" ? pageA : pageB;
    const beatId = side === "A" ? beatAId : beatBId;
    const allFilteredChecked = filtered.length > 0 && filtered.every((r) => checked.has(r.id));

    return (
      <div
        className={`border rounded-md flex flex-col bg-card transition-colors ${dragOverSide === side ? "ring-2 ring-primary border-primary bg-primary/5" : ""}`}
        onDragOver={(e) => onDragOver(e, side)}
        onDragLeave={() => onDragLeave(side)}
        onDrop={(e) => onDrop(e, side)}
      >
        <div className="px-3 py-2 border-b">
          <h4 className="text-sm font-semibold">
            Retailers in {beat?.beat_name || "—"} ({panel.length})
          </h4>
        </div>
        <div className="p-3 space-y-2 flex-1 flex flex-col">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search retailers"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              disabled={!beatId || isSaving}
            />
          </div>
          {beatId && filtered.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <Checkbox
                checked={allFilteredChecked}
                onCheckedChange={() => toggleSelectAll(side)}
                disabled={isSaving}
              />
              <span>Select all ({filtered.length})</span>
            </label>
          )}
          <div className="flex-1 min-h-[260px] max-h-[340px] overflow-y-auto border rounded-md p-1 bg-background">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !beatId ? (
              <p className="text-sm text-muted-foreground text-center py-8">Select a beat.</p>
            ) : pageItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {panel.length === 0 ? "No retailers in this beat." : "No matches."}
              </p>
            ) : (
              pageItems.map((r) => (
                <div
                  key={r.id}
                  draggable={!isSaving}
                  onDragStart={(e) => onDragStart(e, side, r.id)}
                  className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-grab active:cursor-grabbing text-sm"
                >
                  <Checkbox
                    checked={checked.has(r.id)}
                    onCheckedChange={() => toggleCheck(side, r.id)}
                    disabled={isSaving}
                  />
                  <span className="flex-1 truncate">{r.name}</span>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Showing {start} to {end} of {total}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" disabled={end >= total} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const x = movedToB.length, y = movedToA.length;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !isSaving && onOpenChange(o)}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-primary" />
              Beat Exchange
            </DialogTitle>
            <DialogDescription>
              Pick two beats and freely move retailers between them. Nothing is saved until you confirm.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Beat A</label>
              <Select value={beatAId} onValueChange={setBeatAId} disabled={loadingBeats || isSaving}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingBeats ? "Loading beats..." : "Select Beat A"} />
                </SelectTrigger>
                <SelectContent>
                  {beatBId !== UNASSIGNED_ID && (
                    <SelectItem value={UNASSIGNED_ID}>Unassigned Retailers</SelectItem>
                  )}
                  {beats.filter((b) => b.id !== beatBId).map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.beat_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Beat B</label>
              <Select value={beatBId} onValueChange={setBeatBId} disabled={loadingBeats || isSaving}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingBeats ? "Loading beats..." : "Select Beat B"} />
                </SelectTrigger>
                <SelectContent>
                  {beatAId !== UNASSIGNED_ID && (
                    <SelectItem value={UNASSIGNED_ID}>Unassigned Retailers</SelectItem>
                  )}
                  {beats.filter((b) => b.id !== beatAId).map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.beat_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={beatBId} onValueChange={setBeatBId} disabled={loadingBeats || isSaving}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingBeats ? "Loading beats..." : "Select Beat B"} />
                </SelectTrigger>
                <SelectContent>
                  {beats.filter((b) => b.id !== beatAId).map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.beat_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sameBeat && (
                <p className="text-xs text-destructive">Beat A and Beat B cannot be the same.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-stretch mt-2">
            {renderPanel("A")}
            <div className="flex md:flex-col flex-row justify-center items-center gap-2 md:py-4">
              <Button size="icon" variant="outline" onClick={() => moveIds("A","B",[...checkedA])} disabled={checkedA.size === 0 || isSaving} title="Move checked to B"><ChevronRight /></Button>
              <Button size="icon" variant="outline" onClick={() => moveIds("A","B", filteredA.map((r) => r.id))} disabled={filteredA.length === 0 || isSaving} title="Move all to B"><ChevronsRight /></Button>
              <Button size="icon" variant="outline" onClick={() => moveIds("B","A",[...checkedB])} disabled={checkedB.size === 0 || isSaving} title="Move checked to A"><ChevronLeft /></Button>
              <Button size="icon" variant="outline" onClick={() => moveIds("B","A", filteredB.map((r) => r.id))} disabled={filteredB.length === 0 || isSaving} title="Move all to A"><ChevronsLeft /></Button>
            </div>
            {renderPanel("B")}
          </div>

          {totalMoves > 0 && beatA && beatB && (
            <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <strong>{x}</strong> retailer{x === 1 ? "" : "s"} will move to <strong>{beatB.beat_name}</strong>,{" "}
              <strong>{y}</strong> retailer{y === 1 ? "" : "s"} will move to <strong>{beatA.beat_name}</strong>.
            </div>
          )}

          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={!canConfirm}>
              Confirm Exchange
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={(o) => !isSaving && setConfirmOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Beat Exchange</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1 pt-1 text-sm text-foreground">
                <div><strong>{x}</strong> retailer{x === 1 ? "" : "s"} will be moved to <strong>{beatB?.beat_name}</strong>.</div>
                <div><strong>{y}</strong> retailer{y === 1 ? "" : "s"} will be moved to <strong>{beatA?.beat_name}</strong>.</div>
                <div className="text-muted-foreground pt-2">This action cannot be undone.</div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={isSaving}>
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Confirm Exchange"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
