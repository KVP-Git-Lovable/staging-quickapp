import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { fetchEventByRouteId } from "@/lib/eventLookup";
import CounterSales, { type EventContext } from "./CounterSales";

export default function EventOrders() {
  const { id } = useParams<{ id: string }>();
  const [ctx, setCtx] = useState<EventContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const data = await fetchEventByRouteId(
        id,
        "activity_name, event_name, activity_date, start_time, end_time, activity_place"
      );
      if (!data) { setLoading(false); return; }
      const a: any = data;
      const fmtTime = (iso?: string | null) =>
        iso
          ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "";
      const date = a.activity_date
        ? new Date(a.activity_date + "T00:00:00").toLocaleDateString([], {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "";
      const timeRange = [fmtTime(a.start_time), fmtTime(a.end_time)].filter(Boolean).join(" – ");
      const eventDate = [date, timeRange].filter(Boolean).join(", ");
      setCtx({
        // The EVENT's visit, not the route id — a rep opening their own visit
        // must still write orders onto the event.
        visitId: a.visit_id ?? id,
        eventName: a.event_name || a.activity_name || "Event",
        eventDate,
        location: a.activity_place || undefined,
      });
      setLoading(false);
    })();
  }, [id]);

  if (loading || !ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <CounterSales eventContext={ctx} />;
}