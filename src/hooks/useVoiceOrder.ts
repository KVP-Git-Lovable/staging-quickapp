import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface ParsedOrder {
  productSearch: string;
  quantity: number;
  unit: string;
}

export interface AutoFillResult {
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  quantity: number;
  unit: string;
  confidence: 'high' | 'medium' | 'low';
  searchTerm: string;
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

interface UseVoiceOrderResult {
  isRecording: boolean;
  isProcessing: boolean;
  transcript: string;
  autoFillResults: AutoFillResult[];
  startRecording: () => void;
  stopRecording: () => void;
  clearResults: () => void;
  error: string | null;
  isSupported: boolean;
}

// Normalize unit strings for matching
const normalizeUnit = (unit: string): string => {
  const u = (unit || '').toLowerCase().trim();
  // gram variations → g
  if (['gram', 'grams', 'gm', 'grm'].includes(u)) return 'g';
  // kg variations → kg  
  if (['kilogram', 'kilograms', 'kilo', 'kilos'].includes(u)) return 'kg';
  return u;
};

// Levenshtein distance for typo tolerance
const levenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
};

// Calculate similarity score based on Levenshtein distance (0-1)
const levenshteinSimilarity = (a: string, b: string): number => {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
};

// Extract primary product name (first word before numbers/units)
const extractPrimaryName = (s: string): string => {
  const normalized = s.toLowerCase().trim();
  // Remove units and numbers, get the main product word
  const cleaned = normalized
    .replace(/\d+/g, '')
    .replace(/\b(g|gm|gram|grams|kg|kilo|kilogram|kilograms)\b/gi, '')
    .trim();
  
  // Get first meaningful word (at least 2 chars)
  const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
  return words[0] || cleaned;
};

// Extract size/variant number from string (e.g., "250" from "adarak 250g")
const extractSize = (s: string): string | null => {
  const match = s.match(/(\d+)\s*(g|gm|gram|grams|kg|kilo|kilogram|kilograms)?/i);
  if (match) {
    const num = match[1];
    const unit = normalizeUnit(match[2] || '');
    // Normalize to grams for comparison
    if (unit === 'kg') {
      return String(parseInt(num) * 1000);
    }
    return num;
  }
  return null;
};

// Two-phase fuzzy matching: Primary name (70%) + Size/Variant (30%)
const fuzzyMatch = (searchTerm: string, target: string): number => {
  const searchLower = searchTerm.toLowerCase().trim();
  const targetLower = target.toLowerCase().trim();
  
  // Exact match
  if (targetLower === searchLower) return 1;
  
  // Phase 1: Primary name matching (70% weight)
  const searchPrimary = extractPrimaryName(searchLower);
  const targetPrimary = extractPrimaryName(targetLower);
  
  let primaryScore = 0;
  if (searchPrimary && targetPrimary) {
    if (searchPrimary === targetPrimary) {
      primaryScore = 1;
    } else if (targetPrimary.includes(searchPrimary) || searchPrimary.includes(targetPrimary)) {
      primaryScore = 0.9;
    } else {
      // Use Levenshtein for typo tolerance (adrak → adarak)
      primaryScore = levenshteinSimilarity(searchPrimary, targetPrimary);
    }
  }
  
  // Phase 2: Size/variant matching (30% weight)
  const searchSize = extractSize(searchLower);
  const targetSize = extractSize(targetLower);
  
  let sizeScore = 0;
  if (searchSize && targetSize) {
    if (searchSize === targetSize) {
      sizeScore = 1;
    } else {
      // Partial match for close sizes
      const sizeDiff = Math.abs(parseInt(searchSize) - parseInt(targetSize));
      const maxSize = Math.max(parseInt(searchSize), parseInt(targetSize));
      sizeScore = Math.max(0, 1 - sizeDiff / maxSize);
    }
  } else if (!searchSize && !targetSize) {
    // Neither has size info - neutral
    sizeScore = 0.5;
  }
  
  // Weighted combination: Primary name is MUCH more important
  const PRIMARY_WEIGHT = 0.7;
  const SIZE_WEIGHT = 0.3;
  
  const finalScore = (primaryScore * PRIMARY_WEIGHT) + (sizeScore * SIZE_WEIGHT);
  
  // Require minimum primary name match to consider at all
  if (primaryScore < 0.4) {
    return 0;
  }
  
  return finalScore;
};

interface MatchCandidate {
  product: VoiceProduct;
  variant?: VoiceProduct['variants'][0];
  score: number;
  matchedName: string;
}

const findBestMatch = (searchName: string, products: VoiceProduct[]): { 
  product: VoiceProduct | null; 
  variant?: VoiceProduct['variants'][0];
  confidence: 'high' | 'medium' | 'low';
} => {
  const candidates: MatchCandidate[] = [];
  
  for (const product of products) {
    // Match against base product name
    const baseScore = fuzzyMatch(searchName, product.name);
    if (baseScore > 0) {
      candidates.push({ product, score: baseScore, matchedName: product.name });
    }
    
    // Match against variants if they exist
    if (product.variants && product.variants.length > 0) {
      for (const variant of product.variants) {
        if (variant.is_active === false) continue;
        
        // Match variant name alone
        const variantScore = fuzzyMatch(searchName, variant.variant_name);
        if (variantScore > 0) {
          candidates.push({ product, variant, score: variantScore, matchedName: variant.variant_name });
        }
        
        // Match combined "product + variant" name
        const combinedName = `${product.name} ${variant.variant_name}`;
        const combinedScore = fuzzyMatch(searchName, combinedName);
        if (combinedScore > 0) {
          candidates.push({ product, variant, score: combinedScore, matchedName: combinedName });
        }
      }
    }
  }
  
  // Sort by score descending and get best match
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  
  if (!best) return { product: null, confidence: 'low' };
  
  if (best.score >= 0.8) return { product: best.product, variant: best.variant, confidence: 'high' };
  if (best.score >= 0.5) return { product: best.product, variant: best.variant, confidence: 'medium' };
  if (best.score >= 0.3) return { product: best.product, variant: best.variant, confidence: 'low' };
  
  return { product: null, confidence: 'low' };
};

