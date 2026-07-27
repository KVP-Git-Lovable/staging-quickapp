import { TrendingUp, DollarSign, Trophy, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrency } from "@/contexts/CurrencyContext";

interface PerformanceSnapshotProps {
  performance: {
    visitsCount: number;
    salesAmount: number;
    pointsEarned: number;
    leaderboardPosition: number | null;
    dailyProgress: number;
  };
}

export const PerformanceSnapshot = ({ performance }: PerformanceSnapshotProps) => {
  const { format, displayCurrency } = useCurrency();

  const formatAmount = (amount: number) => {
    if (displayCurrency !== 'INR') return format(amount);
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    return format(amount);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Today's Performance</h2>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Target className="h-3 w-3" />
          <span>{performance.dailyProgress}% of target</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-200/50">
          <CardContent className="p-3 text-center">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center mx-auto mb-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </div>
            <div className="text-lg font-bold text-blue-600">{performance.visitsCount}</div>
            <div className="text-[10px] text-muted-foreground">Visits</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-200/50">
          <CardContent className="p-3 text-center">
            <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center mx-auto mb-2">
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
            <div className="text-lg font-bold text-green-600">{formatAmount(performance.salesAmount)}</div>
            <div className="text-[10px] text-muted-foreground">Sales</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-200/50">
          <CardContent className="p-3 text-center">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center mx-auto mb-2">
              <Trophy className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-lg font-bold text-amber-600">+{performance.pointsEarned}</div>
            <div className="text-[10px] text-muted-foreground">Points</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
