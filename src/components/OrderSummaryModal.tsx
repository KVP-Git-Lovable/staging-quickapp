import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gift, Package, ShoppingCart } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";

interface OrderSummaryItem {
  id: string;
  variantName: string;
  selectedItem: string;
  quantity: number;
  rate: number;
  totalPrice: number;
  savings: number;
  appliedOffers: string[];
}

interface OrderSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: OrderSummaryItem[];
  totalAmount: number;
  totalSavings: number;
  onAddToCart: () => void;
  productName?: string;
}

export const OrderSummaryModal = ({ 
  isOpen, 
  onClose, 
  items, 
  totalAmount, 
  totalSavings, 
  onAddToCart,
  productName = "Product"
}: OrderSummaryModalProps) => {
  const { format } = useCurrency();
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package size={20} />
            View Order — {productName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden">
          {/* Selected Items */}
          <div className="space-y-3 h-full">
            <h3 className="font-medium text-sm text-muted-foreground">Selected Items</h3>
            <div className="border rounded-lg overflow-hidden h-full flex flex-col">
              <div className="bg-muted/50 grid grid-cols-12 gap-2 p-3 text-xs font-medium border-b flex-shrink-0">
                <div className="col-span-4 text-left">Item / Variant</div>
                <div className="col-span-3 text-right">Unit Price</div>
                <div className="col-span-2 text-center">Qty</div>
                <div className="col-span-3 text-right">Subtotal</div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {items.map((item) => {
                const originalPrice = item.savings > 0 ? item.totalPrice + item.savings : item.totalPrice;
                const hasDiscount = item.savings > 0;
                return (
                  <div key={item.id} className="grid grid-cols-12 gap-2 p-3 border-b last:border-b-0 items-center">
                    <div className="col-span-4 text-left">
                      <div className="font-medium text-sm">{item.variantName}</div>
                      <div className="text-xs text-muted-foreground">{item.selectedItem}</div>
                    </div>
                    <div className="col-span-3 text-right">
                      {hasDiscount ? (
                        <div className="flex flex-col items-end">
                          <span className="text-xs text-muted-foreground line-through">{format(item.rate)}</span>
                          <span className="font-medium text-sm">{format(item.rate - (item.savings / item.quantity))}</span>
                          {item.appliedOffers.length > 0 && (
                            <span className="text-xs text-green-600 font-medium">
                              {item.appliedOffers[0].includes('10%') ? '10% OFF' : 
                               item.appliedOffers[0].includes('5%') ? '5% OFF' : 'DISCOUNT'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="font-medium text-sm">{format(item.rate)}</span>
                      )}
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="font-medium text-sm">{item.quantity}</span>
                    </div>
                    <div className="col-span-3 text-right">
                      <div className="flex flex-col items-end">
                        {hasDiscount && (
                          <span className="text-xs text-muted-foreground line-through">{format(originalPrice)}</span>
                        )}
                        <span className="font-medium text-sm">{format(item.totalPrice)}</span>
                        {hasDiscount && (
                          <span className="text-xs text-green-600 font-medium">You saved {format(item.savings)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Fixed Bottom Section */}
        <div className="border-t pt-4 space-y-4 flex-shrink-0">
          {/* Savings Summary */}
          {totalSavings > 0 && (
            <div className="flex justify-between items-center">
              <span className="font-bold text-green-600">You saved:</span>
              <span className="font-bold text-green-600 text-right">{format(totalSavings)}</span>
            </div>
          )}

          {/* Total Section */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-lg font-semibold">Total Amount:</span>
              <span className="text-xl font-bold text-primary">{format(totalAmount)}</span>
            </div>
            
            <Button 
              onClick={onAddToCart}
              className="w-full"
              size="lg"
            >
              <ShoppingCart size={16} className="mr-2" />
              Add Selected to Cart ({format(totalAmount)})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};