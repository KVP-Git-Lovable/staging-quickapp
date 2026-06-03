import { useEffect, useState } from "react";
import { format } from "date-fns";
import { History, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as beatService from "@/services/beatService";
import type { BeatHistory } from "@/services/beatService";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface BeatHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beat: { id: string; beat_id: string; beat_name: string };
}

function EmptyState() {
  return <div className="py-8 text-center text-sm text-muted-foreground">No history yet.</div>;
}

function fmt(dt?: string | null, withTime = false) {
  if (!dt) return "—";
  try {
    return format(new Date(dt), withTime ? "PP p" : "PP");
  } catch {
    return dt;
  }
}

export function BeatHistoryDrawer({ open, onOpenChange, beat }: BeatHistoryDrawerProps) {
  const { can, loading: permLoading } = usePermissions();
  const [history, setHistory] = useState<BeatHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (permLoading) return;
    if (!can("module_my_beats", "read")) {
      setDenied(true);
      setHistory(null);
      return;
    }
    setDenied(false);
    let cancelled = false;
    (async () => {
      setLoading(true);
      setHistory(null);
      try {
        const h = await beatService.getBeatHistory(beat.id);
        if (cancelled) return;
        setHistory(h);

        // Batch resolve all referenced user ids → names
        const ids = new Set<string>();
        h.ownership.forEach((r: any) => {
          if (r.transferred_by) ids.add(r.transferred_by);
          if (r.old_owner_id) ids.add(r.old_owner_id);
          if (r.new_owner_id) ids.add(r.new_owner_id);
        });
        h.retailerTransfers.forEach((r: any) => {
          if (r.transferred_by) ids.add(r.transferred_by);
        });
        h.coverage.forEach((r: any) => {
          if (r.coverage_user_id) ids.add(r.coverage_user_id);
          if (r.assigned_by) ids.add(r.assigned_by);
        });
        if (ids.size) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("user_id, full_name, name")
            .in("user_id", Array.from(ids));
          if (!cancelled) {
            const map: Record<string, string> = {};
            (profs ?? []).forEach((p: any) => {
              map[p.user_id] = p.full_name || p.name || "Unknown";
            });
            setProfileNames(map);
          }
        }
      } catch (err: any) {
        toast.error(err?.message || "Failed to load history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, beat.id, permLoading]);

  const nameOf = (id?: string | null) => (id ? profileNames[id] ?? id.slice(0, 8) : "—");
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History size={18} className="text-primary" />
            Beat History — {beat.beat_name}
          </SheetTitle>
          <SheetDescription>
            Full audit trail for this beat.
          </SheetDescription>
        </SheetHeader>

        {loading || !history ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="ownership" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="ownership">Ownership</TabsTrigger>
              <TabsTrigger value="retailers">Retailers</TabsTrigger>
              <TabsTrigger value="coverage">Coverage</TabsTrigger>
            </TabsList>

            <TabsContent value="ownership" className="space-y-2 mt-3">
              {history.ownership.length === 0 ? (
                <EmptyState />
              ) : (
                history.ownership.map((row: any) => (
                  <div key={row.id} className="rounded-md border p-3 text-sm space-y-1">
                    <div className="text-xs text-muted-foreground">
                      {fmt(row.transferred_at, true)}
                    </div>
                    <div className="font-medium">
                      {row.old_owner_name || nameOf(row.old_owner_id)}{" "}
                      <span className="text-muted-foreground">→</span>{" "}
                      {row.new_owner_name || nameOf(row.new_owner_id)}
                    </div>
                    {row.reason && (
                      <div className="text-xs text-muted-foreground">
                        Reason: {row.reason}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      By {nameOf(row.transferred_by)}
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="retailers" className="space-y-2 mt-3">
              {history.retailerTransfers.length === 0 ? (
                <EmptyState />
              ) : (
                history.retailerTransfers.map((row: any) => (
                  <div key={row.id} className="rounded-md border p-3 text-sm space-y-1">
                    <div className="font-medium">{row.retailer_name || "Retailer"}</div>
                    <div className="text-xs">
                      <span className="text-muted-foreground">{row.from_beat_name || "—"}</span>{" "}
                      <span className="text-muted-foreground">→</span>{" "}
                      <span className="text-muted-foreground">{row.to_beat_name || "—"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmt(row.transferred_at)} · By {nameOf(row.transferred_by)}
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="coverage" className="space-y-2 mt-3">
              {history.coverage.length === 0 ? (
                <EmptyState />
              ) : (
                history.coverage.map((row: any) => {
                  const active = row.is_active && (row.end_date ?? "") >= todayStr;
                  return (
                    <div key={row.id} className="rounded-md border p-3 text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{nameOf(row.coverage_user_id)}</div>
                        <Badge variant={active ? "default" : "secondary"}>
                          {active ? "Active" : "Ended"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {fmt(row.start_date)} → {fmt(row.end_date)}
                      </div>
                      {row.reason && (
                        <div className="text-xs text-muted-foreground">
                          Reason: {row.reason}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default BeatHistoryDrawer;
