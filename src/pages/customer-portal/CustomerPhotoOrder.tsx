import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Camera, X, Loader2, Upload, ShoppingCart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { compressImageFile } from '@/utils/imageCompression';
import { ProductActionCard } from '@/components/customer-portal/ProductActionCard';
import { upsertSingleCartItem } from '@/utils/customerCartHelper';

interface PhotoItem {
  id: string;
  raw_text: string;
  product_id: string | null;
  product_name: string;
  sku: string;
  rate: number;
  unit: string;
  quantity: number;
  matched: boolean;
  addedToCart?: boolean;
  isAdding?: boolean;
}

interface CustomerPhotoOrderProps {
  retailerId: string;
  onClose: () => void;
}

const CustomerPhotoOrder = ({ retailerId, onClose }: CustomerPhotoOrderProps) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [addingAll, setAddingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const resetPhoto = useCallback(() => {
    setImagePreview(null);
    setImageFile(null);
    setItems([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    setItems([]);
  };

  const processImage = async () => {
    if (!imageFile) return;
    setProcessing(true);
    try {
      const compressed = await compressImageFile(imageFile, 0.6, 1024);
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(compressed);
      });

      const { data, error } = await supabase.functions.invoke('customer-portal-photo-order', {
        body: { image: base64, retailerId },
      });

      if (error) throw error;
      const parsed: any[] = data?.items || [];

      if (parsed.length === 0) {
        toast.info('Could not detect any products. Try a clearer image.');
      } else {
        const rawItems: PhotoItem[] = parsed.map((item, idx) => ({
          id: `photo-${idx}-${Date.now()}`,
          raw_text: item.raw_text || '',
          product_id: item.product_id,
          product_name: item.product_name || item.raw_text,
          sku: item.sku || '',
          rate: item.rate || 0,
          unit: item.unit || 'pieces',
          quantity: item.quantity || 1,
          matched: item.matched ?? !!item.product_id,
        }));

        // Merge duplicates with same product_id
        const mergedMap = new Map<string, PhotoItem>();
        for (const item of rawItems) {
          const key = item.product_id || item.id;
          if (mergedMap.has(key)) {
            mergedMap.get(key)!.quantity += item.quantity;
          } else {
            mergedMap.set(key, { ...item });
          }
        }
        const photoItems = Array.from(mergedMap.values());
        setItems(photoItems);
        setImagePreview(null);
        setImageFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        toast.success(`Found ${photoItems.length} product(s)!`);
      }
    } catch (err: any) {
      console.error('Photo order error:', err);
      toast.error('Failed to process image');
    } finally {
      setProcessing(false);
    }
  };

  const addSingleItemToCart = async (item: PhotoItem): Promise<boolean> => {
    if (!item.product_id) return false;

    try {
      return await upsertSingleCartItem({
        retailer_id: retailerId,
        product_id: item.product_id,
        quantity: item.quantity,
        unit: item.unit,
        source: 'photo',
      });
    } catch (err) {
      console.error('Add to cart exception for', item.product_name, err);
      return false;
    }
  };

  const addItemToCart = useCallback(async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item || !item.product_id || item.addedToCart) return;

    setItems(prev => prev.map(i => i.id === itemId ? { ...i, isAdding: true } : i));
    const success = await addSingleItemToCart(item);
    if (success) {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, addedToCart: true, isAdding: false } : i));
      queryClient.invalidateQueries({ queryKey: ['customer-cart-count'] });
      toast.success(`${item.product_name} added to cart`);
    } else {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, isAdding: false } : i));
      toast.error('Failed to add item to cart');
    }
  }, [items, retailerId, queryClient]);

  const updateQuantity = useCallback((itemId: string, qty: number) => {
    if (qty < 1) return;
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, quantity: qty } : i));
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setItems(prev => prev.filter(i => i.id !== itemId));
  }, []);

  const addAllToCart = async () => {
    const pendingItems = items.filter(i => i.product_id && !i.addedToCart);
    if (pendingItems.length === 0) return;

    setAddingAll(true);
    let successCount = 0;
    const successIds: string[] = [];

    for (const item of pendingItems) {
      const success = await addSingleItemToCart(item);
      if (success) {
        successCount++;
        successIds.push(item.id);
      }
    }

    if (successIds.length > 0) {
      setItems(prev => prev.map(i =>
        successIds.includes(i.id) ? { ...i, addedToCart: true } : i
      ));
      queryClient.invalidateQueries({ queryKey: ['customer-cart-count'] });
    }

    if (successCount === pendingItems.length) {
      toast.success(`${successCount} item(s) added to cart`);
    } else if (successCount > 0) {
      toast.warning(`${successCount} of ${pendingItems.length} items added to cart`);
    } else {
      toast.error('Failed to add items to cart');
    }

    setAddingAll(false);
  };

  const pendingCount = items.filter(i => i.product_id && !i.addedToCart).length;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 pb-20" onClick={onClose}>
      <Card className="w-full max-w-lg rounded-2xl p-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h2 className="text-base font-bold text-foreground">📸 Photo Order</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-4 shrink-0">
          Take a photo of your order list (handwritten or printed) and we'll match products for you.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCapture}
          className="hidden"
        />

        {!imagePreview && items.length === 0 ? (
          <Button
            variant="outline"
            className="w-full h-32 border-dashed flex-col gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera size={32} className="text-muted-foreground" />
            <span className="text-sm">Tap to capture or upload</span>
          </Button>
        ) : imagePreview ? (
          <div className="space-y-3">
            <img src={imagePreview} alt="Order" className="w-full rounded-lg max-h-48 object-cover" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={resetPhoto}>
                Retake
              </Button>
              {items.length === 0 && (
                <Button className="flex-1 gap-1" onClick={processImage} disabled={processing}>
                  {processing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {processing ? 'Processing...' : 'Extract Items'}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-3 flex items-center justify-between gap-3 shrink-0">
            <div>
              <p className="text-xs font-semibold text-foreground">Photo extracted successfully</p>
              <p className="text-[11px] text-muted-foreground">The uploaded photo was discarded after extraction.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => fileInputRef.current?.click()}
            >
              New Photo
            </Button>
          </div>
        )}

        {/* Product list - editable cards */}
        {items.length > 0 && (
          <div className="mt-4 flex flex-col min-h-0 flex-1">
            <div className="flex items-center justify-between shrink-0 mb-2">
              <h3 className="text-sm font-semibold text-foreground">
                Matched Products ({items.length})
              </h3>
              {pendingCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {items.filter(i => i.addedToCart).length} added
                </span>
              )}
            </div>

            <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pb-2 -mr-2 pr-2">
              {items.map((item) => (
                <div key={item.id} className="relative">
                  {item.addedToCart && (
                    <div className="absolute inset-0 bg-background/60 z-10 rounded-xl flex items-center justify-center">
                      <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                        ✓ Added to Cart
                      </span>
                    </div>
                  )}
                  <ProductActionCard
                    name={item.product_name}
                    sku={item.sku}
                    rate={item.rate}
                    unit={item.unit}
                    quantity={item.quantity}
                    onQuantityChange={(qty) => updateQuantity(item.id, qty)}
                    onAdd={() => addItemToCart(item.id)}
                    onRemove={() => removeItem(item.id)}
                    isAdding={item.isAdding}
                    disabled={!item.product_id || item.addedToCart}
                  />
                  {!item.matched && (
                    <p className="text-[10px] text-destructive mt-0.5 px-1">
                      ⚠ No matching product found
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Add All button */}
            {pendingCount > 0 && (
              <Button
                className="w-full h-12 text-base font-semibold mt-2 shrink-0"
                size="lg"
                onClick={addAllToCart}
                disabled={addingAll}
              >
                <ShoppingCart size={20} className="mr-2" />
                {addingAll
                  ? 'Adding to Cart...'
                  : `Add All to Cart (${pendingCount} item${pendingCount > 1 ? 's' : ''})`}
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default CustomerPhotoOrder;
