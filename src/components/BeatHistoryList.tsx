import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRetailerBeatHistory } from "@/hooks/useRetailerBeatHistory";
import { format } from "date-fns";

interface Props {
  retailerId?: string;
  beatId?: string;
  emptyLabel?: string;
}

const fmt = (v: string | null) => (v ? format(new Date(v), "dd MMM yyyy, HH:mm") : "Current");

/**
 * Renders retailer_beat_assignments history. Pass `retailerId` for a retailer's
 * beat history, or `beatId` for all retailers ever assigned to a beat.
 */
export const BeatHistoryList = ({ retailerId, beatId, emptyLabel }: Props) => {
  const { rows, loading } = useRetailerBeatHistory({ retailerId, beatId });

  if (loading) return <div className="text-sm text-muted-foreground p-4">Loading history…</div>;
  if (rows.length === 0)
    return (
      <div className="text-sm text-muted-foreground p-4 border rounded-md">
        {emptyLabel || "No assignment history yet."}
      </div>
    );

  const isRetailerView = !!retailerId;

  return (
    <div className="border rounded-md overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{isRetailerView ? "Beat" : "Retailer"}</TableHead>
            <TableHead>Assigned From</TableHead>
            <TableHead>Assigned To</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">
                {isRetailerView ? r.beat_name || r.beat_id : r.retailer_id.slice(0, 8)}
              </TableCell>
              <TableCell className="text-sm">{fmt(r.assigned_from)}</TableCell>
              <TableCell className="text-sm">{fmt(r.assigned_to)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {r.transfer_reason || "—"}
              </TableCell>
              <TableCell>
                {r.is_current ? (
                  <Badge>Current</Badge>
                ) : (
                  <Badge variant="secondary">Closed</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
