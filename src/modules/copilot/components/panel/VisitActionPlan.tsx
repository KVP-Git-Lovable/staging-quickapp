import ReactMarkdown from "react-markdown";
import { ClipboardList, Loader2, Sparkles, Store } from "lucide-react";
import { useTodaysVisitRetailers } from "../../hooks/useTodaysVisitRetailers";
import { useVisitActionPlan } from "../../hooks/useVisitActionPlan";

export function VisitActionPlan() {
  const { rows, loading } = useTodaysVisitRetailers();
  const { plan, loading: planLoading, error, generate } = useVisitActionPlan();

  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <ClipboardList className="h-3.5 w-3.5" />
        Today's Visit Retailers
        {!loading && rows.length > 0 && (
          <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] font-medium">{rows.length}</span>
        )}
      </div>

      {loading ? (
        <p className="text-[11px] text-muted-foreground">Loading today's visits…</p>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No visits planned for today.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-background/70 p-2">
              <div className="flex items-start gap-2">
                <Store className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{r.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {[r.beat, r.status, r.minutes ? `${r.minutes} min` : null].filter(Boolean).join(" · ") || "Planned"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <button
          type="button"
          onClick={() => void generate()}
          disabled={planLoading}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 py-2 text-xs font-semibold transition hover:bg-muted disabled:opacity-60"
        >
          {planLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {planLoading ? "Preparing your plan…" : "Get my action plan"}
        </button>
      )}

      {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}

      {plan && (
        <div className="prose prose-sm mt-2 max-w-none rounded-lg border border-border bg-background/80 p-2.5 text-[11px] leading-relaxed [&_h2]:text-xs [&_h3]:text-[11px] [&_li]:my-0 [&_p]:my-1 [&_ul]:my-1">
          <ReactMarkdown>{plan}</ReactMarkdown>
        </div>
      )}
    </section>
  );
}
