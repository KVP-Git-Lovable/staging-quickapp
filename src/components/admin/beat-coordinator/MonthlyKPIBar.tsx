import { Card } from "@/components/ui/card";
import { Calendar, CheckCircle2, AlertCircle, TrendingUp, IndianRupee, Target } from "lucide-react";
import { useMonthlyBeatKPIs } from "@/hooks/useMonthlyBeatKPIs";
import { cn } from "@/lib/utils";

interface Props {
  repId: string | null;
  monthAnchor: Date;
}

export function MonthlyKPIBar({ repId, monthAnchor }: Props) {
  const { data, isLoading } = useMonthlyBeatKPIs(repId, monthAnchor);

  const cards = [
    { label: "Planned", value: data?.planned ?? 0, icon: Calendar, tone: "text-beat-assigned bg-beat-assigned/10" },
    { label: "Served", value: data?.served ?? 0, icon: CheckCircle2, tone: "text-beat-served bg-beat-served/10" },
    { label: "Missed", value: data?.missed ?? 0, icon: AlertCircle, tone: "text-beat-missed bg-beat-missed/10" },
    { label: "Coverage %", value: `${data?.coveragePct ?? 0}%`, icon: Target, tone: "text-beat-shared bg-beat-shared/10" },
    {
      label: "Order value",
      value: `₹${Math.round(data?.orderValue ?? 0).toLocaleString("en-IN")}`,
      icon: IndianRupee,
      tone: "text-emerald-600 bg-emerald-50",
    },
    { label: "Productive %", value: `${data?.productivePct ?? 0}%`, icon: TrendingUp, tone: "text-beat-partial bg-beat-partial/10" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className="p-2.5 flex items-center gap-2">
            <div className={cn("h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0", c.tone)}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{c.label}</div>
              <div className="text-sm font-semibold leading-tight truncate">
                {isLoading && !repId ? "—" : c.value}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
