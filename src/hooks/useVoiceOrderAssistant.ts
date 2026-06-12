import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { upsertSingleCartItem, upsertCartItems } from '@/utils/customerCartHelper';
import { toast } from 'sonner';
import { normalizeUnit, collapseWhitespace, findBestMatch, buildProductShortlist } from '@/utils/productFuzzyMatch';

export interface VoiceOrderItem {
  id: string;
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  quantity: number;
  unit: string;
  confidence: 'high' | 'medium' | 'low';
  searchTerm: string;
  rate: number;
  sku: string;
}

export interface VoiceProduct {
  id: string;
  name: string;
  rate: number;
  unit?: string;
  sku?: string;
  category?: { name: string } | string;
  variants?: {
    id: string;
    variant_name: string;
    sku?: string;
    price: number;
    is_active?: boolean;
  }[];
}

export const SUPPORTED_LANGUAGES = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'हिन्दी (Hindi)' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'ml-IN', label: 'മലയാളം (Malayalam)' },
  { code: 'ta-IN', label: 'தமிழ் (Tamil)' },
] as const;

const LANG_KEY = 'customer_portal_voice_lang';

const GREETING_TEXT = "Hi! Please tell me your order. I'll add it after you confirm.";


// Fuzzy matching utilities are now in @/utils/productFuzzyMatch.ts

// ── Hook ──

