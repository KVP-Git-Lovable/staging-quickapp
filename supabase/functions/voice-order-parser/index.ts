import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript, productNames } = await req.json();
    
    if (!transcript) {
      return new Response(
        JSON.stringify({ error: 'No transcript provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing voice order transcript:', transcript);
    console.log('Available products count:', productNames?.length || 0);

    const systemPrompt = `You are an order parsing assistant for a sales app. Parse voice commands into structured product orders.

CRITICAL PATTERN - Users speak: "[product name with variant] [quantity] [unit]"
The product name includes the variant/size info, then quantity, then unit.

EXAMPLES:
- "adrak 20 gram 2 kg" → productSearch: "adrak 20 gram", quantity: 2, unit: "kg"
- "adarak 20g 5 kg" → productSearch: "adarak 20g", quantity: 5, unit: "kg"  
- "vayu 50 gram 3 pieces" → productSearch: "vayu 50 gram", quantity: 3, unit: "pieces"
- "haldi powder 2 kg" → productSearch: "haldi powder", quantity: 2, unit: "kg"
- "mirch 100g 10 packets" → productSearch: "mirch 100g", quantity: 10, unit: "packets"
- "adarak 20g 5" (no unit spoken) → productSearch: "adarak 20g", quantity: 5, unit: ""

RULES:
1. The product name/search term includes variant info (like "20 gram", "50g", "100ml")
2. The quantity is the number AFTER the product name
3. The unit is the measurement AFTER the quantity (kg, pieces, packets, etc.)
4. Handle Hindi/English mixed inputs (adrak, haldi, mirch, vayu, etc.)
5. If quantity is unclear, default to 1
6. If unit is unclear or not clearly spoken, return unit as an empty string "" — do NOT guess "kg". A wrong "kg" guess on a product actually sold by the gram multiplies the order size 1000x, so an uncertain unit must be left blank for the app to resolve from the product's own catalog unit, not guessed here.

AVAILABLE PRODUCTS (match product names to these):
${productNames?.slice(0, 100).join(', ') || 'No product list provided'}

Return ONLY a valid JSON array:
[
  {"productSearch": "adrak 20 gram", "quantity": 2, "unit": "kg"},
  {"productSearch": "vayu 50 gram", "quantity": 3, "unit": "pieces"}
]

If you cannot parse any products, return an empty array: []`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Parse this voice order: "${transcript}"` }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI service credits exhausted.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'AI processing failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || '[]';
    
    console.log('AI response:', aiResponse);

    // Parse the JSON from AI response
    let parsedOrders = [];
    try {
      // Try to extract JSON array from the response
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsedOrders = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      parsedOrders = [];
    }

    console.log('Parsed orders:', parsedOrders);

    return new Response(
      JSON.stringify({ orders: parsedOrders }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Voice order parser error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
