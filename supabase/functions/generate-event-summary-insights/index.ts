import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMPTY_INSIGHTS = {
  narrative: '',
  highlights: [] as string[],
  watchouts: [] as string[],
};

// Pre-format every money figure as an Indian Rupee string before it reaches
// the model, so the model only ever echoes a value — it never formats or
// invents currency itself (left to its own devices it defaults to $).
const inr = (n: unknown) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);
    if (userError || !user) {
      console.error('Auth error:', userError);
      throw new Error('Unauthorized');
    }

    // The caller (EventSummary page) already has all of this computed
    // client-side from orders/order_items/event_stock_items — sending it
    // straight through avoids re-deriving the same KPIs server-side.
    const { event, kpis, dayWise, topProducts, topCustomers } = await req.json();

    const context = {
      event: {
        name: event?.name,
        place: event?.place,
        type: event?.type,
        date: event?.date,
        status: event?.status,
      },
      kpis: {
        totalRevenue: inr(kpis?.totalRevenue),
        totalOrders: kpis?.totalOrders,
        totalCustomers: kpis?.customers,
        itemsSold: kpis?.itemsSold,
        grossMarginPct: `${(Number(kpis?.margin) || 0).toFixed(1)}%`,
      },
      dayWise: (dayWise || []).slice(0, 14).map((d: any) => ({ ...d, revenue: inr(d.revenue) })),
      topProducts: (topProducts || []).slice(0, 10).map((p: any) => ({ ...p, revenue: inr(p.revenue) })),
      topCustomers: (topCustomers || []).slice(0, 10).map((c: any) => ({ ...c, revenue: inr(c.revenue) })),
    };

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
            content: `You are a sales operations analyst writing a short performance summary for a field sales event (e.g. a promotional stall, trade activation, or in-store push). You are given the event's real recorded orders, day-wise sales, top products, and top customers. The reader already sees Total Revenue, Total Orders, Total Customers, Items Sold, and Gross Margin as headline numbers directly above your summary — do not restate those same four totals, focus on what they don't already see. Respond in JSON with exactly these fields:

1. narrative: A 2-4 sentence executive summary of how the event performed, written plainly for a sales manager — no fluff. Go beyond the headline totals: talk about concentration, spread, timing, or standout behavior.
2. highlights: An array of 3-5 short strings, each one concrete positive or notable fact NOT already one of the five headline totals (e.g. a standout product, a strong customer, a good conversion pattern).
3. watchouts: An array of 0-3 short strings flagging things worth a manager's attention (e.g. low product spread, a customer who didn't reorder, timing issues) — omit generic advice, only flag things the data actually shows. Return an empty array if nothing stands out.

All money figures in the data are already formatted as Indian Rupee strings (e.g. "₹2,008") — reuse them exactly as given, character for character. Never write "$", "USD", or reformat a currency value yourself. Only use facts present in the data. Do not invent numbers. Keep every string under 25 words.`,
          },
          {
            role: 'user',
            content: `Summarize this event's performance: ${JSON.stringify(context, null, 2)}`,
          },
        ],
        temperature: 0.5,
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

    let insights: typeof EMPTY_INSIGHTS;
    try {
      const jsonMatch = aiContent?.match(/\{[\s\S]*\}/);
      insights = jsonMatch ? { ...EMPTY_INSIGHTS, ...JSON.parse(jsonMatch[0]) } : { ...EMPTY_INSIGHTS };
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      insights = { ...EMPTY_INSIGHTS };
    }

    return new Response(
      JSON.stringify({ success: true, insights }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in generate-event-summary-insights:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
