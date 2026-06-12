import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, Send, Loader2, Bot, ShoppingCart, X, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import { useChatOrderAssistant } from '@/hooks/useChatOrderAssistant';
import { ProductActionCard } from '@/components/customer-portal/ProductActionCard';
import { VoiceProduct } from '@/hooks/useVoiceOrderAssistant';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

interface CustomerChatWidgetProps {
  retailerId: string;
  retailerName: string;
}

const quickChips = [
  'Order haldi 2kg',
  'Reorder last order',
  'Show schemes',
];

export const CustomerChatWidget = ({ retailerId, retailerName }: CustomerChatWidgetProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [products, setProducts] = useState<VoiceProduct[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const {
    messages, loading, pendingItems, addingItemId, isConfirming,
    sendMessage, updateQuantity, removeItem, addSingleItemToCart, addAllToCart, clearPendingItems,
  } = useChatOrderAssistant(products, retailerId);

  useEffect(() => {
    const loadProducts = async () => {
      const pageSize = 1000;
      let from = 0;
      const all: any[] = [];
      while (true) {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, rate, unit, sku, product_variants(id, variant_name, sku, price, is_active)')
          .eq('is_active', true)
          .order('name')
          .range(from, from + pageSize - 1);
        if (error) break;
        if (!data?.length) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setProducts(all.map((p: any) => ({
        id: p.id, name: p.name, rate: p.rate || 0,
        unit: p.unit, sku: p.sku, variants: p.product_variants,
      })));
    };
    loadProducts();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pendingItems]);

  const handleSend = useCallback((text: string) => {
    if (!text.trim() || loading) return;
    setInput('');
    sendMessage(text, retailerName);
  }, [loading, sendMessage, retailerName]);

  const handleAddSingle = useCallback(async (id: string) => {
    await addSingleItemToCart(id);
    queryClient.invalidateQueries({ queryKey: ['customer-cart-count'] });
  }, [addSingleItemToCart, queryClient]);

  const handleAddAll = useCallback(async () => {
    await addAllToCart();
    queryClient.invalidateQueries({ queryKey: ['customer-cart-count'] });
  }, [addAllToCart, queryClient]);

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed right-4 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all z-50 bg-gradient-to-br from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
          size="icon"
        >
          <MessageCircle className="h-6 w-6 text-white" />
        </Button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-50 animate-in fade-in-0 duration-200"
            onClick={() => setIsOpen(false)}
          />

          <div
            className={cn(
              "fixed z-50 flex flex-col bg-background border border-border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in-0 duration-300",
              isMobile
                ? "inset-x-2 bottom-2 top-auto"
                : "right-4 bottom-4 w-[380px]"
            )}
            style={isMobile
              ? { maxHeight: 'calc(75vh - env(safe-area-inset-bottom, 0px))', marginBottom: 'env(safe-area-inset-bottom, 0px)' }
              : { height: '480px', maxHeight: 'calc(100vh - 2rem)' }
            }
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white rounded-t-2xl shrink-0">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                <span className="font-semibold text-sm">Chat to Order</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white hover:bg-white/10"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2.5 min-h-0">
              {messages.length === 0 && (
                <div className="text-center py-6">
                  <Bot size={32} className="mx-auto mb-2 text-primary/30" />
                  <p className="text-xs text-muted-foreground mb-1">Hi {retailerName?.split(' ')[0]}! 👋</p>
                  <p className="text-[10px] text-muted-foreground mb-3">Tell me what to order</p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {quickChips.map((chip) => (
                      <Button key={chip} variant="outline" size="sm" className="text-[10px] h-7 px-2" onClick={() => handleSend(chip)}>
                        {chip}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div key={idx}>
                  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-2.5 py-1.5 ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm'
                    }`}>
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none text-xs [&_p]:my-0.5">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-xs">{msg.content}</p>
                      )}
                    </div>
                  </div>
                  {msg.orderItems && msg.orderItems.length > 0 && (
                    <div className="mt-1.5 space-y-1.5 ml-0.5">
                      {msg.orderItems.map((item) => {
                        const pending = pendingItems.find(p => p.productId === item.productId && p.variantId === item.variantId);
                        if (!pending) return null;
                        return (
                          <ProductActionCard
                            key={item.id}
                            name={item.variantName || item.productName}
                            subtitle={item.variantName ? item.productName : undefined}
                            sku={item.sku}
                            rate={item.rate}
                            unit={item.unit}
                            quantity={pending.quantity}
                            onQuantityChange={(qty) => updateQuantity(pending.id, qty)}
                            onAdd={() => handleAddSingle(pending.id)}
                            onRemove={() => removeItem(pending.id)}
                            isAdding={addingItemId === pending.id}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>

            {/* Bulk add bar */}
            {pendingItems.length > 0 && (
              <div className="px-3 py-1.5 border-t border-border bg-card flex items-center gap-2">
                <Button onClick={handleAddAll} disabled={isConfirming} className="flex-1 h-9 text-xs font-semibold">
                  <ShoppingCart size={14} className="mr-1" />
                  {isConfirming ? 'Adding...' : `Add All (${pendingItems.length})`}
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={clearPendingItems}>
                  <X size={14} />
                </Button>
              </div>
            )}

            {/* Input */}
            <div className="px-3 py-2 border-t border-border bg-card rounded-b-2xl">
              <div className="flex gap-1.5">
                <Input
                  placeholder="Type your order..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
                  className="h-9 text-xs"
                  disabled={loading}
                />
                <Button
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => handleSend(input)}
                  disabled={!input.trim() || loading}
                >
                  <Send size={15} />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
