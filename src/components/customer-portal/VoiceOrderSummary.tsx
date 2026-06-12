import React from 'react';
import { Button } from '@/components/ui/button';
import { ShoppingCart, X, Mic, ArrowRight } from 'lucide-react';
import { VoiceOrderItem } from '@/hooks/useVoiceOrderAssistant';
import { ProductActionCard } from './ProductActionCard';

interface VoiceOrderSummaryProps {
  items: VoiceOrderItem[];
  onRemoveItem: (id: string) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onClearAll: () => void;
  onConfirm: () => void;
  onAddSingleItem?: (id: string) => void;
  isConfirming?: boolean;
  exampleProducts?: { name: string; unit: string }[];
}

export const VoiceOrderSummary: React.FC<VoiceOrderSummaryProps> = ({
  items,
  onRemoveItem,
  onUpdateQuantity,
  onClearAll,
  onConfirm,
  onAddSingleItem,
  isConfirming,
  exampleProducts = [],
}) => {
  const exampleQuantities = [1, 2, 3];
  if (items.length === 0) {
    return (
      <div className="mt-4 px-1">
        <h3 className="text-sm font-semibold text-foreground mb-3">How it works</h3>
        <div className="space-y-2.5 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0 mt-0.5">1</span>
            <span>Tap the <Mic size={12} className="inline text-primary mx-0.5" /> mic button and speak your order</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0 mt-0.5">2</span>
            <span>Say product name + pack size + quantity</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0 mt-0.5">3</span>
            <span>Tap <strong>Stop</strong> to see matched products below</span>
          </div>
        </div>
        <div className="mt-3 p-3 bg-muted/50 rounded-lg border border-border/50">
          <p className="text-xs font-medium text-foreground mb-1.5">Examples:</p>
          <div className="space-y-1 text-xs text-muted-foreground italic">
            {exampleProducts.length > 0 ? (
              exampleProducts.map((p, i) => (
                <p key={p.name}>"{p.name} {exampleQuantities[i] ?? 1} {p.unit}"</p>
              ))
            ) : (
              <p>"Product name + quantity + unit"</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-foreground">
          Order Summary ({items.length} item{items.length > 1 ? 's' : ''})
        </h3>
        <button
          onClick={onClearAll}
          className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
        >
          <X size={12} />
          Clear All
        </button>
      </div>

      <div className="space-y-2 max-h-[40vh] overflow-y-auto">
        {items.map((item) => (
          <ProductActionCard
            key={item.id}
            name={item.variantName || item.productName}
            subtitle={item.variantName ? item.productName : undefined}
            sku={item.sku}
            rate={item.rate}
            unit={item.unit}
            quantity={item.quantity}
            onQuantityChange={(qty) => onUpdateQuantity(item.id, qty)}
            onAdd={() => onAddSingleItem?.(item.id)}
            onRemove={() => onRemoveItem(item.id)}
          />
        ))}
      </div>

      <Button
        onClick={onConfirm}
        disabled={isConfirming}
        className="w-full h-12 text-base font-semibold"
        size="lg"
      >
        <ShoppingCart size={20} className="mr-2" />
        {isConfirming ? 'Adding to Cart...' : `Add All to Cart (${items.length} item${items.length > 1 ? 's' : ''})`}
      </Button>
    </div>
  );
};
