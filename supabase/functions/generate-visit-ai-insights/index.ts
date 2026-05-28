import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // Create admin Supabase client for database operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Verify the JWT token to get user info
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);
    if (userError || !user) {
      console.error('Auth error:', userError);
      throw new Error('Unauthorized');
    }

    console.log('Authenticated user:', user.id);

    const { retailerId, territoryId } = await req.json();

    // Fetch retailer data
    const { data: retailer } = await supabaseClient
      .from('retailers')
      .select('*, distributor_id')
      .eq('id', retailerId)
      .single();

    // Fetch retailer's order history
    const { data: orderHistory } = await supabaseClient
      .from('orders')
      .select('*, order_items!order_items_order_id_fkey(product_id, product_name, quantity, rate)')
      .eq('retailer_id', retailerId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Get products the retailer has bought
    const purchasedProductIds = new Set(
      orderHistory?.flatMap(order => 
        order.order_items?.map((item: any) => item.product_id) || []
      ) || []
    );

    // Get all products
    const { data: allProducts } = await supabaseClient
      .from('products')
      .select('id, name, category_id, categories(name)');

    // Find products not purchased by this retailer
    const notPurchasedProducts = allProducts?.filter(
      (product) => !purchasedProductIds.has(product.id)
    ) || [];

    // Get similar retailers in the same territory
    const { data: similarRetailers } = await supabaseClient
      .from('retailers')
      .select('id, name, address')
      .neq('id', retailerId)
      .limit(20);

    // Get orders from similar retailers to find what they buy
    const { data: similarRetailerOrders } = await supabaseClient
      .from('orders')
      .select('retailer_id, order_items!order_items_order_id_fkey(product_id, product_name, quantity, rate, total_amount)')
      .in('retailer_id', similarRetailers?.map(r => r.id) || [])
      .order('created_at', { ascending: false })
      .limit(100);

    // Get territory information
    const { data: territory } = await supabaseClient
      .from('territories')
      .select('*')
      .eq('id', territoryId || retailer?.territory_id)
      .single();

    // Get active schemes
    const { data: schemes } = await supabaseClient
      .from('schemes')
      .select('*')
      .eq('is_active', true)
      .gte('valid_to', new Date().toISOString());

    // Calculate retailer metrics
    const totalOrders = orderHistory?.length || 0;
    const totalRevenue = orderHistory?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Prepare context for AI
    const context = {
      retailer: {
        name: retailer?.name,
        address: retailer?.address,
        totalOrders,
        totalRevenue,
        avgOrderValue,
        lastOrderDate: orderHistory?.[0]?.created_at,
      },
      recentOrders: orderHistory?.slice(0, 3).map(order => ({
        date: order.created_at,
        amount: order.total_amount,
        items: order.order_items?.map((item: any) => ({
          product: item.product_name,
          quantity: item.quantity,
          rate: item.rate,
        })) || [],
      })),
      notPurchasedProducts: notPurchasedProducts.slice(0, 10).map(p => ({
        name: p.name,
        category: p.categories?.name,
      })),
      similarRetailerProducts: Array.from(
        new Set(
          similarRetailerOrders?.flatMap(order => 
            order.order_items?.map((item: any) => item.product_name) || []
          ) || []
        )
      ).slice(0, 15),
      territory: {
        name: territory?.name,
        pincode_ranges: territory?.pincode_ranges,
      },
      activeSchemes: schemes?.map(s => ({
        name: s.name,
        description: s.description,
        valid_to: s.valid_to,
      })),
    };

    // Generate AI insights using Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a sales AI assistant helping field sales representatives have productive conversations with retailers. Generate actionable insights in JSON format with these sections:

1. crossSell: Array of 3-5 products to cross-sell with reasoning and potential margin
2. upSell: Array of 2-3 opportunities to increase order value
3. questions: Array of 5-7 short questions to ask the retailer, each with:
   - question: The question text
   - category: One of ["trends", "cross-sell", "competition", "feedback", "growth"]
   - options: Array of 3-4 multiple choice options for the answer
4. territoryInsights: 2-3 insights about the territory to create FOMO
5. marketingInitiatives: 2-3 current marketing programs to share

Keep everything concise and actionable. Focus on revenue growth and relationship building.`,
          },
          {
            role: 'user',
            content: `Generate insights for retailer: ${JSON.stringify(context, null, 2)}`,
          },
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error('Failed to generate AI insights');
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    let insights;
    try {
      // Try to parse JSON from the response
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      insights = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        crossSell: [],
        upSell: [],
        questions: [],
        territoryInsights: [],
        marketingInitiatives: [],
      };
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      insights = {
        crossSell: [],
        upSell: [],
        questions: [],
        territoryInsights: [],
        marketingInitiatives: [],
        rawResponse: aiContent,
      };
    }

    // Store the insights in the database for future reference
    await supabaseClient.from('visit_ai_insights').insert({
      user_id: user.id,
      retailer_id: retailerId,
      insights,
      created_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ success: true, insights }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in generate-visit-ai-insights:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
