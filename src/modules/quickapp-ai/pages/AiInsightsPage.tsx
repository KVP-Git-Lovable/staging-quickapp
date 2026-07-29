import { insightSeeds } from "../data/insightSeeds";
import { InsightCard } from "../components/InsightCard";

export default function AiInsightsPage() {
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold md:text-2xl">AI Insights</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Proactive, explainable recommendations generated from your field and sales data.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {insightSeeds.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Insight figures shown here are illustrative placeholders. Business calculations remain
        deterministic and will be sourced from your live data once wired.
      </p>
    </div>
  );
}
