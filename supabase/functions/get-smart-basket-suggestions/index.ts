import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RepeatOrderSuggestion {
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  quantity: number;
  unit: string;
  rate: number;
  confidence: number;
  orderCount: number;
  lastOrdered: string;
  avgQuantity: number;
}

interface BeatTrendingSuggestion {
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  suggestedQuantity: number;
  unit: string;
  rate: number;
  beatPenetration: number;
  retailerCount: number;
  totalBeatRetailers: number;
  reason: string;
}

interface UpsellSuggestion {
  currentProductId: string;
  currentProductName: string;
  currentVariantId?: string;
  suggestedProductId: string;
  suggestedProductName: string;
  suggestedVariantId?: string;
  suggestedVariantName?: string;
  currentSize: string;
  suggestedSize: string;
  savingsPercent: number;
  reason: string;
}

interface SmartBasketResponse {
  repeatOrder: RepeatOrderSuggestion[];
  beatTrending: BeatTrendingSuggestion[];
  upsell: UpsellSuggestion[];
  summary: {
    repeatOrderCount: number;
    potentialCrossSell: number;
    upsellOpportunities: number;
    retailerOrderHistory: number;
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { retailerId, beatId, userId } = await req.json();

    console.log('🧺 Smart Basket: Starting analysis', { retailerId, beatId, userId });

    if (!retailerId) {
      return new Response(
        JSON.stringify({ error: 'retailerId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch retailer's order history (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: retailerOrders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        created_at,
        order_items (
          id,
          variant_id,
          product_name,
          quantity,
          unit,
          rate
        )
      `)
      .eq('retailer_id', retailerId)
      .gte('created_at', ninetyDaysAgo.toISOString())
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error('Error fetching retailer orders:', ordersError);
      throw ordersError;
    }

    console.log('📊 Retailer orders found:', retailerOrders?.length || 0);

  // 2. Analyze repeat order patterns
    // Derive a stable key/productId from variant_id + product_name (order_items has no product_id column)
    const deriveKey = (item: any): { key: string; baseProductId: string; variantId?: string } => {
      const variantId = item.variant_id || undefined;
      const baseProductId = item.product_name || 'unknown';
      const key = `${baseProductId}__${variantId || 'novariant'}`;
      return { key, baseProductId, variantId };
    };

    const repeatOrderMap = new Map<string, {
      productId: string;
      productName: string;
      variantId?: string;
      variantName?: string;
      quantities: number[];
      units: string[];
      rates: number[];
      orderDates: string[];
    }>();

    for (const order of retailerOrders || []) {
      for (const item of order.order_items || []) {
        const { key, baseProductId, variantId } = deriveKey(item);
        
        // Extract variant name from product_name if it contains " - "
        let productName = item.product_name;
        let variantName: string | undefined = undefined;
        if (item.product_name.includes(' - ')) {
          const nameParts = item.product_name.split(' - ');
          productName = nameParts[0];
          variantName = nameParts[1];
        }
        
        if (!repeatOrderMap.has(key)) {
          repeatOrderMap.set(key, {
            productId: baseProductId,
            productName: variantName || productName,
            variantId: variantId,
            variantName: variantName,
            quantities: [],
            units: [],
            rates: [],
            orderDates: []
          });
        }
        
        const entry = repeatOrderMap.get(key)!;
        entry.quantities.push(item.quantity);
        entry.units.push(item.unit || 'KG');
        entry.rates.push(item.rate || 0);
        entry.orderDates.push(order.created_at);
      }
    }

    // Calculate repeat order suggestions with confidence scores
    const repeatOrderSuggestions: RepeatOrderSuggestion[] = [];
    const totalOrders = retailerOrders?.length || 0;

    for (const [key, data] of repeatOrderMap.entries()) {
      const orderCount = data.quantities.length;
      const frequency = totalOrders > 0 ? orderCount / totalOrders : 0;
      
      // Calculate typical quantity (mode or median)
      const sortedQty = [...data.quantities].sort((a, b) => a - b);
      const typicalQty = sortedQty[Math.floor(sortedQty.length / 2)];
      const avgQty = data.quantities.reduce((a, b) => a + b, 0) / data.quantities.length;
      
      // Most common unit
      const unitCounts = data.units.reduce((acc, u) => {
        acc[u] = (acc[u] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const preferredUnit = Object.entries(unitCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'KG';
      
      // Recency score (0-1, higher if ordered recently)
      const lastOrderDate = new Date(data.orderDates[0]);
      const daysSinceLast = Math.floor((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));
      const recencyScore = Math.max(0, 1 - (daysSinceLast / 90));
      
      // Consistency score (lower variance = higher score)
      const variance = data.quantities.reduce((sum, q) => sum + Math.pow(q - avgQty, 2), 0) / data.quantities.length;
      const stdDev = Math.sqrt(variance);
      const consistencyScore = avgQty > 0 ? Math.max(0, 1 - (stdDev / avgQty)) : 0;
      
      // Final confidence score
      const confidence = (frequency * 0.5) + (recencyScore * 0.3) + (consistencyScore * 0.2);
      
      // Get most recent rate
      const latestRate = data.rates.length > 0 ? data.rates[0] : 0;
      
      repeatOrderSuggestions.push({
        productId: data.productId,
        productName: data.productName,
        variantId: data.variantId,
        variantName: data.variantName,
        quantity: typicalQty,
        unit: preferredUnit,
        rate: latestRate,
        confidence: Math.round(confidence * 100) / 100,
        orderCount,
        lastOrdered: data.orderDates[0],
        avgQuantity: Math.round(avgQty * 10) / 10
      });
    }

    // Sort by confidence and take top 15
    repeatOrderSuggestions.sort((a, b) => b.confidence - a.confidence);
    const topRepeatOrders = repeatOrderSuggestions.slice(0, 15);

    console.log('🔄 Repeat order suggestions:', topRepeatOrders.length);

    // 3. Fetch beat trending products (last 30 days)
    let beatTrendingSuggestions: BeatTrendingSuggestion[] = [];
    
    if (beatId) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Get all retailers in this beat
      const { data: beatRetailers, error: beatRetailersError } = await supabase
        .from('retailers')
        .select('id')
        .eq('beat_id', beatId)
        .eq('is_active', true);

      if (!beatRetailersError && beatRetailers && beatRetailers.length > 0) {
        const beatRetailerIds = beatRetailers.map(r => r.id);
        const totalBeatRetailers = beatRetailerIds.length;

        // Get orders from beat retailers
        const { data: beatOrders, error: beatOrdersError } = await supabase
          .from('orders')
          .select(`
            retailer_id,
            order_items (
              variant_id,
              product_name,
              quantity,
              unit,
              rate
            )
          `)
          .in('retailer_id', beatRetailerIds)
          .gte('created_at', thirtyDaysAgo.toISOString())
          .eq('status', 'confirmed');

        if (!beatOrdersError && beatOrders) {
          // Analyze product popularity in beat
          const beatProductMap = new Map<string, {
            productId: string;
            productName: string;
            variantId?: string;
            variantName?: string;
            retailerIds: Set<string>;
            quantities: number[];
            units: string[];
            rates: number[];
          }>();

          for (const order of beatOrders) {
            for (const item of order.order_items || []) {
              const key = item.product_id;
              const { baseProductId, variantId } = parseProductId(item.product_id);
              
              // Extract variant name from product_name if it contains " - "
              let productName = item.product_name;
              let variantName: string | undefined = undefined;
              if (item.product_name.includes(' - ')) {
                const nameParts = item.product_name.split(' - ');
                productName = nameParts[0];
                variantName = nameParts[1];
              }
              
              if (!beatProductMap.has(key)) {
                beatProductMap.set(key, {
                  productId: baseProductId,
                  productName: variantName || productName,
                  variantId: variantId,
                  variantName: variantName,
                  retailerIds: new Set(),
                  quantities: [],
                  units: [],
                  rates: []
                });
              }
              
              const entry = beatProductMap.get(key)!;
              entry.retailerIds.add(order.retailer_id);
              entry.quantities.push(item.quantity);
              entry.units.push(item.unit || 'KG');
              entry.rates.push(item.rate || 0);
            }
          }

          // Products ordered by current retailer (to exclude from cross-sell)
          const currentRetailerProducts = new Set(
            Array.from(repeatOrderMap.keys())
          );

          // Lower threshold to 20% for trending and also suggest popular products 
          // that current retailer orders LESS frequently than others in beat
          for (const [key, data] of beatProductMap.entries()) {
            const penetration = data.retailerIds.size / totalBeatRetailers;
            
            // Suggest if penetration >= 20% AND current retailer hasn't ordered recently
            // (relaxed condition - also suggest if retailer ordered but much less frequently)
            if (penetration >= 0.20 && !currentRetailerProducts.has(key)) {
              // Calculate suggested quantity (median of beat orders)
              const sortedQty = [...data.quantities].sort((a, b) => a - b);
              const suggestedQty = sortedQty[Math.floor(sortedQty.length / 2)];
              
              // Most common unit
              const unitCounts = data.units.reduce((acc, u) => {
                acc[u] = (acc[u] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);
              const preferredUnit = Object.entries(unitCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'KG';
              
              // Get most recent rate
              const latestRate = data.rates.length > 0 ? data.rates[data.rates.length - 1] : 0;
              
              beatTrendingSuggestions.push({
                productId: data.productId,
                productName: data.productName,
                variantId: data.variantId,
                variantName: data.variantName,
                suggestedQuantity: suggestedQty,
                unit: preferredUnit,
                rate: latestRate,
                beatPenetration: Math.round(penetration * 100),
                retailerCount: data.retailerIds.size,
                totalBeatRetailers,
                reason: `${Math.round(penetration * 100)}% of retailers in this beat order this`
              });
            }
          }

          // Sort by penetration and take top 10
          beatTrendingSuggestions.sort((a, b) => b.beatPenetration - a.beatPenetration);
          beatTrendingSuggestions = beatTrendingSuggestions.slice(0, 10);
        }
      }
    }

    console.log('📈 Beat trending suggestions:', beatTrendingSuggestions.length);

    // 4. Analyze upsell opportunities (larger pack sizes)
    const upsellSuggestions: UpsellSuggestion[] = [];

    // Get products that retailer orders to check for larger variants
    const orderedProductIds = Array.from(repeatOrderMap.values())
      .filter(p => !p.variantId) // Only base products for upsell analysis
      .map(p => p.productId);

    if (orderedProductIds.length > 0) {
      // Fetch products with their variants
      const { data: productsWithVariants, error: productsError } = await supabase
        .from('products')
        .select(`
          id,
          name,
          rate,
          unit,
          variants:product_variants (
            id,
            variant_name,
            price,
            is_active
          )
        `)
        .in('id', orderedProductIds)
        .eq('is_active', true);

      if (!productsError && productsWithVariants) {
        for (const product of productsWithVariants) {
          if (!product.variants || product.variants.length < 2) continue;
          
          // Find the variant the retailer typically orders
          const retailerData = repeatOrderMap.get(product.id);
          if (!retailerData) continue;

          // Check for variants with size indicators (e.g., 40G, 250G, 1KG)
          const activeVariants = product.variants.filter((v: any) => v.is_active !== false);
          
          // Parse sizes from variant names
          const variantSizes = activeVariants.map((v: any) => {
            const match = v.variant_name.match(/(\d+)\s*(g|gm|gram|kg|kilo)/i);
            if (match) {
              let size = parseInt(match[1]);
              const unit = match[2].toLowerCase();
              // Normalize to grams
              if (unit === 'kg' || unit === 'kilo') {
                size *= 1000;
              }
              return { variant: v, sizeInGrams: size, pricePerGram: v.price / size };
            }
            return null;
          }).filter(Boolean);

          if (variantSizes.length < 2) continue;

          // Sort by size
          variantSizes.sort((a: any, b: any) => a.sizeInGrams - b.sizeInGrams);

          // Find current variant ordered by retailer
          const currentVariantId = retailerData.variantId;
          const currentVariantData = variantSizes.find((v: any) => v.variant.id === currentVariantId);
          
          if (!currentVariantData) {
            // Retailer orders base product, suggest smallest variant as baseline
            const smallest = variantSizes[0];
            const largest = variantSizes[variantSizes.length - 1];
            
            if (smallest && largest && smallest !== largest) {
              const savingsPercent = ((smallest.pricePerGram - largest.pricePerGram) / smallest.pricePerGram) * 100;
              
              if (savingsPercent >= 10) {
                upsellSuggestions.push({
                  currentProductId: product.id,
                  currentProductName: product.name,
                  suggestedProductId: product.id,
                  suggestedProductName: product.name,
                  suggestedVariantId: largest.variant.id,
                  suggestedVariantName: largest.variant.variant_name,
                  currentSize: 'Base',
                  suggestedSize: largest.variant.variant_name,
                  savingsPercent: Math.round(savingsPercent),
                  reason: `Save ${Math.round(savingsPercent)}% per unit with larger pack`
                });
              }
            }
          } else {
            // Find larger variant with better price per gram
            const largerVariants = variantSizes.filter((v: any) => 
              v.sizeInGrams > currentVariantData.sizeInGrams && 
              v.pricePerGram < currentVariantData.pricePerGram
            );
            
            if (largerVariants.length > 0) {
              // Suggest the one with best savings
              const bestUpgrade = largerVariants.reduce((best: any, curr: any) => 
                !best || curr.pricePerGram < best.pricePerGram ? curr : best
              , null);
              
              if (bestUpgrade) {
                const savingsPercent = ((currentVariantData.pricePerGram - bestUpgrade.pricePerGram) / currentVariantData.pricePerGram) * 100;
                
                if (savingsPercent >= 10) {
                  upsellSuggestions.push({
                    currentProductId: product.id,
                    currentProductName: product.name,
                    currentVariantId: currentVariantData.variant.id,
                    suggestedProductId: product.id,
                    suggestedProductName: product.name,
                    suggestedVariantId: bestUpgrade.variant.id,
                    suggestedVariantName: bestUpgrade.variant.variant_name,
                    currentSize: currentVariantData.variant.variant_name,
                    suggestedSize: bestUpgrade.variant.variant_name,
                    savingsPercent: Math.round(savingsPercent),
                    reason: `Save ${Math.round(savingsPercent)}% per unit with ${bestUpgrade.variant.variant_name}`
                  });
                }
              }
            }
          }
        }
      }
    }

    // Limit upsell suggestions
    const topUpsellSuggestions = upsellSuggestions.slice(0, 5);

    console.log('⬆️ Upsell suggestions:', topUpsellSuggestions.length);

    const response: SmartBasketResponse = {
      repeatOrder: topRepeatOrders,
      beatTrending: beatTrendingSuggestions,
      upsell: topUpsellSuggestions,
      summary: {
        repeatOrderCount: topRepeatOrders.length,
        potentialCrossSell: beatTrendingSuggestions.length,
        upsellOpportunities: topUpsellSuggestions.length,
        retailerOrderHistory: totalOrders
      }
    };

    console.log('🧺 Smart Basket: Analysis complete', response.summary);

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Smart Basket Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
