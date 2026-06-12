import { useState, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Loader2, Bot, ShoppingCart, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import { CustomerPortalUser } from '@/hooks/useCustomerPortalAuth';
import { useChatOrderAssistant, ChatMessage } from '@/hooks/useChatOrderAssistant';
import { ProductActionCard } from '@/components/customer-portal/ProductActionCard';
import { VoiceProduct } from '@/hooks/useVoiceOrderAssistant';

interface ContextType {
  retailer: CustomerPortalUser;
}

const quickChips = [
  'Order haldi 2kg',
  'Reorder last order',
  'Show active schemes',
  'Check product availability',
];

const CustomerChat = () => {
  const { retailer } = useOutletContext<ContextType>();
  const [input, setInput] = useState('');
  const [products, setProducts] = useState<VoiceProduct[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    loading,
    pendingItems,
    addingItemId,
    isConfirming,
    sendMessage,
    updateQuantity,
    removeItem,
    addSingleItemToCart,
    addAllToCart,
    clearPendingItems,
  } = useChatOrderAssistant(products, retailer.id);

  // Load products for fuzzy matching
  useEffect(() => {
    const loadProducts = async () => {
      const pageSize = 1000;
      let from = 0;
      const all: any[] = [];
      while (true) {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, rate, unit, sku, product_categories(name), product_variants(id, variant_name, sku, price, is_active)')
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
        id: p.id,
        name: p.name,
        rate: p.rate || 0,
        unit: p.unit,
        sku: p.sku,
        category: p.product_categories,
        variants: p.product_variants,
      })));
    };
    loadProducts();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pendingItems]);

  const handleSend = (text: string) => {
    if (!text.trim() || loading) return;
    setInput('');
    sendMessage(text, retailer.name);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] max-w-lg mx-auto">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Bot size={40} className="mx-auto mb-3 text-primary/30" />
            <p className="text-sm text-muted-foreground mb-1">Hi {retailer.name?.split(' ')[0]}! 👋</p>
            <p className="text-xs text-muted-foreground mb-4">Tell me what you want to order or ask anything</p>
            <div className="flex flex-wrap justify-center gap-2">
              {quickChips.map((chip) => (
                <Button
                  key={chip}
                  variant="outline"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => handleSend(chip)}
                >
                  {chip}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx}>
            <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-muted text-foreground rounded-bl-sm'
              }`}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none text-sm [&_p]:my-1">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
              </div>
            </div>

            {/* Inline order item cards */}
            {msg.orderItems && msg.orderItems.length > 0 && (
              <div className="mt-2 space-y-2 ml-1">
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
                      onAdd={() => addSingleItemToCart(pending.id)}
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
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Bulk add bar */}
      {pendingItems.length > 0 && (
        <div className="px-4 py-2 border-t border-border bg-card flex items-center gap-2">
          <Button
            onClick={addAllToCart}
            disabled={isConfirming}
            className="flex-1 h-10 text-sm font-semibold"
          >
            <ShoppingCart size={16} className="mr-1.5" />
            {isConfirming ? 'Adding...' : `Add All to Cart (${pendingItems.length})`}
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={clearPendingItems}>
            <X size={16} />
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-border bg-card">
        <div className="flex gap-2">
          <Input
            placeholder="Type your order or ask anything..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
            className="h-11"
            disabled={loading}
          />
          <Button
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => handleSend(input)}
            disabled={!input.trim() || loading}
          >
            <Send size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CustomerChat;
