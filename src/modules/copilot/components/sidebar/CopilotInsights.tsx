import { useState } from "react";
import { ArrowUpRight, Award, Sparkles, Store, Trophy, Users } from "lucide-react";
import { useCopilotInsights } from "../../hooks/useCopilotInsights";

function money(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function CopilotInsights() {
  const { topRetailers, topUser, topVisit, loading } = useCopilotInsights();
  const [showVisit, setShowVisit] = useState(false);

  return (
    <section className="border-t border-primary-foreground/10 px-3 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-primary-foreground/65">
        <Sparkles className="h-3.5 w-3.5 text-warning" />
        AI Insights
      </div>

      <div className="space-y-2">
        <div className="copilot-insight-card p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-primary-foreground/70">
            <Store className="h-3.5 w-3.5 text-warning" /> Best retailers · FY
          </div>
          {loading ? (
            <p className="text-xs text-primary-foreground/50">Calculating performance…</p>
          ) : topRetailers.length ? (
            <div className="space-y-1.5">
              {topRetailers.map((retailer, index) => (
                <div key={retailer.id} className="flex items-center gap-2 text-xs">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning/15 font-semibold text-warning">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-primary-foreground">{retailer.name}</span>
                  <span className="shrink-0 font-medium text-primary-foreground/75">{money(retailer.orderValue)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-primary-foreground/50">No FY order activity yet.</p>
          )}
        </div>

        <div className="copilot-insight-card flex items-start gap-2 p-2.5">
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="text-[11px] text-primary-foreground/60">Top orders · quarter</p>
            <p className="truncate text-xs font-medium text-primary-foreground">
              {loading ? "Reviewing the team…" : topUser ? topUser.name : "No order activity yet"}
            </p>
            {topUser && (
              <p className="text-[11px] text-primary-foreground/55">
                {topUser.orderCount} orders · {money(topUser.orderValue)}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowVisit((current) => !current)}
          className="copilot-question-card group w-full p-2.5 text-left"
          aria-expanded={showVisit}
        >
          <div className="flex items-start gap-2">
            <Trophy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium leading-snug text-primary-foreground">
                Want me to pull up your top productive visit?
              </p>
              <p className="mt-0.5 text-[11px] text-primary-foreground/55">Highest orders this year</p>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-primary-foreground/45 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </div>

          {showVisit && (
            <div className="mt-2 border-t border-primary-foreground/10 pt-2">
              {loading ? (
                <p className="text-[11px] text-primary-foreground/60">Checking your visits…</p>
              ) : topVisit ? (
                <div className="flex gap-2">
                  <Award className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-primary-foreground">{topVisit.retailerName}</p>
                    <p className="text-[11px] text-primary-foreground/60">
                      {topVisit.date} · {topVisit.orderCount} order{topVisit.orderCount === 1 ? "" : "s"} · {money(topVisit.orderValue)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-primary-foreground/60">No order-linked visits found this year.</p>
              )}
            </div>
          )}
        </button>
      </div>
    </section>
  );
}