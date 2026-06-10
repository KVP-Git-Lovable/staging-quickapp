import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useDayRetailerDetail } from "@/hooks/useDayRetailerDetail";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  repId: string | null;
  date: string;
  beatId: string | null;
  beatName?: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-beat-served/15 text-beat-served border-beat-served/30",
  pending: "bg-beat-stale/15 text-beat-stale border-beat-stale/30",
  skipped: "bg-muted text-muted-foreground border-border",
  not_visited: "bg-beat-missed/10 text-beat-missed border-beat-missed/30",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "Visited",
  pending: "Pending",
  skipped: "Skipped",
  not_visited: "Not visited",
};

export function BeatDayDetailDialog({ open, onClose, repId, date, beatId, beatName }: Props) {
  const { data: rows = [], isLoading } = useDayRetailerDetail({ repId, date, beatId });

  const visited = rows.filter((r) => r.visit_status === "completed").length;
  const totalOrders = rows.reduce((s, r) => s + r.order_count, 0);
  const totalValue = rows.reduce((s, r) => s + r.order_value, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {beatName || "Beat"} · {format(parseISO(date), "EEE d MMM")}
          </DialogTitle>
          <DialogDescription>
            {rows.length} retailers · {visited} visited · {totalOrders} orders · ₹
            {Math.round(totalValue).toLocaleString("en-IN")}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-sm text-muted-foreground text-center">No retailers in this beat.</div>
        ) : (
          <div className="border rounded-md divide-y">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 text-[11px] font-medium text-muted-foreground bg-muted/40">
              <span>Retailer</span>
              <span>Status</span>
              <span className="text-right">Order</span>
            </div>
            {rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 items-center text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {r.last_visit_date ? `Last visit ${r.last_visit_date}` : "Never visited"}
                  </div>
                </div>
                <Badge variant="outline" className={cn("text-[10px]", STATUS_STYLE[r.visit_status])}>
                  {STATUS_LABEL[r.visit_status]}
                </Badge>
                <div className="text-right text-xs">
                  {r.order_count > 0 ? (
                    <>
                      <div className="font-medium">₹{Math.round(r.order_value).toLocaleString("en-IN")}</div>
                      <div className="text-[10px] text-muted-foreground">{r.order_count} order{r.order_count > 1 ? "s" : ""}</div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
