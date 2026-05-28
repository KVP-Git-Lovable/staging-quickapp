import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Learning resources by competency
const learningResources: Record<string, { title: string; url: string; type: 'video' | 'article' }[]> = {
  FSE_TERRITORY_COVERAGE: [
    { title: "Route Planning Mastery for Sales Reps", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", type: 'video' },
    { title: "Territory Management Best Practices", url: "https://www.salesforce.com/resources/articles/territory-management/", type: 'article' },
    { title: "Beat Planning Strategy in FMCG", url: "https://www.youtube.com/watch?v=abc123", type: 'video' }
  ],
  FSE_SALES_GROWTH: [
    { title: "SPIN Selling Technique", url: "https://www.youtube.com/watch?v=xyz789", type: 'video' },
    { title: "How to Close More Sales", url: "https://hbr.org/2020/03/how-to-sell", type: 'article' },
    { title: "Building Retailer Relationships", url: "https://www.youtube.com/watch?v=rel123", type: 'video' }
  ],
  FSE_RETAILER_DEV: [
    { title: "New Account Acquisition Strategies", url: "https://www.youtube.com/watch?v=new123", type: 'video' },
    { title: "Retailer Onboarding Best Practices", url: "https://www.hubspot.com/customer-onboarding", type: 'article' },
    { title: "Market Mapping for Sales Growth", url: "https://www.youtube.com/watch?v=map456", type: 'video' }
  ],
  FSE_PRODUCT_MIX: [
    { title: "Cross-Selling and Upselling Techniques", url: "https://www.youtube.com/watch?v=cross123", type: 'video' },
    { title: "Understanding SKU Productivity", url: "https://www.retaildive.com/sku-optimization/", type: 'article' },
    { title: "Product Knowledge Training", url: "https://www.youtube.com/watch?v=prod789", type: 'video' }
  ],
  FSE_COLLECTION: [
    { title: "Effective Collection Strategies", url: "https://www.youtube.com/watch?v=coll123", type: 'video' },
    { title: "Managing Credit in Retail", url: "https://www.forbes.com/credit-management/", type: 'article' },
    { title: "Building Payment Discipline with Retailers", url: "https://www.youtube.com/watch?v=pay456", type: 'video' }
  ],
  FSE_DISCIPLINE: [
    { title: "Time Management for Field Sales", url: "https://www.youtube.com/watch?v=time123", type: 'video' },
    { title: "Building Professional Habits", url: "https://hbr.org/2019/10/habits-of-successful-salespeople", type: 'article' },
    { title: "Attendance and Productivity", url: "https://www.youtube.com/watch?v=att789", type: 'video' }
  ],
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, competencyId, monthYear, competencyCode, competencyName, rawMetrics, score, language } = await req.json();
    
    if (!userId || !competencyCode) {
      throw new Error("Missing required parameters");
    }

    console.log(`Generating improvement tips for user ${userId}, competency ${competencyCode}`);

    // Fetch user's retailer data
    const { data: retailers } = await supabase
      .from('retailers')
      .select('id, retailer_name, monthly_potential, orders(total_amount)')
      .eq('user_id', userId)
      .order('monthly_potential', { ascending: false })
      .limit(10);

    // Fetch user's order patterns
    const { data: orders } = await supabase
      .from('orders')
      .select('retailer_id, total_amount, items:order_items!order_items_order_id_fkey(product_id, quantity)')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(50);

    // Fetch colleague's top products (for comparison)
    const { data: topProducts } = await supabase
      .from('order_items')
      .select('product_id, products(name)')
      .limit(20);

    // Analyze retailer performance
    const retailerInsights = analyzeRetailers(retailers || [], orders || []);
    
    // Analyze product opportunities
    const productInsights = analyzeProducts(orders || [], topProducts || []);

    // Generate AI recommendations
    let recommendations;
    
    if (lovableApiKey) {
      const prompt = buildAIPrompt(competencyCode, competencyName, score, rawMetrics, retailerInsights, productInsights, language);
      
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${lovableApiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { 
              role: "system", 
              content: `You are a sales coach providing personalized improvement recommendations. ${language !== 'en' ? `Respond in ${getLanguageName(language)} language.` : ''} Be specific, actionable, and encouraging.` 
            },
            { role: "user", content: prompt }
          ],
        }),
      });

      if (!aiResponse.ok) {
        if (aiResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error("Failed to generate recommendations");
      }

      const aiResult = await aiResponse.json();
      const content = aiResult.choices?.[0]?.message?.content;
      
      try {
        let jsonStr = content;
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1];
        }
        recommendations = JSON.parse(jsonStr);
      } catch {
        // If JSON parsing fails, create structured response from text
        recommendations = {
          summary: content.substring(0, 300),
          actionItems: extractBulletPoints(content),
          retailerInsights: retailerInsights.slice(0, 3),
          productInsights: productInsights.slice(0, 3),
          resources: learningResources[competencyCode] || learningResources.FSE_SALES_GROWTH
        };
      }
    } else {
      // Fallback without AI
      recommendations = generateFallbackRecommendations(competencyCode, competencyName, score, retailerInsights, productInsights);
    }

    // Ensure resources are included
    if (!recommendations.resources || recommendations.resources.length === 0) {
      recommendations.resources = learningResources[competencyCode] || learningResources.FSE_SALES_GROWTH;
    }

    return new Response(
      JSON.stringify({ success: true, recommendations }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error generating improvement tips:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function analyzeRetailers(retailers: any[], orders: any[]): string[] {
  const insights: string[] = [];
  
  // Find high-potential, low-order retailers
  const orderByRetailer = new Map<string, number>();
  orders.forEach(o => {
    const current = orderByRetailer.get(o.retailer_id) || 0;
    orderByRetailer.set(o.retailer_id, current + (o.total_amount || 0));
  });

  retailers.forEach(r => {
    const orderValue = orderByRetailer.get(r.id) || 0;
    const potential = r.monthly_potential || 10000;
    const achievement = (orderValue / potential) * 100;
    
    if (achievement < 50 && potential > 5000) {
      insights.push(`Focus on ${r.retailer_name} - only ${achievement.toFixed(0)}% of ₹${potential.toLocaleString()} potential achieved`);
    }
  });

  if (insights.length === 0) {
    insights.push("Great job! Your retailer coverage is strong. Look for new retailers to add to your portfolio.");
  }

  return insights.slice(0, 5);
}

function analyzeProducts(orders: any[], topProducts: any[]): string[] {
  const insights: string[] = [];
  
  // Count products sold by user
  const productsSold = new Set<string>();
  orders.forEach(o => {
    (o.items || []).forEach((item: any) => {
      if (item.product_id) productsSold.add(item.product_id);
    });
  });

  // Find products others sell that user doesn't
  const topProductIds = new Set(topProducts.map(p => p.product_id));
  const missing = [...topProductIds].filter(id => !productsSold.has(id));
  
  if (missing.length > 0) {
    const missingProducts = topProducts.filter(p => missing.includes(p.product_id));
    missingProducts.slice(0, 3).forEach(p => {
      insights.push(`Try selling ${p.products?.name || 'this product'} - it's popular with other colleagues`);
    });
  }

  if (insights.length === 0) {
    insights.push("You have a good product mix. Consider introducing new SKUs to retailers.");
  }

  return insights.slice(0, 5);
}

function buildAIPrompt(code: string, name: string, score: number, metrics: any, retailerInsights: string[], productInsights: string[], language: string): string {
  return `Generate personalized improvement recommendations for a field sales executive.

Competency: ${name} (${code})
Current Score: ${score.toFixed(1)}%
Metrics: ${JSON.stringify(metrics)}

Retailer Analysis:
${retailerInsights.join('\n')}

Product Analysis:
${productInsights.join('\n')}

${language !== 'en' ? `IMPORTANT: Respond in ${getLanguageName(language)} language.` : ''}

Respond with JSON in this exact format:
{
  "summary": "A brief 2-3 sentence personalized assessment",
  "actionItems": ["Specific action 1", "Specific action 2", "Specific action 3", "Specific action 4"],
  "retailerInsights": ["Retailer-specific tip 1", "Retailer-specific tip 2"],
  "productInsights": ["Product-specific tip 1", "Product-specific tip 2"],
  "resources": []
}

Be very specific and reference the actual data provided. Make recommendations actionable and achievable within 2-4 weeks.`;
}

function getLanguageName(code: string): string {
  const names: Record<string, string> = {
    hi: 'Hindi',
    kn: 'Kannada',
    gu: 'Gujarati',
    mr: 'Marathi',
    ta: 'Tamil',
    te: 'Telugu',
    ml: 'Malayalam'
  };
  return names[code] || 'English';
}

function extractBulletPoints(text: string): string[] {
  const lines = text.split('\n');
  const bullets: string[] = [];
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.match(/^\d+\./)) {
      bullets.push(trimmed.replace(/^[-•\d.]+\s*/, ''));
    }
  });
  return bullets.slice(0, 5);
}

function generateFallbackRecommendations(code: string, name: string, score: number, retailerInsights: string[], productInsights: string[]) {
  return {
    summary: `Your ${name} score is ${score.toFixed(1)}%. ${score >= 70 ? 'You\'re doing well!' : 'There\'s room for improvement.'} Focus on the action items below to boost your performance.`,
    actionItems: [
      `Review your ${name.toLowerCase()} metrics daily`,
      "Set specific weekly targets for this competency",
      "Track progress and adjust your approach",
      "Discuss improvement strategies with your manager"
    ],
    retailerInsights,
    productInsights,
    resources: learningResources[code] || learningResources.FSE_SALES_GROWTH
  };
}
