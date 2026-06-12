import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Minus, ShoppingCart, X, Loader2, Gift } from 'lucide-react';

interface ProductActionCardProps {
  name: string;
  subtitle?: string;
  sku?: string;
  rate: number;
  unit: string;
  quantity: number;
  onQuantityChange: (newQty: number) => void;
  onAdd: () => void;
  onRemove?: () => void;
  isAdding?: boolean;
  disabled?: boolean;
  gstPercent?: number;
  hasScheme?: boolean;
  schemeBadge?: string;
}

export const ProductActionCard: React.FC<ProductActionCardProps> = ({
  name,
  subtitle,
  sku,
  rate,
  unit,
  quantity,
  onQuantityChange,
  onAdd,
  onRemove,
  isAdding,
  disabled,
  gstPercent,
  hasScheme,
  schemeBadge,
}) => {
  const unitLabel = unit === 'grams' || unit === 'g' || unit === 'gram' ? 'g' : unit === 'kg' ? 'kg' : unit || 'pcs';

  return (
    <Card className="p-2.5">
      <div className="flex items-center justify-between gap-2">
        {/* Left: product info - compact single/two line */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-foreground uppercase truncate leading-tight">{name}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {sku && (
              <span className="text-[10px] text-muted-foreground">{sku}</span>
            )}
            {sku && rate > 0 && <span className="text-[10px] text-muted-foreground">·</span>}
            <span className="text-[11px] font-semibold text-primary">
              ₹{rate > 0 ? rate.toFixed(2) : '—'}/{unitLabel}
            </span>
            {gstPercent != null && gstPercent > 0 && (
              <span className="text-[9px] text-muted-foreground bg-muted px-1 py-0.5 rounded">
                +{gstPercent}%
              </span>
            )}
            {hasScheme && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-1 py-0.5 rounded-full">
                <Gift size={8} />
                {schemeBadge || 'Offer'}
              </span>
            )}
          </div>
        </div>

        {/* Right: quantity + actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-0.5 bg-muted rounded-full px-1 py-0.5">
            <button
              onClick={() => onQuantityChange(quantity - 1)}
              className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-background transition-colors"
              disabled={quantity <= 1}
            >
              <Minus size={10} />
            </button>
            <div className="flex flex-col items-center w-7">
              <span className="text-xs font-bold leading-none">{quantity}</span>
              <span className="text-[8px] text-muted-foreground leading-none mt-0.5">{unitLabel}</span>
            </div>
            <button
              onClick={() => onQuantityChange(quantity + 1)}
              className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-background transition-colors"
            >
              <Plus size={10} />
            </button>
          </div>

          <Button
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={onAdd}
            disabled={isAdding || disabled}
          >
            {isAdding ? <Loader2 size={10} className="mr-0.5 animate-spin" /> : <ShoppingCart size={10} className="mr-0.5" />}
            Add
          </Button>

          {onRemove && (
            <button
              onClick={onRemove}
              className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
              title="Remove"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>
    </Card>
  );
};
