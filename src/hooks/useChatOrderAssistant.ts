import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { upsertSingleCartItem, upsertCartItems } from '@/utils/customerCartHelper';
import { toast } from 'sonner';
import { VoiceOrderItem, VoiceProduct } from './useVoiceOrderAssistant';
import { findBestMatch, normalizeUnit, buildProductShortlist } from '@/utils/productFuzzyMatch';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  orderItems?: VoiceOrderItem[];
}

const ORDER_ITEMS_MARKER = ':::ORDER_ITEMS:::';

function parseOrderItems(reply: string, products: VoiceProduct[]): { text: string; items: VoiceOrderItem[] } {
  const markerIdx = reply.indexOf(ORDER_ITEMS_MARKER);
  if (markerIdx === -1) return { text: reply, items: [] };

  const textPart = reply.slice(0, markerIdx).trim();
  const jsonPart = reply.slice(markerIdx + ORDER_ITEMS_MARKER.length).trim();

  try {
    // Extract JSON array – might be wrapped in ```json fences
    const cleaned = jsonPart.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed: { productSearch: string; quantity: number; unit: string }[] = JSON.parse(cleaned);

    const items: VoiceOrderItem[] = [];
    for (const order of parsed) {
      const { product, variant, confidence } = findBestMatch(order.productSearch, products);
      if (product) {
        const voiceUnit = normalizeUnit(order.unit || 'kg');
        items.push({
          id: crypto.randomUUID(),
          productId: product.id,
          productName: product.name,
          variantId: variant?.id,
          variantName: variant?.variant_name,
          quantity: order.quantity || 1,
          unit: voiceUnit === 'g' ? 'Grams' : voiceUnit === 'pieces' ? 'Pieces' : 'KG',
          confidence,
          searchTerm: order.productSearch,
          rate: variant?.price ?? product.rate ?? 0,
          sku: variant?.sku || product.sku || '',
        });
      }
    }
    return { text: textPart, items };
  } catch {
    console.warn('Failed to parse ORDER_ITEMS JSON:', jsonPart);
    return { text: reply, items: [] };
  }
}

export const useChatOrderAssistant = (products: VoiceProduct[], retailerId?: string) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingItems, setPendingItems] = useState<VoiceOrderItem[]>([]);
  const [addingItemId, setAddingItemId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const sendMessage = useCallback(async (text: string, retailerName?: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const productNames = buildProductShortlist(text, products);
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

      const { data, error } = await supabase.functions.invoke('customer-portal-chat', {
        body: {
          message: text.trim(),
          retailerId,
          retailerName,
          history,
          productNames,
        },
      });

      if (error) throw error;

      const reply = data?.reply || 'Sorry, I could not process your request.';
      const { text: cleanText, items } = parseOrderItems(reply, products);

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: cleanText || 'Here are the products I found:',
        orderItems: items.length > 0 ? items : undefined,
      };

      setMessages(prev => [...prev, assistantMsg]);

      if (items.length > 0) {
        setPendingItems(prev => {
          const merged = [...prev];
          for (const item of items) {
            const existing = merged.find(m => m.productId === item.productId && m.variantId === item.variantId);
            if (existing) {
              existing.quantity = item.quantity;
            } else {
              merged.push(item);
            }
          }
          return merged;
        });
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      if (err?.message?.includes('429') || err?.status === 429) {
        toast.error('Too many requests. Please wait a moment.');
      } else {
        toast.error('Failed to get response');
      }
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, products, retailerId]);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity < 1) return;
    setPendingItems(prev => prev.map(i => i.id === id ? { ...i, quantity } : i));
  }, []);

  const removeItem = useCallback((id: string) => {
    setPendingItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const addSingleItemToCart = useCallback(async (itemId: string) => {
    if (!retailerId) return;
    const item = pendingItems.find(i => i.id === itemId);
    if (!item) return;

    setAddingItemId(itemId);
    try {
      await upsertSingleCartItem({
        retailer_id: retailerId,
        product_id: item.productId,
        variant_id: item.variantId || null,
        quantity: item.quantity,
        unit: item.unit,
        source: 'manual',
      });
      setPendingItems(prev => prev.filter(i => i.id !== itemId));
      toast.success(`${item.variantName || item.productName} added to cart`);
    } catch (err) {
      console.error('Failed to add to cart:', err);
      toast.error('Failed to add to cart');
    } finally {
      setAddingItemId(null);
    }
  }, [retailerId, pendingItems]);

  const addAllToCart = useCallback(async () => {
    if (!retailerId || pendingItems.length === 0) return;
    setIsConfirming(true);
    try {
      const rows = pendingItems.map(item => ({
        retailer_id: retailerId,
        product_id: item.productId,
        variant_id: item.variantId || null,
        quantity: item.quantity,
        unit: item.unit,
        source: 'manual' as const,
      }));
      const { success, failed } = await upsertCartItems(rows);
      if (failed > 0 && success === 0) throw new Error('All items failed');
      setPendingItems([]);
      toast.success('All items added to cart!');
    } catch (err) {
      console.error('Failed to add to cart:', err);
      toast.error('Failed to add to cart');
    } finally {
      setIsConfirming(false);
    }
  }, [retailerId, pendingItems]);

  const clearPendingItems = useCallback(() => {
    setPendingItems([]);
  }, []);

  return {
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
  };
};