export const useVoiceOrderAssistant = (products: VoiceProduct[], retailerId?: string) => {
  const [items, setItems] = useState<VoiceOrderItem[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGreeting, setIsGreeting] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguageState] = useState(() => localStorage.getItem(LANG_KEY) || 'en-IN');
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  

  const orderRecognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const committedTextRef = useRef('');
  const partialTextRef = useRef('');
  const shouldKeepListeningRef = useRef(false);
  const processTranscriptRef = useRef<(text: string, showErrorIfEmpty?: boolean) => Promise<void>>(async () => {});
  const dbLoadedRef = useRef(false);

  const SpeechRecognition = typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;
  const isSupported = !!SpeechRecognition && !!navigator.mediaDevices;

  // Load items from database on mount
  useEffect(() => {
    if (!retailerId || dbLoadedRef.current) return;
    const loadFromDb = async () => {
      try {
        const { data, error: dbErr } = await (supabase as any)
          .from('customer_portal_voice_orders')
          .select('*')
          .eq('retailer_id', retailerId)
          .order('created_at', { ascending: true });
        if (dbErr) { console.error('Failed to load voice orders:', dbErr); return; }
        if (data && data.length > 0) {
          const loaded: VoiceOrderItem[] = (data as any[]).map((row: any) => ({
            id: row.id,
            productId: row.product_id,
            productName: row.product_name,
            variantId: row.variant_id || undefined,
            variantName: row.variant_name || undefined,
            quantity: Number(row.quantity),
            unit: row.unit,
            confidence: (row.confidence || 'medium') as 'high' | 'medium' | 'low',
            searchTerm: row.search_term || '',
            rate: Number(row.rate),
            sku: row.sku || '',
          }));
          setItems(loaded);
        }
        dbLoadedRef.current = true;
      } catch (err) {
        console.error('Failed to load voice orders:', err);
      }
    };
    loadFromDb();
  }, [retailerId]);

  // Check mic permission on mount
  useEffect(() => {
    const checkPermission = async () => {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        setMicPermission(result.state as 'prompt' | 'granted' | 'denied');
        result.onchange = () => setMicPermission(result.state as 'prompt' | 'granted' | 'denied');
      } catch {
        setMicPermission('prompt');
      }
    };
    checkPermission();
  }, []);

  const requestMicPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicPermission('granted');
      return true;
    } catch {
      setMicPermission('denied');
      return false;
    }
  }, []);

  // Helper: save items to DB
  const saveItemsToDb = useCallback(async (newItems: VoiceOrderItem[]) => {
    if (!retailerId) return;
    try {
      const rows = newItems.map(item => ({
        id: item.id,
        retailer_id: retailerId,
        product_id: item.productId,
        product_name: item.productName,
        variant_id: item.variantId || null,
        variant_name: item.variantName || null,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        sku: item.sku,
        search_term: item.searchTerm,
        confidence: item.confidence,
      }));
      await (supabase as any).from('customer_portal_voice_orders').upsert(rows);
    } catch (err) {
      console.error('Failed to save voice orders:', err);
    }
  }, [retailerId]);

  const deleteItemFromDb = useCallback(async (id: string) => {
    if (!retailerId) return;
    try {
      await (supabase as any).from('customer_portal_voice_orders').delete().eq('id', id);
    } catch (err) {
      console.error('Failed to delete voice order:', err);
    }
  }, [retailerId]);

  const deleteAllFromDb = useCallback(async () => {
    if (!retailerId) return;
    try {
      await (supabase as any).from('customer_portal_voice_orders').delete().eq('retailer_id', retailerId);
    } catch (err) {
      console.error('Failed to clear voice orders:', err);
    }
  }, [retailerId]);

  const setLanguage = useCallback((lang: string) => {
    setLanguageState(lang);
    localStorage.setItem(LANG_KEY, lang);
  }, []);

  // ── TTS Greeting ──
  const playGreeting = useCallback(async (): Promise<void> => {
    try {
      setIsGreeting(true);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/elevenlabs-tts-stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ text: GREETING_TEXT }),
        }
      );

      if (!response.ok) {
        console.error('TTS greeting failed:', response.status);
        setIsGreeting(false);
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      return new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          setIsGreeting(false);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          setIsGreeting(false);
          resolve();
        };
        audio.play().catch(() => {
          setIsGreeting(false);
          resolve();
        });
      });
    } catch (err) {
      console.error('Greeting error:', err);
      setIsGreeting(false);
    }
  }, []);

  // ── Continuous order recognition ──
  const startScribeListening = useCallback(async () => {
    if (!SpeechRecognition) {
      setError('Voice recognition is not supported in this browser.');
      return;
    }

    try {
      if (orderRecognitionRef.current) {
        try { orderRecognitionRef.current.stop(); } catch {}
        orderRecognitionRef.current = null;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = language;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      orderRecognitionRef.current = recognition;

      recognition.onstart = () => {
        console.log('🎤 Continuous order recognition started');
        setIsRecording(true);
        setError(null);
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let newCommittedText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const spokenText = result[0]?.transcript || '';

          if (result.isFinal) {
            newCommittedText += `${spokenText} `;
          } else {
            interimTranscript += spokenText;
          }
        }

        if (newCommittedText.trim()) {
          committedTextRef.current = collapseWhitespace(`${committedTextRef.current} ${newCommittedText}`);
        }

        partialTextRef.current = collapseWhitespace(interimTranscript);
        setTranscript(collapseWhitespace(`${committedTextRef.current} ${partialTextRef.current}`));
      };

      recognition.onerror = (event: any) => {
        console.error('Order recognition error:', event.error);

        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }

        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          shouldKeepListeningRef.current = false;
          setError('Microphone access denied. Please allow microphone access.');
          setIsRecording(false);
          return;
        }

        if (event.error === 'audio-capture') {
          shouldKeepListeningRef.current = false;
          setError('No microphone detected. Please check your device.');
          setIsRecording(false);
          return;
        }
      };

      recognition.onend = () => {
        console.log('🎤 Continuous order recognition ended');
        orderRecognitionRef.current = null;

        if (shouldKeepListeningRef.current) {
          window.setTimeout(() => {
            if (shouldKeepListeningRef.current) {
              startScribeListening();
            }
          }, 250);
        } else {
          setIsRecording(false);
        }
      };

      recognition.start();
    } catch (err) {
      console.error('Failed to start continuous order recognition:', err);
      setError('Failed to start voice recognition.');
      setIsRecording(false);
    }
  }, [SpeechRecognition, language]);

  const stopScribeListening = useCallback(() => {
    shouldKeepListeningRef.current = false;

    if (orderRecognitionRef.current) {
      const recognition = orderRecognitionRef.current;
      orderRecognitionRef.current = null;
      try { recognition.stop(); } catch {}
    }

    setIsRecording(false);
  }, []);

  // ── Process transcript with AI ──
  const processTranscript = useCallback(async (text: string, showErrorIfEmpty = true) => {
    const normalizedText = collapseWhitespace(text);
    if (!normalizedText) { if (showErrorIfEmpty) setError('No speech detected. Please try again.'); return; }
    setError(null);

    try {
      if (products.length === 0) {
        setError('Product catalog is not loaded yet. Please wait and try again.');
        return;
      }

      const productNames = buildProductShortlist(normalizedText, products);

      console.log('🎤 processTranscript: Sending to parser:', { transcript: normalizedText, shortlistCount: productNames.length, language });

      // Wrap in timeout to prevent indefinite hanging
      let parsedOrders: any[] = [];
      let aiSuccess = false;
      try {
        const invokePromise = supabase.functions.invoke('voice-order-parser', {
          body: { transcript: normalizedText, productNames, language }
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('VOICE_PARSER_TIMEOUT')), 8000)
        );
        const { data, error: fnError } = await Promise.race([invokePromise, timeoutPromise]);

        if (!fnError && data && !data.error && data.orders?.length > 0) {
          parsedOrders = data.orders;
          aiSuccess = true;
        } else {
          console.warn('🎤 AI parser returned no results or error:', fnError || data?.error);
        }
      } catch (timeoutErr: any) {
        if (timeoutErr.message === 'VOICE_PARSER_TIMEOUT') {
          console.warn('🎤 Voice parser timed out after 8s, falling back to local matching');
        } else {
          console.error('🎤 Voice parser invocation error:', timeoutErr);
        }
      }

      // Fallback: local fuzzy matching if AI failed
      if (!aiSuccess || parsedOrders.length === 0) {
        console.log('🎤 Using local fuzzy fallback for:', normalizedText);
        // Simple heuristic: split by commas or common conjunctions
        const segments = normalizedText.split(/,|aur |and /i).map(s => s.trim()).filter(Boolean);
        for (const segment of segments) {
          // Extract trailing number as quantity
          const qtyMatch = segment.match(/(\d+)\s*(kg|kilo|pieces?|packet|packets?)?\s*$/i);
          const quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1;
          const searchPart = qtyMatch ? segment.slice(0, qtyMatch.index).trim() : segment;
          if (searchPart) {
            parsedOrders.push({ productSearch: searchPart, quantity, unit: qtyMatch?.[2] || 'kg' });
          }
        }
      }

      console.log('🎤 processTranscript: Parsed orders:', parsedOrders);
      if (parsedOrders.length === 0) {
        setError('No products were recognized. Please try again.');
        return;
      }

      const newItems: VoiceOrderItem[] = [];
      for (const order of parsedOrders) {
        const searchTerm = order.productSearch || order.name || '';
        const { product, variant, confidence } = findBestMatch(searchTerm, products);
        console.log('🎤 Match result:', { searchTerm, product: product?.name, variant: variant?.variant_name, confidence });
        if (product) {
          const voiceUnit = normalizeUnit(order.unit || 'kg');
          const itemRate = variant?.price ?? product.rate ?? 0;
          const itemSku = variant?.sku || product.sku || '';
          newItems.push({
            id: crypto.randomUUID(),
            productId: product.id,
            productName: product.name,
            variantId: variant?.id,
            variantName: variant?.variant_name,
            quantity: order.quantity || 1,
            unit: voiceUnit === 'g' ? 'Grams' : voiceUnit === 'pieces' ? 'Pieces' : 'KG',
            confidence,
            searchTerm,
            rate: itemRate,
            sku: itemSku,
          });
        }
      }

      if (newItems.length === 0) {
        setError('No matching products found. Please try saying the product names again.');
        return;
      }

      // Merge: if same productId+variantId exists, add quantities
      const itemsToUpsert: VoiceOrderItem[] = [];
      setItems(prev => {
        const merged = [...prev];
        for (const item of newItems) {
          const existing = merged.find(m => m.productId === item.productId && m.variantId === item.variantId);
          if (existing) {
            existing.quantity += item.quantity;
            itemsToUpsert.push({ ...existing });
          } else {
            merged.push(item);
            itemsToUpsert.push(item);
          }
        }
        return merged;
      });

      // Persist to database
      saveItemsToDb(itemsToUpsert);

      toast.success(`Added ${newItems.length} item(s) to order summary`);
    } catch (err) {
      console.error('Error processing voice transcript:', err);
      setError('Could not process your recording. Please try again.');
    }
  }, [products, language, saveItemsToDb]);

  // Keep processTranscriptRef in sync
  useEffect(() => {
    processTranscriptRef.current = processTranscript;
  }, [processTranscript]);

  const startRecording = useCallback(async () => {
    if (micPermission !== 'granted') return;
    shouldKeepListeningRef.current = true;
    setError(null);
    setTranscript('');
    committedTextRef.current = '';
    partialTextRef.current = '';

    // Start listening immediately — don't block on TTS greeting
    await startScribeListening();

    // Play greeting in the background (non-blocking)
    playGreeting().catch(() => {});
  }, [micPermission, playGreeting, startScribeListening]);




  // ── Stop recording ──
  const stopRecording = useCallback(async () => {
    const transcriptBeforeStop = collapseWhitespace(`${committedTextRef.current} ${partialTextRef.current}`);

    setIsProcessing(true);
    stopScribeListening();

    try {
      await new Promise(resolve => setTimeout(resolve, 250));

      const finalTranscript = collapseWhitespace(`${committedTextRef.current} ${partialTextRef.current}`) || transcriptBeforeStop;
      console.log('🎤 stopRecording: Processing transcript:', finalTranscript);
      setTranscript(finalTranscript);

      await processTranscriptRef.current(finalTranscript, true);
    } catch (err) {
      console.error('🎤 stopRecording: Processing error:', err);
    } finally {
      committedTextRef.current = '';
      partialTextRef.current = '';
      setIsProcessing(false);
    }
  }, [stopScribeListening]);

  // ── Item management ──
  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    deleteItemFromDb(id);
  }, [deleteItemFromDb]);

  const updateItemQuantity = useCallback((id: string, quantity: number) => {
    if (quantity < 1) return;
    setItems(prev => {
      const updated = prev.map(i => i.id === id ? { ...i, quantity } : i);
      const item = updated.find(i => i.id === id);
      if (item) saveItemsToDb([item]);
      return updated;
    });
  }, [saveItemsToDb]);

  const clearAll = useCallback(() => {
    setItems([]);
    deleteAllFromDb();
  }, [deleteAllFromDb]);

  const addSingleItemToCart = useCallback(async (itemId: string) => {
    if (!retailerId) return false;
    const item = items.find(i => i.id === itemId);
    if (!item) return false;

    try {
      await upsertSingleCartItem({
        retailer_id: retailerId,
        product_id: item.productId,
        variant_id: item.variantId || null,
        quantity: item.quantity,
        unit: item.unit,
        source: 'voice',
      });
      setItems(prev => prev.filter(i => i.id !== itemId));
      deleteItemFromDb(itemId);
      toast.success(`${item.variantName || item.productName} added to cart`);
      return true;
    } catch (err) {
      console.error('Failed to add item to cart:', err);
      toast.error('Failed to add to cart');
      return false;
    }
  }, [retailerId, items]);

  const confirmOrder = useCallback(async () => {
    if (!retailerId || items.length === 0) return false;
    try {
      const rows = items.map(item => ({
        retailer_id: retailerId,
        product_id: item.productId,
        variant_id: item.variantId || null,
        quantity: item.quantity,
        unit: item.unit,
        source: 'voice' as const,
      }));
      const { success, failed } = await upsertCartItems(rows);
      if (failed > 0 && success === 0) throw new Error('All items failed');
      clearAll();
      toast.success('All items added to cart!');
      return true;
    } catch (err) {
      console.error('Failed to add to cart:', err);
      toast.error('Failed to add to cart');
      return false;
    }
  }, [retailerId, items, clearAll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldKeepListeningRef.current = false;
      stopScribeListening();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [stopScribeListening]);

  return {
    items,
    isRecording,
    isProcessing,
    isGreeting,
    transcript,
    error,
    isSupported,
    language,
    setLanguage,
    micPermission,
    requestMicPermission,
    startRecording,
    stopRecording,
    removeItem,
    updateItemQuantity,
    clearAll,
    addSingleItemToCart,
    confirmOrder,
  };
};
