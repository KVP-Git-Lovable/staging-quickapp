import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { useCustomerPortalAuth, CustomerPortalUser } from '@/hooks/useCustomerPortalAuth';
import { useVoiceOrderAssistant, SUPPORTED_LANGUAGES, VoiceProduct } from '@/hooks/useVoiceOrderAssistant';
import { VoiceAssistantBar } from '@/components/customer-portal/VoiceAssistantBar';
import { VoiceOrderSummary } from '@/components/customer-portal/VoiceOrderSummary';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mic, Camera, ShoppingCart, ChevronRight, Gift } from 'lucide-react';
import CustomerPhotoOrder from './CustomerPhotoOrder';
import { CustomerChatWidget } from '@/components/customer-portal/CustomerChatWidget';

interface ContextType {
  retailer: CustomerPortalUser;
  cartCount: number;
}


const CustomerHome = () => {
  const navigate = useNavigate();
  const { retailer, cartCount } = useOutletContext<ContextType>();
  const { logout } = useCustomerPortalAuth();
  const queryClient = useQueryClient();
  const [products, setProducts] = useState<VoiceProduct[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showPhotoOrder, setShowPhotoOrder] = useState(false);

  // Load products for voice matching
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const pageSize = 1000;
        let from = 0;
        const all: any[] = [];
        while (true) {
          const { data, error } = await supabase
            .from('products')
            .select('id, name, rate, unit, sku, category_id, product_variants(id, variant_name, sku, price, is_active)')
            .eq('is_active', true)
            .order('name')
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data?.length) break;
          all.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        setProducts(all.map(p => ({
          id: p.id,
          name: p.name,
          rate: p.rate || 0,
          unit: p.unit || '',
          sku: p.sku || '',
          variants: (p as any).product_variants || [],
        })));
      } catch (err) {
        console.error('Failed to load products:', err);
      }
    };
    fetchProducts();
  }, []);

  const {
    items, isRecording, isProcessing, isGreeting, transcript, error,
    isSupported, language, setLanguage, micPermission, requestMicPermission,
    startRecording, stopRecording, removeItem, updateItemQuantity,
    clearAll, addSingleItemToCart, confirmOrder,
  } = useVoiceOrderAssistant(products, retailer.id);

  const handleConfirm = useCallback(async () => {
    setIsConfirming(true);
    const success = await confirmOrder();
    setIsConfirming(false);
    if (success) {
      queryClient.invalidateQueries({ queryKey: ['customer-cart-count'] });
      navigate('/customer-portal/cart');
    }
  }, [confirmOrder, navigate, queryClient]);

  const handleAddSingleItem = useCallback(async (itemId: string) => {
    const success = await addSingleItemToCart(itemId);
    if (success) {
      queryClient.invalidateQueries({ queryKey: ['customer-cart-count'] });
    }
  }, [addSingleItemToCart, queryClient]);

  const currentLangLabel = SUPPORTED_LANGUAGES.find(l => l.code === language)?.label || 'English';

  // Build dynamic example phrases from real products in master
  const exampleProducts = useMemo(() => {
    if (!products.length) return [] as { name: string; unit: string }[];
    // Pick up to 3 distinct products (shuffle a bit using slice+sort by name length for stability)
    const picks: { name: string; unit: string }[] = [];
    const seen = new Set<string>();
    for (const p of products) {
      if (!p.name || seen.has(p.name)) continue;
      seen.add(p.name);
      picks.push({ name: p.name, unit: p.unit || 'pieces' });
      if (picks.length >= 3) break;
    }
    return picks;
  }, [products]);

  const exampleQuantities = [2, 5, 3];

  // Auto-request mic permission on mount
  useEffect(() => {
    if (isSupported && micPermission === 'prompt') {
      requestMicPermission();
    }
  }, [isSupported, micPermission, requestMicPermission]);

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto">

      {/* Cart Preview Strip */}
      {cartCount > 0 && (
        <Card
          className="mb-4 p-3.5 bg-primary/5 border-primary/20 cursor-pointer hover:bg-primary/10 transition-colors"
          onClick={() => navigate('/customer-portal/cart')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <ShoppingCart size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {cartCount} item{cartCount > 1 ? 's' : ''} in cart
                </p>
                <p className="text-[11px] text-muted-foreground">Tap to review & place order</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-primary" />
          </div>
        </Card>
      )}

      {/* Voice Order - Direct on Home */}
      <div className="mb-5">
        {isSupported && micPermission !== 'granted' ? (
          <Card className="p-4 text-center space-y-3">
            <Mic size={32} className="mx-auto text-blue-500" />
            <p className="text-sm font-medium">Microphone access needed</p>
            {micPermission === 'denied' ? (
              <p className="text-xs text-muted-foreground">
                Please enable microphone in browser settings
              </p>
            ) : (
              <Button onClick={requestMicPermission} size="sm" className="bg-blue-500 hover:bg-blue-600 text-white">
                <Mic size={14} className="mr-1" /> Allow Microphone
              </Button>
            )}
          </Card>
        ) : isSupported ? (
          <>
            <VoiceAssistantBar
              isRecording={isRecording}
              isProcessing={isProcessing}
              isGreeting={isGreeting}
              transcript={transcript}
              error={error}
              onTapToSpeak={startRecording}
              onStopRecording={stopRecording}
              languageLabel={currentLangLabel}
              itemCount={items.length}
            />
            {/* Example prompts */}
            {!isRecording && !isProcessing && !isGreeting && items.length === 0 && (
              <Card className="p-3 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 mb-1.5">💡 Try saying:</p>
                <div className="space-y-1">
                  {exampleProducts.length > 0 ? (
                    exampleProducts.map((p, i) => (
                      <p key={p.name} className="text-[11px] text-blue-600 dark:text-blue-400">
                        "{p.name} {exampleQuantities[i] ?? 2} {p.unit}"
                      </p>
                    ))
                  ) : (
                    <p className="text-[11px] text-blue-600 dark:text-blue-400">"Product name + quantity + unit"</p>
                  )}
                </div>
              </Card>
            )}
          </>
        ) : (
          <Card className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Voice not supported. Use Chrome or Edge.</p>
          </Card>
        )}
      </div>

      {/* Photo to Order - Single card below voice */}
      <button
        onClick={() => setShowPhotoOrder(true)}
        className="w-full relative overflow-hidden rounded-2xl p-4 text-left transition-all active:scale-[0.97] bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/20 mb-5"
      >
        <div className="absolute -right-3 -bottom-3 opacity-15">
          <Camera size={56} strokeWidth={1} />
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Camera size={20} />
          </div>
          <div>
            <p className="font-bold text-sm">Photo Order</p>
            <p className="text-[11px] opacity-80">Snap your list to place an order</p>
          </div>
        </div>
      </button>

      {/* Voice Order Summary */}
      {items.length > 0 && (
        <VoiceOrderSummary
          items={items}
          onRemoveItem={removeItem}
          onUpdateQuantity={updateItemQuantity}
          onClearAll={clearAll}
          onConfirm={handleConfirm}
          onAddSingleItem={handleAddSingleItem}
          isConfirming={isConfirming}
          exampleProducts={exampleProducts}
        />
      )}


      {/* Floating Chat Widget */}
      <CustomerChatWidget retailerId={retailer.id} retailerName={retailer.name || 'Customer'} />

      {showPhotoOrder && (
        <CustomerPhotoOrder
          retailerId={retailer.id}
          onClose={() => setShowPhotoOrder(false)}
        />
      )}
    </div>
  );
};

export default CustomerHome;
