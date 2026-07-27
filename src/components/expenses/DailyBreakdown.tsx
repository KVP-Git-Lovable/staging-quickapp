import React from 'react';
import { format, parseISO } from 'date-fns';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { DailyBreakdown as DailyBreakdownType } from '@/hooks/useMonthlyExpenseSummary';

interface DailyBreakdownProps {
  days: DailyBreakdownType[];
}

const DailyBreakdown: React.FC<DailyBreakdownProps> = ({ days }) => {
  const { format: fmt } = useCurrency();
  const activeDays = days.filter(d => d.total > 0 || d.isPresent || d.orderValue > 0);

  if (!activeDays.length) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">No expense data for this month.</p>
    );
  }

  return (
    <div className="space-y-1 animate-in slide-in-from-top-2 duration-200">
      <p className="text-xs font-medium text-muted-foreground px-1 mb-2">Daily Breakdown</p>
      <div className="rounded-lg border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-6 gap-1 text-[10px] font-semibold text-muted-foreground bg-muted/50 px-3 py-2">
          <span>Date</span>
          <span className="text-right">TA</span>
          <span className="text-right">DA</span>
          <span className="text-right">Add</span>
          <span className="text-right">Orders</span>
          <span className="text-right">Total</span>
        </div>
        {/* Rows */}
        {activeDays.map((day) => (
          <div
            key={day.date}
            className="grid grid-cols-6 gap-1 text-[11px] px-3 py-1.5 border-t border-border/50 hover:bg-muted/30 transition-colors"
          >
            <span className="font-medium text-foreground">
              {format(parseISO(day.date), 'dd MMM')}
              {!day.isPresent && <span className="text-muted-foreground ml-1">·</span>}
            </span>
            <span className="text-right text-blue-600">{day.ta > 0 ? (day.taKm > 0 ? `${fmt(day.ta)} (${Math.round(day.taKm)} km)` : fmt(day.ta)) : '–'}</span>
            <span className="text-right text-green-600">{day.da > 0 ? fmt(day.da) : '–'}</span>
            <span className="text-right text-purple-600">{day.additional > 0 ? fmt(day.additional) : '–'}</span>
            <span className="text-right text-orange-600">{day.orderValue > 0 ? fmt(day.orderValue) : '–'}</span>
            <span className="text-right font-semibold text-foreground">{day.total > 0 ? fmt(day.total) : '–'}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DailyBreakdown;
