import React, { useState } from 'react';
import { Car, Utensils, Receipt, IndianRupee, ShoppingCart, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrency } from '@/contexts/CurrencyContext';

interface ExpenseSummaryCardsProps {
  ta: number;
  da: number;
  additional: number;
  total: number;
  presentDays: number;
  loading: boolean;
  onTotalClick: () => void;
  isExpanded: boolean;
  orderValue?: number;
  totalKm?: number;
}

const ExpenseSummaryCards: React.FC<ExpenseSummaryCardsProps> = ({
  ta, da, additional, total, presentDays, loading, onTotalClick, isExpanded, orderValue = 0, totalKm = 0
}) => {
  const [compact, setCompact] = useState(false);
  const { format: fmt } = useCurrency();

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  const compactItems = [
    { label: 'TA', value: totalKm > 0 ? `${fmt(ta)} · ${Math.round(totalKm)} km` : fmt(ta), color: 'text-blue-600 dark:text-blue-400' },
    { label: 'DA', value: fmt(da), color: 'text-green-600 dark:text-green-400' },
    { label: 'Add', value: fmt(additional), color: 'text-purple-600 dark:text-purple-400' },
    { label: 'Total', value: fmt(total), color: 'text-primary font-bold', clickable: true },
    { label: 'Orders', value: fmt(orderValue), color: 'text-orange-600 dark:text-orange-400' },
  ];

  const cards = [
    {
      label: totalKm > 0 ? `Travel (TA) · ${Math.round(totalKm)} km` : 'Travel (TA)',
      value: fmt(ta),
      icon: Car,
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      border: 'border-blue-200 dark:border-blue-800',
      iconColor: 'text-blue-600',
      valueColor: 'text-blue-700 dark:text-blue-400',
    },
    {
      label: `Daily (DA) · ${presentDays}d`,
      value: fmt(da),
      icon: Utensils,
      bg: 'bg-green-50 dark:bg-green-950/30',
      border: 'border-green-200 dark:border-green-800',
      iconColor: 'text-green-600',
      valueColor: 'text-green-700 dark:text-green-400',
    },
    {
      label: 'Additional',
      value: fmt(additional),
      icon: Receipt,
      bg: 'bg-purple-50 dark:bg-purple-950/30',
      border: 'border-purple-200 dark:border-purple-800',
      iconColor: 'text-purple-600',
      valueColor: 'text-purple-700 dark:text-purple-400',
    },
    {
      label: 'Total Expenses',
      value: fmt(total),
      icon: IndianRupee,
      bg: 'bg-primary/5',
      border: 'border-primary/20',
      iconColor: 'text-primary',
      valueColor: 'text-primary',
      clickable: true,
    },
    {
      label: 'Order Value',
      value: fmt(orderValue),
      icon: ShoppingCart,
      bg: 'bg-orange-50 dark:bg-orange-950/30',
      border: 'border-orange-200 dark:border-orange-800',
      iconColor: 'text-orange-600',
      valueColor: 'text-orange-700 dark:text-orange-400',
    },
  ];

  return (
    <div className="space-y-1.5">

      {compact ? (
        /* Compact single-line strip */
        <div className="flex items-center gap-3 overflow-x-auto rounded-xl border bg-card p-2.5 scrollbar-none">
          {compactItems.map((item) => (
            <button
              key={item.label}
              className={`flex flex-col items-center shrink-0 ${item.clickable ? 'cursor-pointer' : 'cursor-default'}`}
              onClick={item.clickable ? onTotalClick : undefined}
              type="button"
            >
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">{item.label}</span>
              <span className={`text-xs font-semibold whitespace-nowrap ${item.color}`}>{item.value}</span>
            </button>
          ))}
        </div>
      ) : (
        /* Grid view — 2 cols on mobile with last item spanning full, 5 cols on desktop */
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {cards.map((card, idx) => (
            <button
              key={card.label}
              className={`flex items-center gap-2.5 p-3 rounded-xl border ${card.bg} ${card.border} text-left transition-all ${
                card.clickable ? 'cursor-pointer hover:shadow-md active:scale-[0.98]' : 'cursor-default'
              } ${card.clickable && isExpanded ? 'ring-2 ring-primary/30' : ''} ${
                idx === cards.length - 1 && cards.length % 2 !== 0 ? 'col-span-2 sm:col-span-1' : ''
              }`}
              onClick={card.clickable ? onTotalClick : undefined}
              type="button"
            >
              <card.icon className={`h-4.5 w-4.5 sm:h-5 sm:w-5 ${card.iconColor} shrink-0`} />
              <div className="min-w-0">
                <p className="text-[10px] sm:text-[10px] text-muted-foreground leading-tight truncate">{card.label}</p>
                <p className={`text-sm font-bold ${card.valueColor}`}>{card.value}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExpenseSummaryCards;
