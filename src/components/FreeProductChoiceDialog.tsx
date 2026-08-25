import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Gift, Package } from "lucide-react";
import { ProductScheme } from "@/hooks/useOfflineSchemes";
import type { ManualSchemeSelection } from "@/utils/schemeEngine";

interface CatalogueProduct {
  id: string;
  name: string;
  rate?: number;
}

interface OtherFreeProduct {
  id: string;
  name: string;
}

interface Option {
  id: string;
  name: string;
  source: 'catalogue' | 'other';
  rate?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  scheme: ProductScheme | null;
  products: CatalogueProduct[];
  otherFreeProducts: OtherFreeProduct[];
  initialSelection?: ManualSchemeSelection | null;
  onConfirm: (selection: ManualSchemeSelection) => void;
}

export const FreeProductChoiceDialog: React.FC<Props> = ({
  isOpen, onClose, scheme, products, otherFreeProducts, initialSelection, onConfirm,
}) => {
  const options: Option[] = useMemo(() => {
    if (!scheme) return [];
    const catalogueOptions = (scheme.free_target_product_ids || [])
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is CatalogueProduct => !!p)
      .map((p) => ({ id: p.id, name: p.name, source: 'catalogue' as const, rate: p.rate }));
    const otherOptions = (scheme.free_target_other_product_ids || [])
      .map((id) => otherFreeProducts.find((p) => p.id === id))
      .filter((p): p is OtherFreeProduct => !!p)
      .map((p) => ({ id: p.id, name: p.name, source: 'other' as const }));
    return [...catalogueOptions, ...otherOptions];
  }, [scheme, products, otherFreeProducts]);

  const [selectedKey, setSelectedKey] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    const prior = initialSelection?.chosenFreeProductId
      ? `${initialSelection.chosenFreeProductSource}:${initialSelection.chosenFreeProductId}`
      : '';
    const stillValid = options.some((o) => `${o.source}:${o.id}` === prior);
    setSelectedKey(stillValid ? prior : '');
  }, [isOpen, scheme?.id]);

  const handleConfirm = () => {
    const chosen = options.find((o) => `${o.source}:${o.id}` === selectedKey);
    if (!chosen) return;
    onConfirm({
      chosenFreeProductId: chosen.id,
      chosenFreeProductSource: chosen.source,
      chosenFreeProductName: chosen.name,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-green-600" />
            Choose your free product
          </DialogTitle>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No free products are configured for this offer yet.
          </p>
        ) : (
          <RadioGroup value={selectedKey} onValueChange={setSelectedKey} className="max-h-72 overflow-y-auto space-y-1">
            {options.map((option) => {
              const key = `${option.source}:${option.id}`;
              return (
                <div key={key} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded">
                  <RadioGroupItem value={key} id={key} />
                  <Label htmlFor={key} className="flex-1 flex items-center gap-2 cursor-pointer font-normal">
                    {option.source === 'other' && <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    <span>{option.name}</span>
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!selectedKey} onClick={handleConfirm}>
            Confirm Free Product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
