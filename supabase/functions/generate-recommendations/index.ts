import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('Not authenticated');
    }

    const { recommendationType, entityId } = await req.json();

    // Fetch relevant data based on recommendation type
    let contextData: any = {};
    
    if (recommendationType === 'beat_visit') {
      contextData = await fetchBeatVisitData(supabaseClient, user.id);
    } else if (recommendationType === 'retailer_priority') {
      contextData = await fetchRetailerPriorityData(supabaseClient, user.id, entityId);
    } else if (recommendationType === 'discussion_points') {
      contextData = await fetchDiscussionPointsData(supabaseClient, user.id, entityId);
    } else if (recommendationType === 'beat_performance') {
      contextData = await fetchBeatPerformanceData(supabaseClient, entityId);
    } else if (recommendationType === 'optimal_day') {
      contextData = await fetchOptimalDayData(supabaseClient, entityId);
    }

    // Generate AI recommendation
    const aiResponse = await generateAIRecommendation(recommendationType, contextData);

    // Log what we're about to insert for debugging
    const insertData = {
      user_id: user.id,
      recommendation_type: recommendationType,
      entity_id: entityId || null,
      entity_name: contextData.entityName || null,
      recommendation_data: aiResponse.recommendation,
      confidence_score: aiResponse.confidence,
      reasoning: aiResponse.reasoning,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    };
    
    console.log('Inserting recommendation with data:', JSON.stringify(insertData, null, 2));
    console.log('Recommendation type:', typeof recommendationType, recommendationType);

    // Store recommendation
    const { data: recommendation, error: insertError } = await supabaseClient
      .from('recommendations')
      .insert(insertData)
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ recommendation }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error generating recommendation:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchBeatVisitData(supabase: any, userId: string) {
  // Fetch beats with last visit dates
  const { data: beats } = await supabase
    .from('beats')
    .select('*')
    .eq('created_by', userId)
    .eq('is_active', true);

  // Fetch retailers per beat
  const { data: retailers } = await supabase
    .from('retailers')
    .select('beat_id, potential, last_visit_date, order_value')
    .eq('user_id', userId)
    .eq('status', 'active');

  // Fetch recent orders
  const { data: orders } = await supabase
    .from('orders')
    .select('retailer_id, total_amount, created_at')
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });

  return { beats, retailers, orders };
}

async function fetchRetailerPriorityData(supabase: any, userId: string, beatId: string) {
  // Fetch retailers in the beat
  const { data: retailers } = await supabase
    .from('retailers')
    .select('*')
    .eq('user_id', userId)
    .eq('beat_id', beatId)
    .eq('status', 'active');

  // Fetch order history for these retailers
  const retailerIds = retailers?.map((r: any) => r.id) || [];
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .in('retailer_id', retailerIds)
    .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });

  return { retailers, orders, entityName: beatId };
}

async function fetchDiscussionPointsData(supabase: any, userId: string, retailerId: string) {
  // Fetch retailer details
  const { data: retailer } = await supabase
    .from('retailers')
    .select('*')
    .eq('id', retailerId)
    .single();

  // Fetch retailer's order history
  const { data: orders } = await supabase
    .from('orders')
    .select('*, order_items!order_items_order_id_fkey(*)')
    .eq('retailer_id', retailerId)
    .order('created_at', { ascending: false })
    .limit(10);

  // Fetch active schemes
  const { data: schemes } = await supabase
    .from('product_schemes')
    .select('*')
    .eq('is_active', true)
    .gte('end_date', new Date().toISOString().split('T')[0]);

  // Fetch competitors in area
  const { data: competitors } = await supabase
    .from('competition_insights')
    .select('*')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  // Fetch similar retailers performance
  const { data: similarRetailers } = await supabase
    .from('retailers')
    .select('id, name, order_value')
    .eq('beat_id', retailer.beat_id)
    .neq('id', retailerId)
    .order('order_value', { ascending: false })
    .limit(5);

  return { retailer, orders, schemes, competitors, similarRetailers, entityName: retailer.name };
}

async function fetchBeatPerformanceData(supabase: any, beatId: string) {
  // Fetch retailers in beat
  const { data: retailers } = await supabase
    .from('retailers')
    .select('id')
    .eq('beat_id', beatId);

  const retailerIds = retailers?.map((r: any) => r.id) || [];

  // Fetch orders trend (last 6 months)
  const { data: orders } = await supabase
    .from('orders')
    .select('total_amount, created_at')
    .in('retailer_id', retailerIds)
    .gte('created_at', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true });

  // Fetch beat info
  const { data: beat } = await supabase
    .from('beats')
    .select('*')
    .eq('beat_id', beatId)
    .single();

  return { beat, orders, retailerCount: retailerIds.length, entityName: beat?.beat_name };
}

