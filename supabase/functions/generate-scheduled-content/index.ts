import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TemplateSubscription {
  id: string;
  user_id: string;
  template_id: string;
  template_type: string;
  template_name: string;
  schedule_time: string;
  custom_settings: any;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Authenticate cron job requests using CRON_SECRET
  const cronSecret = Deno.env.get('CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  
  if (!cronSecret) {
    console.error('CRON_SECRET environment variable is not set');
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  if (providedSecret !== cronSecret) {
    console.warn('Unauthorized access attempt to generate-scheduled-content');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('Authenticated request received for scheduled content generation');
    const body = await req.json().catch(() => ({}));
    const { regenerate_post_id } = body;

    // Handle single post regeneration
    if (regenerate_post_id) {
      console.log(`Regenerating post: ${regenerate_post_id}`);
      return await handlePostRegeneration(supabase, regenerate_post_id);
    }

    // Handle scheduled batch generation
    console.log('Starting scheduled content generation...');
    const currentHour = new Date().getHours();
    const currentTime = `${currentHour.toString().padStart(2, '0')}:00`;

    // Get active subscriptions for current time
    const { data: subscriptions, error: subsError } = await supabase
      .from('user_push_content_subscriptions')
      .select(`
        id,
        user_id,
        template_id,
        schedule_time,
        custom_settings,
        push_content_templates (
          id,
          template_type,
          template_name
        )
      `)
      .eq('is_active', true)
      .eq('schedule_time', currentTime);

    if (subsError) {
      console.error('Error fetching subscriptions:', subsError);
      throw subsError;
    }

    console.log(`Found ${subscriptions?.length || 0} active subscriptions for ${currentTime}`);

    const results = [];
    
    for (const sub of subscriptions || []) {
      const subscription: TemplateSubscription = {
        id: sub.id,
        user_id: sub.user_id,
        template_id: sub.template_id,
        template_type: (sub.push_content_templates as any).template_type,
        template_name: (sub.push_content_templates as any).template_name,
        schedule_time: sub.schedule_time,
        custom_settings: sub.custom_settings || {}
      };

      try {
        console.log(`Processing subscription for user ${subscription.user_id}, template: ${subscription.template_type}`);
        
        const content = await generateContentForTemplate(supabase, subscription);
        
        if (!content) {
          console.log(`No content generated for ${subscription.template_type} - skipping`);
          await logExecution(supabase, subscription, 'skipped', 'No data available');
          results.push({ userId: subscription.user_id, status: 'skipped' });
          continue;
        }

        // Create social post
        const { data: post, error: postError } = await supabase
          .from('social_posts')
          .insert({
            user_id: subscription.user_id,
            content: content.text,
            image_url: content.image_url,
            is_automated: true,
            template_id: subscription.template_id,
            post_metadata: content.metadata,
            scheduled_time: new Date().toISOString()
          })
          .select()
          .single();

        if (postError) {
          console.error(`Error creating post for user ${subscription.user_id}:`, postError);
          await logExecution(supabase, subscription, 'failed', postError.message);
          results.push({ userId: subscription.user_id, status: 'failed', error: postError.message });
          continue;
        }

        console.log(`Successfully created post ${post.id} for user ${subscription.user_id}`);
        await logExecution(supabase, subscription, 'success', null, post.id);
        results.push({ userId: subscription.user_id, status: 'success', postId: post.id });

      } catch (error) {
        console.error(`Error processing subscription ${subscription.id}:`, error);
        await logExecution(supabase, subscription, 'failed', error.message);
        results.push({ userId: subscription.user_id, status: 'failed', error: error.message });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: results.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-scheduled-content:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function handlePostRegeneration(supabase: any, postId: string) {
  try {
    // Get the existing post details
    const { data: post, error: postError } = await supabase
      .from('social_posts')
      .select(`
        *,
        push_content_templates(template_type, template_name)
      `)
      .eq('id', postId)
      .eq('is_automated', true)
      .single();

    if (postError || !post) {
      throw new Error('Post not found or is not automated');
    }

    const subscription: TemplateSubscription = {
      id: postId,
      user_id: post.user_id,
      template_id: post.template_id,
      template_type: post.push_content_templates.template_type,
      template_name: post.push_content_templates.template_name,
      schedule_time: '',
      custom_settings: {}
    };

    // Generate new content
    const content = await generateContentForTemplate(supabase, subscription);

    if (!content) {
      return new Response(
        JSON.stringify({ error: 'No content generated' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the existing post
    const { error: updateError } = await supabase
      .from('social_posts')
      .update({
        content: content.text,
        image_url: content.image_url,
        post_metadata: content.metadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', postId);

    if (updateError) throw updateError;

    await logExecution(supabase, subscription, 'success', null, postId);

    return new Response(
      JSON.stringify({ success: true, postId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error regenerating post:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function generateContentForTemplate(supabase: any, subscription: TemplateSubscription) {
  const today = new Date().toISOString().split('T')[0];

  switch (subscription.template_type) {
    case 'day_summary':
      return await generateDaySummary(supabase, subscription.user_id, today);
    case 'next_day_plan':
      return await generateNextDayPlan(supabase, subscription.user_id);
    case 'performance':
      return await generatePerformanceUpdate(supabase, subscription.user_id);
    case 'new_retailers':
      return await generateNewRetailersPost(supabase, subscription.user_id, today);
    case 'focused_products':
      return await generateFocusedProductsPost(supabase, subscription.user_id, today);
    case 'order_summary':
      return await generateOrderSummary(supabase, subscription.user_id, today);
    case 'outstanding_payments':
      return await generateOutstandingPayments(supabase, subscription.user_id);
    case 'custom':
      return null; // Custom templates handled separately
    default:
      console.warn(`Unknown template type: ${subscription.template_type}`);
      return null;
  }
}

async function generateDaySummary(supabase: any, userId: string, date: string) {
  // Fetch today's visits
  const { data: visits } = await supabase
    .from('visits')
    .select('*, retailers(name)')
    .eq('user_id', userId)
    .eq('planned_date', date);

  // Fetch today's orders
  const { data: orders } = await supabase
    .from('orders')
    .select('total_amount, status')
    .eq('user_id', userId)
    .eq('order_date', date);

  // Fetch today's expenses
  const { data: expenses } = await supabase
    .from('expenses')
    .select('amount')
    .eq('user_id', userId)
    .eq('expense_date', date);

  // Calculate metrics
  const totalVisits = visits?.length || 0;
  const completedVisits = visits?.filter(v => v.status === 'completed').length || 0;
  const totalOrders = orders?.filter(o => o.status === 'confirmed').length || 0;
  const totalSales = orders?.filter(o => o.status === 'confirmed').reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
  const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

  if (totalVisits === 0) return null;

  const productiveVisits = visits?.filter(v => 
    orders?.some(o => o.status === 'confirmed' && visits.some(visit => visit.id === o.visit_id))
  ).length || 0;

  const text = `📊 **Today's Performance Summary** (${new Date(date).toLocaleDateString()})

✅ **Visits:** ${completedVisits}/${totalVisits} completed (${totalVisits > 0 ? Math.round((completedVisits/totalVisits) * 100) : 0}%)
🎯 **Productivity:** ${productiveVisits}/${totalVisits} productive visits
💰 **Sales:** ₹${totalSales.toLocaleString()} from ${totalOrders} orders
💳 **Expenses:** ₹${totalExpenses.toLocaleString()}

${totalOrders > 0 ? `Average order value: ₹${Math.round(totalSales / totalOrders).toLocaleString()}` : ''}
${productiveVisits > 0 ? `\n🌟 Great job converting ${Math.round((productiveVisits/totalVisits) * 100)}% of visits to orders!` : ''}`;

  return {
    text,
    metadata: {
      date,
      totalVisits,
      completedVisits,
      totalOrders,
      totalSales,
      totalExpenses,
      productiveVisits
    }
  };
}

async function generateNextDayPlan(supabase: any, userId: string) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDate = tomorrow.toISOString().split('T')[0];

  // Fetch tomorrow's planned visits
  const { data: visits } = await supabase
    .from('visits')
    .select('*, retailers(name, address, phone, beat_name)')
    .eq('user_id', userId)
    .eq('planned_date', tomorrowDate)
    .order('planned_date', { ascending: true });

  if (!visits || visits.length === 0) return null;

  const beatGroups = visits.reduce((acc: any, visit: any) => {
    const beatName = visit.retailers?.beat_name || 'Unassigned';
    if (!acc[beatName]) acc[beatName] = [];
    acc[beatName].push(visit);
    return acc;
  }, {});

  let text = `📅 **Tomorrow's Visit Plan** (${tomorrow.toLocaleDateString()})\n\n`;
  text += `📍 Total Visits: ${visits.length}\n\n`;

  for (const [beatName, beatVisits] of Object.entries(beatGroups)) {
    text += `**${beatName}** (${(beatVisits as any[]).length} visits)\n`;
    (beatVisits as any[]).forEach((visit, idx) => {
      text += `${idx + 1}. ${visit.retailers?.name || 'Unknown'}\n`;
    });
    text += '\n';
  }

  text += `💡 Make sure to check inventory and prepare schemes before starting!`;

  return {
    text,
    metadata: {
      date: tomorrowDate,
      totalVisits: visits.length,
      beatGroups: Object.keys(beatGroups)
    }
  };
}

async function generatePerformanceUpdate(supabase: any, userId: string) {
  const today = new Date();
  const lastWeekStart = new Date(today);
  lastWeekStart.setDate(today.getDate() - 7);

  // Fetch last 7 days orders
  const { data: orders } = await supabase
    .from('orders')
    .select('total_amount, order_date, status')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .gte('order_date', lastWeekStart.toISOString().split('T')[0]);

  // Fetch gamification points
  const { data: points } = await supabase
    .from('gamification_points')
    .select('points, awarded_at')
    .eq('user_id', userId)
    .gte('awarded_at', lastWeekStart.toISOString());

  if (!orders || orders.length === 0) return null;

  const totalSales = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const totalPoints = points?.reduce((sum, p) => sum + Number(p.points), 0) || 0;

  const text = `📈 **Weekly Performance Update**

📊 Last 7 Days:
💰 Sales: ₹${totalSales.toLocaleString()} (${orders.length} orders)
🏆 Points Earned: ${totalPoints}
📈 Average Order: ₹${Math.round(totalSales / orders.length).toLocaleString()}

${totalSales > 50000 ? '🌟 Outstanding performance this week!' : ''}
${totalPoints > 500 ? '🎯 Great job on gamification activities!' : ''}`;

  return {
    text,
    metadata: {
      period: '7days',
      totalSales,
      totalOrders: orders.length,
      totalPoints
    }
  };
}

async function generateNewRetailersPost(supabase: any, userId: string, date: string) {
  const { data: retailers } = await supabase
    .from('retailers')
    .select('name, address, beat_name, category')
    .eq('user_id', userId)
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`);

  if (!retailers || retailers.length === 0) return null;

  let text = `🆕 **New Retailers Added Today**\n\n`;
  text += `Added ${retailers.length} new retailer${retailers.length > 1 ? 's' : ''} to your network!\n\n`;

  retailers.forEach((r, idx) => {
    text += `${idx + 1}. **${r.name}**\n`;
    text += `   📍 Beat: ${r.beat_name || 'Unassigned'}\n`;
    text += `   🏪 Category: ${r.category || 'General'}\n\n`;
  });

  text += `🎯 Schedule visits to build relationships and secure first orders!`;

  return {
    text,
    metadata: {
      date,
      newRetailersCount: retailers.length
    }
  };
}

async function generateFocusedProductsPost(supabase: any, userId: string, date: string) {
  // Fetch orders with focused products
  const { data: orders } = await supabase
    .from('orders')
    .select('order_items!order_items_order_id_fkey(*)')
    .eq('user_id', userId)
    .eq('order_date', date)
    .eq('status', 'confirmed');

  if (!orders || orders.length === 0) return null;

  // Get product details
  const productIds = orders.flatMap(o => o.order_items?.map((i: any) => i.product_id) || []);
  const { data: products } = await supabase
    .from('products')
    .select('id, name, is_focused')
    .in('id', productIds);

  const focusedSold = products?.filter(p => p.is_focused).length || 0;
  const totalProducts = products?.length || 0;

  if (focusedSold === 0) return null;

  const text = `🎯 **Focused Products Performance**

Today's Results:
✅ Focused Products Sold: ${focusedSold}
📦 Total Products Sold: ${totalProducts}
📊 Focus Rate: ${Math.round((focusedSold / totalProducts) * 100)}%

${focusedSold > 5 ? '🌟 Excellent focus on priority products!' : '💡 Keep pushing focused products for bonus points!'}`;

  return {
    text,
    metadata: {
      date,
      focusedSold,
      totalProducts
    }
  };
}

async function generateOrderSummary(supabase: any, userId: string, date: string) {
  const { data: orders } = await supabase
    .from('orders')
    .select('*, retailers(name), order_items!order_items_order_id_fkey(*)')
    .eq('user_id', userId)
    .eq('order_date', date)
    .eq('status', 'confirmed');

  if (!orders || orders.length === 0) return null;

  const totalAmount = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const totalItems = orders.reduce((sum, o) => sum + (o.order_items?.length || 0), 0);

  let text = `📦 **Today's Order Summary**\n\n`;
  text += `🎯 Total Orders: ${orders.length}\n`;
  text += `💰 Total Value: ₹${totalAmount.toLocaleString()}\n`;
  text += `📊 Total Items: ${totalItems}\n\n`;

  text += `**Top Orders:**\n`;
  orders
    .sort((a, b) => Number(b.total_amount) - Number(a.total_amount))
    .slice(0, 3)
    .forEach((order, idx) => {
      text += `${idx + 1}. ${order.retailers?.name}: ₹${Number(order.total_amount).toLocaleString()}\n`;
    });

  return {
    text,
    metadata: {
      date,
      totalOrders: orders.length,
      totalAmount,
      totalItems
    }
  };
}

async function generateOutstandingPayments(supabase: any, userId: string) {
  const { data: retailers } = await supabase
    .from('retailers')
    .select('name, pending_amount, phone')
    .eq('user_id', userId)
    .gt('pending_amount', 0)
    .order('pending_amount', { ascending: false });

  if (!retailers || retailers.length === 0) return null;

  const totalOutstanding = retailers.reduce((sum, r) => sum + Number(r.pending_amount), 0);

  let text = `💳 **Outstanding Payments Update**\n\n`;
  text += `📊 Total Outstanding: ₹${totalOutstanding.toLocaleString()}\n`;
  text += `👥 Retailers with Pending: ${retailers.length}\n\n`;

  text += `**Top Outstanding:**\n`;
  retailers.slice(0, 5).forEach((r, idx) => {
    text += `${idx + 1}. ${r.name}: ₹${Number(r.pending_amount).toLocaleString()}\n`;
  });

  text += `\n💡 Follow up with retailers to collect payments!`;

  return {
    text,
    metadata: {
      totalOutstanding,
      retailersCount: retailers.length
    }
  };
}

async function logExecution(
  supabase: any,
  subscription: TemplateSubscription,
  status: 'success' | 'failed' | 'skipped',
  errorMessage?: string | null,
  postId?: string | null
) {
  await supabase
    .from('push_content_execution_log')
    .insert({
      user_id: subscription.user_id,
      template_id: subscription.template_id,
      execution_time: new Date().toISOString(),
      status,
      error_message: errorMessage,
      post_id: postId,
      metadata: {
        template_type: subscription.template_type,
        schedule_time: subscription.schedule_time
      }
    });
}