export const useVoiceOrder = (products: VoiceProduct[]): UseVoiceOrderResult => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [autoFillResults, setAutoFillResults] = useState<AutoFillResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');

  // Check browser support
  const SpeechRecognition = typeof window !== 'undefined' 
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition 
    : null;
  const isSupported = !!SpeechRecognition;

  const processTranscript = useCallback(async (text: string) => {
    if (!text.trim()) {
      setError('No speech detected. Please try again.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    console.log('🎤 Processing transcript:', text);
    console.log('📦 Products available for matching:', products.length);

    try {
      // Check if online
      if (!navigator.onLine) {
        setError('Voice parsing requires internet connection. Please try again when online.');
        setIsProcessing(false);
        return;
      }

      // Check if products are loaded
      if (products.length === 0) {
        setError('Products are still loading. Please wait and try again.');
        setIsProcessing(false);
        return;
      }

      const productNames = products.map(p => p.name);
      console.log('📋 Sending product names to AI:', productNames.slice(0, 10), '...');

      const { data, error: fnError } = await supabase.functions.invoke('voice-order-parser', {
        body: { transcript: text, productNames }
      });

      if (fnError) {
        console.error('Voice parser function error:', fnError);
        setError('Failed to parse voice command. Please try again.');
        setIsProcessing(false);
        return;
      }

      if (data?.error) {
        setError(data.error);
        setIsProcessing(false);
        return;
      }

      const parsedOrders: ParsedOrder[] = data?.orders || [];
      console.log('🤖 AI parsed orders:', parsedOrders);
      
      if (parsedOrders.length === 0) {
        setError('Could not identify any products. Please speak clearly and try again.');
        setIsProcessing(false);
        return;
      }

      // Match parsed orders to actual products for auto-fill
      const results: AutoFillResult[] = [];
      
      for (const order of parsedOrders) {
        // Handle both old format (name) and new format (productSearch)
        const searchTerm = (order as any).productSearch || (order as any).name || '';
        console.log(`🔍 Matching "${searchTerm}" against ${products.length} products...`);
        
        const { product, variant, confidence } = findBestMatch(searchTerm, products);
        
        if (product) {
          const displayName = variant ? variant.variant_name : product.name;
          console.log(`✅ Matched "${searchTerm}" → "${displayName}" (confidence: ${confidence})`);
          
          // Normalize the unit from voice input. An unclear unit is left AS UNCLEAR
          // (empty string) rather than guessed as 'kg' — a wrong kg guess on a
          // gram-scale product inflates the order 1000x. TableOrderForm's
          // getDefaultOrderUnit() resolves an empty unit against the product's
          // own catalog unit, which is a far safer default than assuming kg here.
          const voiceUnit = order.unit ? normalizeUnit(order.unit) : '';

          results.push({
            productId: product.id,
            productName: product.name,
            variantId: variant?.id,
            variantName: variant?.variant_name,
            quantity: order.quantity || 1,
            unit: voiceUnit === 'g' ? 'Grams' : (voiceUnit === 'kg' ? 'KG' : ''),
            confidence,
            searchTerm
          });
        } else {
          console.log(`❌ No match found for: "${searchTerm}"`);
        }
      }

      console.log('📊 Final matched results:', results);
      setAutoFillResults(results);
      
      // Don't show toast here - let the callback handle it to avoid duplicates
      if (results.length === 0) {
        setError('Could not match any products. Please try different names.');
      }

    } catch (err) {
      console.error('Voice order processing error:', err);
      setError('An error occurred while processing your voice command.');
    } finally {
      setIsProcessing(false);
    }
  }, [products]);

  const startRecording = useCallback(() => {
    if (!isSupported) {
      toast({
        title: 'Not Supported',
        description: 'Voice recognition is not supported in your browser. Try Chrome or Edge.',
        variant: 'destructive'
      });
      return;
    }

    setError(null);
    setTranscript('');
    setAutoFillResults([]);
    finalTranscriptRef.current = '';

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN'; // Indian English for Hindi word support
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsRecording(true);
      console.log('Voice recognition started');
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (finalTranscript) {
        finalTranscriptRef.current += finalTranscript;
      }
      
      setTranscript(finalTranscriptRef.current + interimTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone access and try again.');
      } else if (event.error === 'no-speech') {
        setError('No speech detected. Please try again.');
      } else {
        setError(`Voice recognition error: ${event.error}`);
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      console.log('Voice recognition ended');
      
      // Process the final transcript
      const finalText = finalTranscriptRef.current.trim();
      if (finalText) {
        processTranscript(finalText);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, SpeechRecognition, processTranscript]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const clearResults = useCallback(() => {
    setTranscript('');
    setAutoFillResults([]);
    setError(null);
    finalTranscriptRef.current = '';
  }, []);

  return {
    isRecording,
    isProcessing,
    transcript,
    autoFillResults,
    startRecording,
    stopRecording,
    clearResults,
    error,
    isSupported
  };
};
