import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Gift } from "lucide-react";
import { ProductScheme } from "@/hooks/useOfflineSchemes";

const describeBenefit = (scheme: ProductScheme): string => {
  if (scheme.discount_percentage) return `${scheme.discount_percentage}% off`;
  if (scheme.discount_amount) return `₹${scheme.discount_amount} off`;
  if (scheme.free_quantity) {
    if (scheme.free_product_selection_mode === 'user_choice') {
      return `Buy ${scheme.buy_quantity || ''} get ${scheme.free_quantity} free — you choose the item`;
    }
    const name = (scheme.free_product_source === 'other' ? scheme.other_free_product_name : scheme.free_product_name) || 'item(s)';
    return `Buy ${scheme.buy_quantity || ''} get ${scheme.free_quantity} ${name} free`;
  }
  return 'Special offer';
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  schemes: ProductScheme[];
  onConfirm: (schemeId: string) => void;
}

export const SchemeConflictChoiceDialog: React.FC<Props> = ({ isOpen, onClose, schemes, onConfirm }) => {
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    if (isOpen) setSelectedId('');
  }, [isOpen]);

  const handleConfirm = () => {
    if (!selectedId) return;
    onConfirm(selectedId);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            More than one offer applies
          </DialogTitle>
          <DialogDescription>
            Only one can be used on this order — pick which one.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={selectedId} onValueChange={setSelectedId} className="space-y-1">
          {schemes.map((scheme) => (
            <div key={scheme.id} className="flex items-start space-x-2 p-2 hover:bg-muted/50 rounded">
              <RadioGroupItem value={scheme.id} id={scheme.id} className="mt-1" />
              <Label htmlFor={scheme.id} className="flex-1 cursor-pointer font-normal">
                <div className="font-medium text-foreground">{scheme.name}</div>
                <div className="text-xs text-muted-foreground">{describeBenefit(scheme)}</div>
              </Label>
            </div>
          ))}
        </RadioGroup>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Not now</Button>
          <Button size="sm" disabled={!selectedId} onClick={handleConfirm}>
            Apply Selected Offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
