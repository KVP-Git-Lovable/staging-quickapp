import { useState } from "react";
import { LifeBuoy, Smartphone, ShoppingCart, Store, Route } from "lucide-react";
import { OrdersChart } from "./OrdersChart";
import { TicketStubDialog } from "./TicketStubDialog";
import { VisitActionPlan } from "./VisitActionPlan";


interface Category {
  key: string;
  en: string;
  hi: string;
  icon: React.ComponentType<{ className?: string }>;
  cls: string;
}

const CATEGORIES: Category[] = [
  { key: "app", en: "App Issues", hi: "ऐप समस्या", icon: Smartphone, cls: "bg-pink-100 text-pink-900 hover:bg-pink-200 border-pink-200" },
  { key: "order", en: "Not able to place order", hi: "ऑर्डर नहीं कर पा रहे", icon: ShoppingCart, cls: "bg-sky-100 text-sky-900 hover:bg-sky-200 border-sky-200" },
  { key: "retailer", en: "Cannot create Retailer", hi: "रिटेलर नहीं बन रहा", icon: Store, cls: "bg-amber-100 text-amber-900 hover:bg-amber-200 border-amber-200" },
  { key: "beat", en: "Issues with Beat", hi: "बीट में समस्या", icon: Route, cls: "bg-violet-100 text-violet-900 hover:bg-violet-200 border-violet-200" },
];

export function CopilotUtilityPanel() {
  const [active, setActive] = useState<Category | null>(null);

  return (
    <aside className="hidden lg:flex h-full w-[280px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-muted/40 p-3">
      <section>
        <OrdersChart />
      </section>

      <section>
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <LifeBuoy className="h-3.5 w-3.5" />
          Ticket Assistant
        </div>
        <div className="space-y-2">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setActive(c)}
                className={`w-full rounded-lg border p-2.5 text-left transition ${c.cls}`}
              >
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-tight">{c.en}</p>
                    <p className="text-[11px] opacity-80">{c.hi}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground/80">Tickets are for demo only.</p>
      </section>

      <VisitActionPlan />


      <TicketStubDialog open={!!active} onOpenChange={(o) => !o && setActive(null)} category={active} />
    </aside>
  );
}
