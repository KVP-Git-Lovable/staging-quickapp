import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { format, parseISO } from 'date-fns';
import { ShoppingCart } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { WeeklyBreakdown as WeeklyBreakdownType } from '@/hooks/useMonthlyExpenseSummary';

interface WeeklyBreakdownProps {
  weeks: WeeklyBreakdownType[];
}

const WeeklyBreakdown: React.FC<WeeklyBreakdownProps> = ({ weeks }) => {
  const { format: fmt } = useCurrency();
  if (!weeks.length) return null;

  return (
    <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
      <p className="text-xs font-medium text-muted-foreground px-1">Weekly Breakdown</p>
      {weeks.map((week) => (
        <Card key={week.weekNumber} className="border-dashed">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold">{week.weekLabel}</span>
              <span className="text-xs text-muted-foreground">
                {format(parseISO(week.startDate), 'dd MMM')} – {format(parseISO(week.endDate), 'dd MMM')}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] flex-wrap">
              <span className="text-blue-600">TA: {fmt(week.ta)}{week.taKm > 0 ? ` (${Math.round(week.taKm)} km)` : ''}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-green-600">DA: {fmt(week.da)}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-purple-600">Add: {fmt(week.additional)}</span>
              <span className="ml-auto font-semibold text-foreground">{fmt(week.total)}</span>
            </div>
            {(week.orderValue > 0 || week.orderCount > 0) && (
              <div className="flex items-center gap-1.5 text-[11px] mt-1.5 pt-1.5 border-t border-border/50">
                <ShoppingCart className="h-3 w-3 text-orange-600" />
                <span className="text-orange-600 font-medium">
                  {week.orderCount} order{week.orderCount !== 1 ? 's' : ''} · {fmt(week.orderValue)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default WeeklyBreakdown;