async function fetchOptimalDayData(supabase: any, beatId: string) {
  // Fetch retailers in beat
  const { data: retailers } = await supabase
    .from('retailers')
    .select('id')
    .eq('beat_id', beatId);

  const retailerIds = retailers?.map((r: any) => r.id) || [];

  // Fetch historical orders with day of week
  const { data: orders } = await supabase
    .from('orders')
    .select('created_at, total_amount')
    .in('retailer_id', retailerIds)
    .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

  // Fetch beat plans (historical visits)
  const { data: beatPlans } = await supabase
    .from('beat_plans')
    .select('plan_date')
    .eq('beat_id', beatId)
    .gte('plan_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

  const { data: beat } = await supabase
    .from('beats')
    .select('beat_name')
    .eq('beat_id', beatId)
    .single();

  return { orders, beatPlans, entityName: beat?.beat_name };
}

async function generateAIRecommendation(type: string, data: any) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  const prompts: any = {
    beat_visit: `Analyze the following beat and retailer data to recommend which beat should be visited next. Consider:
- Time since last visit (prioritize beats not visited recently)
- Number of retailers in each beat
- Order value potential
- Retailer potential levels

Data: ${JSON.stringify(data)}

Provide:
1. Top 3 recommended beats with priority scores (0-1)
2. Clear reasoning for each recommendation
3. Estimated visit impact`,

    retailer_priority: `Analyze retailers in this beat and recommend visit priorities. Consider:
- Last visit date (prioritize not visited recently)
- Potential level (high, medium, low)
- Historical order value and growth trends
- Order frequency

Data: ${JSON.stringify(data)}

Return a JSON array (no extra fields) with top 5 retailers in this EXACT format:
[
  {
    "name": "Retailer Name",
    "score": 0.9,
    "reason": "One clear sentence explaining why they should be visited (max 30 words)"
  }
]

Keep reasons concise and action-oriented. Focus on the key insight (e.g., "Not visited in 45 days with high potential" or "Consistent high-value orders showing 25% growth").`,

    discussion_points: `Generate 5-7 personalized conversation points for this retailer visit. Use:
- Previous orders and buying patterns
- Active schemes and promotions
- Competitor insights in the area
- Performance compared to similar retailers
- Cross-sell and up-sell opportunities

Data: ${JSON.stringify(data)}

Provide specific, actionable discussion points that will help:
1. Gather feedback
2. Share territory insights
3. Suggest products based on history
4. Highlight relevant schemes
5. Encourage growth`,

    beat_performance: `Predict beat performance for the next 30 days based on historical trends. Analyze:
- Order value trends over last 6 months
- Number of retailers and their potential
- Seasonal patterns if any
- Growth rate

Data: ${JSON.stringify(data)}

Provide:
1. Predicted performance (revenue estimate)
2. Confidence level (0-1)
3. Key factors influencing prediction
4. Recommendations to maximize performance`,

    optimal_day: `Analyze historical data to recommend the best day of the week to visit this beat. Consider:
- Days when orders are typically placed
- Historical visit patterns
- Order success rates by day

Data: ${JSON.stringify(data)}

Provide:
1. Recommended day of week
2. Alternative best days
3. Reasoning based on data patterns
4. Expected benefits of visiting on that day`,
  };

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
          content: 'You are an expert sales territory analyst. Provide clear, actionable recommendations. Always return valid JSON only, no markdown formatting, no explanatory text. Keep recommendations concise and human-readable.',
        },
        {
          role: 'user',
          content: prompts[type],
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (response.status === 402) {
      throw new Error('AI credits exhausted. Please add credits to your workspace.');
    }
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const aiData = await response.json();
  let content = aiData.choices[0].message.content;

  // Remove markdown code blocks if present
  content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // Try to parse as JSON
  try {
    const parsed = JSON.parse(content);
    
    // For retailer_priority, the array IS the recommendation
    if (type === 'retailer_priority' && Array.isArray(parsed)) {
      return {
        recommendation: parsed,
        confidence: 0.85,
        reasoning: `Prioritization based on visit history, potential, and growth trends`,
      };
    }
    
    return {
      recommendation: parsed.recommendation || parsed,
      confidence: parsed.confidence || 0.8,
      reasoning: parsed.reasoning || 'AI-generated recommendation based on data analysis',
    };
  } catch (error) {
    console.error('Failed to parse AI response:', error);
    console.error('Content:', content);
    return {
      recommendation: content,
      confidence: 0.7,
      reasoning: content,
    };
  }
}
