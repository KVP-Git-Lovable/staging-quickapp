import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDownToLine, ArrowUpFromLine, TrendingUp, TrendingDown } from 'lucide-react';
import type { MovementSummary } from './useNetworkChildInventory';

interface Props {
  data: MovementSummary;
}

const MovementSummaryPanel = ({ data }: Props) => {
  const netPositive = data.net >= 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Movement (last {data.windowDays} days)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowDownToLine className="h-4 w-4 text-green-600" /> Inward
          </div>
          <span className="font-semibold text-green-700">{data.inward.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowUpFromLine className="h-4 w-4 text-purple-600" /> Outward
          </div>
          <span className="font-semibold text-purple-700">{data.outward.toLocaleString('en-IN')}</span>
        </div>
        <div className="border-t pt-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            {netPositive ? <TrendingUp className="h-4 w-4 text-green-600" /> : <TrendingDown className="h-4 w-4 text-red-600" />}
            Net Change
          </div>
          <span className={`font-bold ${netPositive ? 'text-green-700' : 'text-red-700'}`}>
            {netPositive ? '+' : ''}{data.net.toLocaleString('en-IN')}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default MovementSummaryPanel;
