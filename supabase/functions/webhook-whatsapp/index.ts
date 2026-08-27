import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MEMORY_TTL = 30 * 60 * 1000; // 30 minutes
const CONTEXT_TTL = 30 * 60 * 1000; // 30 minutes for conversation context
const MAX_HISTORY = 10; // 5 exchanges

function getSupabaseClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key);
}

// ── Session Management ──────────────────────────────────────────────
interface Session {
  id: string;
  phone_number: string;
  state: string;
  retailer_id: string | null;
  retailer_name: string | null;
  owner_id: string | null;
  beat_id: string | null;
  territory_id: string | null;
  pending_items: any[];
  conversation_history: any[];
  last_active_at: string;
}

async function loadOrCreateSession(supabase: any, phone: string): Promise<Session> {
  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('phone_number', phone)
    .maybeSingle();

  if (error) console.error('Session load error:', error);

  if (data) {
    // Check TTL — reset if inactive too long
    const lastActive = new Date(data.last_active_at).getTime();
    if (Date.now() - lastActive > MEMORY_TTL) {
      console.log(`⏰ Session expired for ${phone}, resetting`);
      return await resetSession(supabase, phone, data.id);
    }
    return data as Session;
  }

  // Create new session
  const { data: newSession, error: insertErr } = await supabase
    .from('whatsapp_sessions')
    .insert({ phone_number: phone })
    .select()
    .single();

  if (insertErr) console.error('Session create error:', insertErr);
  return newSession as Session;
}

async function resetSession(supabase: any, phone: string, id: string): Promise<Session> {
  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .update({
      state: 'IDLE',
      retailer_id: null,
      retailer_name: null,
      owner_id: null,
      beat_id: null,
      territory_id: null,
      pending_items: [],
      conversation_history: [],
      last_active_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) console.error('Session reset error:', error);
  return data as Session;
}

async function saveSession(supabase: any, session: Session) {
  const { error } = await supabase
    .from('whatsapp_sessions')
    .update({
      state: session.state,
      retailer_id: session.retailer_id,
      retailer_name: session.retailer_name,
      owner_id: session.owner_id,
      beat_id: session.beat_id,
      territory_id: session.territory_id,
      pending_items: session.pending_items,
      conversation_history: session.conversation_history,
      last_active_at: new Date().toISOString(),
    })
    .eq('id', session.id);

  if (error) console.error('Session save error:', error);
}

// ── Gemini Tools ────────────────────────────────────────────────────
const allTools = [
  {
    functionDeclarations: [
      {
        name: "get_orders",
        description: "Fetches orders from the database for a given date range.",
        parameters: {
          type: "OBJECT",
          properties: {
            startDate: { type: "STRING", description: "Start date YYYY-MM-DD" },
            endDate: { type: "STRING", description: "End date YYYY-MM-DD" },
            status: { type: "STRING", description: "Order status filter" },
          },
          required: ["startDate", "endDate"],
        },
      },
      {
        name: "get_revenue_summary",
        description: "Gets total revenue and order count for a date range.",
        parameters: {
          type: "OBJECT",
          properties: {
            startDate: { type: "STRING", description: "Start date YYYY-MM-DD" },
            endDate: { type: "STRING", description: "End date YYYY-MM-DD" },
          },
          required: ["startDate", "endDate"],
        },
      },
      {
        name: "get_top_retailers",
        description: "Gets top retailers by order value for a date range.",
        parameters: {
          type: "OBJECT",
          properties: {
            startDate: { type: "STRING", description: "Start date YYYY-MM-DD" },
            endDate: { type: "STRING", description: "End date YYYY-MM-DD" },
            limit: { type: "NUMBER", description: "Number of top retailers. Default 5." },
          },
          required: ["startDate", "endDate"],
        },
      },
      {
        name: "get_products",
        description: "Fetches product catalog. Use when user asks about products.",
        parameters: {
          type: "OBJECT",
          properties: {
            activeOnly: { type: "BOOLEAN", description: "Filter active only. Default true." },
            category: { type: "STRING", description: "Filter by category name." },
          },
          required: [],
        },
      },
      {
        name: "get_retailer_info",
        description: "Fetches retailer details by name including address, total orders, total revenue. Use when user asks about a specific store/retailer like 'Tell me about XYZ store'.",
        parameters: {
          type: "OBJECT",
          properties: {
            retailerName: { type: "STRING", description: "The retailer/store name to look up" },
          },
          required: ["retailerName"],
        },
      },
      {
        name: "place_order",
        description: "Parses product names and quantities from user input for order placement. Use when the user wants to place an order and provides product names with quantities.",
        parameters: {
          type: "OBJECT",
          properties: {
            items: {
              type: "ARRAY",
              description: "Array of items to order",
              items: {
                type: "OBJECT",
                properties: {
                  productName: { type: "STRING", description: "Product name" },
                  quantity: { type: "NUMBER", description: "Quantity to order" },
                },
                required: ["productName", "quantity"],
              },
            },
          },
          required: ["items"],
        },
      },
    ],
  },
];

// ── Function Execution ──────────────────────────────────────────────
async function executeFunction(name: string, args: Record<string, any>, session: Session): Promise<any> {
  const supabase = getSupabaseClient();

  switch (name) {
    case "get_orders": {
      let query = supabase
        .from('orders')
        .select('id, retailer_name, total_amount, subtotal, discount_amount, status, order_date, payment_status, delivery_status')
        .gte('order_date', args.startDate)
        .lte('order_date', args.endDate)
        .order('order_date', { ascending: false })
        .limit(50);
      if (args.status) query = query.eq('status', args.status);
      const { data, error } = await query;
      if (error) return { error: error.message };
      return {
        total_orders: data?.length || 0,
        total_revenue: data?.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0) || 0,
        orders: data?.map((o: any) => ({
          id: o.id?.slice(0, 8), retailer: o.retailer_name, amount: o.total_amount,
          status: o.status, date: o.order_date, payment: o.payment_status, delivery: o.delivery_status,
        })) || [],
      };
    }

    case "get_revenue_summary": {
      const { data, error } = await supabase
        .from('orders')
        .select('total_amount, status, order_date')
        .gte('order_date', args.startDate)
        .lte('order_date', args.endDate);
      if (error) return { error: error.message };
      const confirmed = data?.filter((o: any) => o.status === 'confirmed') || [];
      const cancelled = data?.filter((o: any) => o.status === 'cancelled') || [];
      return {
        period: `${args.startDate} to ${args.endDate}`,
        total_orders: data?.length || 0,
        confirmed_orders: confirmed.length,
        cancelled_orders: cancelled.length,
        total_revenue: data?.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0) || 0,
        confirmed_revenue: confirmed.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0),
      };
    }

    case "get_top_retailers": {
      const limit = args.limit || 5;
      const { data, error } = await supabase
        .from('orders')
        .select('retailer_name, total_amount')
        .gte('order_date', args.startDate)
        .lte('order_date', args.endDate)
        .eq('status', 'confirmed');
      if (error) return { error: error.message };
      const map: Record<string, { total: number; count: number }> = {};
      (data || []).forEach((o: any) => {
        const n = o.retailer_name || 'Unknown';
        if (!map[n]) map[n] = { total: 0, count: 0 };
        map[n].total += Number(o.total_amount || 0);
        map[n].count++;
      });
      const sorted = Object.entries(map)
        .sort(([, a], [, b]) => b.total - a.total)
        .slice(0, limit)
        .map(([name, d]) => ({ retailer: name, total_value: d.total, order_count: d.count }));
      return { period: `${args.startDate} to ${args.endDate}`, top_retailers: sorted };
    }

    case "get_products": {
      const activeOnly = args.activeOnly !== false;
      let query = supabase
        .from('products')
        .select('id, name, sku, rate, unit, closing_stock, is_active, category:product_categories(name)');
      if (activeOnly) query = query.eq('is_active', true);
      const { data, error } = await query.order('name', { ascending: true });
      if (error) return { error: error.message };
      let products = (data || []).map((p: any) => ({
        id: p.id, name: p.name, sku: p.sku, rate: p.rate, unit: p.unit,
        category: p.category?.name || 'Uncategorized', stock: p.closing_stock,
      }));
      if (args.category) {
        const cl = args.category.toLowerCase();
        products = products.filter((p: any) => p.category.toLowerCase().includes(cl));
      }
      return { total_products: products.length, products };
    }

    case "get_retailer_info": {
      const { data: retailers, error: rErr } = await supabase
        .from('retailers')
        .select('id, name, address, phone, owner_name, state')
        .ilike('name', `%${args.retailerName}%`)
        .limit(5);
      if (rErr) return { error: rErr.message };
      if (!retailers || retailers.length === 0) return { message: `No retailer found matching "${args.retailerName}"` };

      const results = [];
      for (const r of retailers) {
        const { data: orders } = await supabase
          .from('orders')
          .select('total_amount, order_date')
          .eq('retailer_id', r.id);
        const totalOrders = orders?.length || 0;
        const totalRevenue = orders?.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0) || 0;
        const lastOrder = orders?.sort((a: any, b: any) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime())?.[0];
        results.push({
          name: r.name, address: r.address, phone: r.phone, owner: r.owner_name,
          state: r.state,
          total_orders: totalOrders, total_revenue: totalRevenue,
          last_order_date: lastOrder?.order_date || 'No orders yet',
        });
      }
      return { retailers: results };
    }

    case "place_order": {
      // This tool is used by Gemini to parse items — we handle the actual order logic separately
      return await handlePlaceOrderTool(supabase, args.items, session);
    }

    default:
      return { error: `Unknown function: ${name}` };
  }
}

// ── Order Placement Logic ───────────────────────────────────────────
async function handlePlaceOrderTool(supabase: any, items: any[], session: Session): Promise<any> {
  if (!items || items.length === 0) {
    return { error: "No items parsed from the message" };
  }

  // Match product names to actual products
  const matchedItems = [];
  const unmatchedItems = [];

  for (const item of items) {
    const { data: products } = await supabase
      .from('products')
      .select('id, name, rate, unit, category:product_categories(name)')
      .ilike('name', `%${item.productName}%`)
      .eq('is_active', true)
      .limit(1);

    if (products && products.length > 0) {
      const p = products[0];
      matchedItems.push({
        product_id: p.id,
        product_name: p.name,
        rate: p.rate,
        unit: p.unit,
        category: p.category?.name || 'Uncategorized',
        quantity: item.quantity,
        total: Number(p.rate) * item.quantity,
      });
    } else {
      unmatchedItems.push(item.productName);
    }
  }

  if (matchedItems.length === 0) {
    return { error: "Could not match any products", unmatched: unmatchedItems };
  }

  const orderTotal = matchedItems.reduce((s, i) => s + i.total, 0);

  // Store pending items in session
  session.pending_items = matchedItems;
  session.state = 'CONFIRMING_ORDER';

  return {
    matched_items: matchedItems.map(i => ({
      product: i.product_name, qty: i.quantity, unit: i.unit,
      rate: `₹${i.rate}`, total: `₹${i.total}`,
    })),
    unmatched_items: unmatchedItems,
    order_total: `₹${orderTotal.toFixed(2)}`,
    message: "Please confirm this order by replying 'Yes' or 'Confirm'. Reply 'Cancel' to discard.",
  };
}

async function confirmOrder(supabase: any, session: Session): Promise<string> {
  if (!session.retailer_id || !session.pending_items || session.pending_items.length === 0) {
    return "No pending order to confirm. Please start a new order.";
  }

  // Re-fetch retailer to get the correct auth user ID
  const { data: retailer, error: rErr } = await supabase
    .from('retailers')
    .select('owner_id, user_id, beat_id, territory_id')
    .eq('id', session.retailer_id)
    .single();

  if (rErr) {
    console.error('Retailer fetch error in confirmOrder:', rErr);
  }

  const assignedUserId = retailer?.owner_id || retailer?.user_id || session.owner_id;
  if (!assignedUserId) {
    console.error('No assigned auth user for retailer:', session.retailer_id);
    return "⚠️ Your account is not linked to a sales representative yet. Please contact your distributor to assign one, then try again.";
  }

  const items = session.pending_items;
  const subtotal = items.reduce((s: number, i: any) => s + Number(i.total), 0);
  const today = new Date().toISOString().split('T')[0];

  // Create order matching Customer Portal pattern
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      retailer_id: session.retailer_id,
      retailer_name: session.retailer_name,
      subtotal: subtotal,
      total_amount: subtotal,
      status: 'confirmed',
      order_date: today,
      order_source: 'whatsapp',
      user_id: assignedUserId,
      beat_id: retailer?.beat_id || session.beat_id || null,
      territory_id: retailer?.territory_id || session.territory_id || null,
    })
    .select('id, invoice_number')
    .single();

  if (orderErr) {
    console.error('Order creation error:', orderErr);
    return "Failed to create order. Please try again.";
  }

  // Insert order items
  const orderItems = items.map((i: any) => ({
    order_id: order.id,
    product_id: i.product_id,
    product_name: i.product_name,
    category: i.category,
    rate: i.rate,
    unit: i.unit,
    quantity: i.quantity,
    total: i.total,
  }));

  const { error: itemsErr } = await supabase
    .from('order_items')
    .insert(orderItems);

  if (itemsErr) {
    console.error('Order items error:', itemsErr);
    return "Order created but failed to add items. Please contact support.";
  }

  // Generate invoice message
  let invoice = `✅ *Order Confirmed!*\n`;
  invoice += `📋 Order ID: ${order.id.slice(0, 8)}\n`;
  invoice += `📅 Date: ${today}\n`;
  invoice += `🏪 Retailer: ${session.retailer_name}\n\n`;
  invoice += `*Items:*\n`;
  for (const item of items) {
    invoice += `• ${item.product_name} × ${item.quantity} ${item.unit} = ₹${Number(item.total).toFixed(2)}\n`;
  }
  invoice += `\n💰 *Total: ₹${subtotal.toFixed(2)}*\n`;
  invoice += `\nThank you for your order!`;

  // Also trigger the dedicated WhatsApp order confirmation edge function
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const confirmRes = await fetch(`${supabaseUrl}/functions/v1/send-order-confirmation-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ orderId: order.id, retailerId: session.retailer_id }),
    });
    const confirmResult = await confirmRes.json();
    console.log('📨 Order confirmation edge function result:', JSON.stringify(confirmResult));
  } catch (confirmErr) {
    console.error('⚠️ Failed to trigger order confirmation edge function:', confirmErr);
  }

  // Reset session
  session.state = 'IDLE';
  session.pending_items = [];

  return invoice;
}

async function findRetailerByPhone(supabase: any, phone: string): Promise<any | null> {
  // Strip WhatsApp prefix: "whatsapp:+919741435887" → try exact matches
  const raw = phone.replace('whatsapp:', '').replace('+', '').trim();
  const digits10 = raw.startsWith('91') && raw.length === 12 ? raw.slice(2) : raw;
  
  // Try exact matches: 10-digit, with 91 prefix, with +91 prefix
  const variants = [digits10, `91${digits10}`, `+91${digits10}`];
  
  const { data, error } = await supabase
    .from('retailers')
    .select('id, name, phone, beat_id, territory_id, owner_id, user_id')
    .in('phone', variants)
    .limit(1);

  if (error) {
    console.error('Retailer phone lookup error:', error);
    return null;
  }
  return data?.[0] || null;
}

// ── Conversation Context Helpers ─────────────────────────────────────
interface UserContext {
  phone: string;
  last_intent: string | null;
  last_entity: Record<string, any>;
  last_order_id: string | null;
  updated_at: string;
}

async function loadContext(supabase: any, phone: string): Promise<UserContext | null> {
  const { data, error } = await supabase
    .from('user_context')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (error || !data) return null;

  // Check TTL — ignore if older than 30 minutes
  const updatedAt = new Date(data.updated_at).getTime();
  if (Date.now() - updatedAt > CONTEXT_TTL) {
    console.log(`⏰ Context expired for ${phone}`);
    return null;
  }

  return data as UserContext;
}

async function saveContext(
  supabase: any,
  phone: string,
  intent: string,
  entity: Record<string, any> = {},
  orderId: string | null = null
): Promise<void> {
  const { error } = await supabase
    .from('user_context')
    .upsert({
      phone,
      last_intent: intent,
      last_entity: entity,
      last_order_id: orderId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'phone' });

  if (error) console.error('Context save error:', error);
}

// ── Follow-Up Query Handler ─────────────────────────────────────────
async function handleFollowUpQuery(
  supabase: any,
  phone: string,
  message: string
): Promise<string | null> {
  const lower = message.toLowerCase().trim();

  // Detect follow-up phrases
  const followUpPatterns = [
    'what are those', 'show them', 'list them', 'list products',
    'tell me more', 'show me', 'batao', 'dikhao', 'kya hai',
    'which ones', 'what products', 'show all',
  ];

  const isFollowUp = followUpPatterns.some(p => lower.includes(p));
  if (!isFollowUp) return null;

  const context = await loadContext(supabase, phone);
  if (!context || !context.last_intent) {
    return "Could you clarify what you're referring to? You can ask about products, orders, or delivery status.";
  }

  if (context.last_intent === 'product_list') {
    // Fetch and return full product list
    const { data: products } = await supabase
      .from('products')
      .select('name, rate, unit, category:product_categories(name)')
      .eq('is_active', true)
      .order('name')
      .limit(100);

    if (!products || products.length === 0) {
      return "No products found in the catalog right now.";
    }

    let reply = `📦 *Product List (${products.length} items):*\n\n`;
    for (const p of products) {
      reply += `• ${p.name} — ₹${p.rate}/${p.unit || 'unit'} (${p.category?.name || 'Uncategorized'})\n`;
    }
    return reply;
  }

  if (context.last_intent === 'order_query' && context.last_order_id) {
    // Re-fetch that order's status
    const { data: order } = await supabase
      .from('orders')
      .select('id, status, delivery_status, payment_status, total_amount, order_date')
      .eq('id', context.last_order_id)
      .maybeSingle();

    if (order) {
      return `📦 *Order #${order.id.substring(0, 8)}*\n📊 Status: ${order.status}\n🚚 Delivery: ${order.delivery_status || 'Pending'}\n💰 Total: ₹${Number(order.total_amount).toFixed(2)}`;
    }
  }

  return "Could you clarify what you're referring to? You can ask about products, orders, or delivery status.";
}

// ── Delivery Query Handler ──────────────────────────────────────────
async function handleDeliveryQuery(
  supabase: any,
  phone: string,
  message: string
): Promise<string | null> {
  const lower = message.toLowerCase();

  const deliveryPatterns = [
    'when will i receive', 'delivery status', 'order delivery',
    'kab milega', 'kab aayega', 'delivery kab', 'when will my order',
    'order kab aayega', 'mera order kab',
  ];

  const isDeliveryQuery = deliveryPatterns.some(p => lower.includes(p));
  if (!isDeliveryQuery) return null;

  const retailer = await findRetailerByPhone(supabase, phone);
  if (!retailer) {
    return "I couldn't find an account linked to this number. Please contact your sales representative.";
  }

  // Check context for last_order_id
  const context = await loadContext(supabase, phone);
  let order: any = null;

  if (context?.last_order_id) {
    const { data } = await supabase
      .from('orders')
      .select('id, status, delivery_status, total_amount, order_date, created_at')
      .eq('id', context.last_order_id)
      .maybeSingle();
    order = data;
  }

  if (!order) {
    // Fetch latest order for this retailer
    const { data } = await supabase
      .from('orders')
      .select('id, status, delivery_status, total_amount, order_date, created_at')
      .eq('retailer_id', retailer.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    order = data;
  }

  if (!order) {
    return "❌ No orders found for your account yet.";
  }

  const shortId = order.id.substring(0, 8);
  const orderDate = order.order_date || order.created_at?.split('T')[0] || 'N/A';
  const deliveryStatus = order.delivery_status || 'Pending';

  let expectedDelivery = '';
  if (deliveryStatus === 'delivered') {
    expectedDelivery = '✅ Your order has been delivered!';
  } else if (deliveryStatus === 'dispatched' || deliveryStatus === 'in_transit') {
    expectedDelivery = '🚚 Your order is on the way! Expected delivery within 1-2 days.';
  } else {
    expectedDelivery = '📋 Your order is being processed. Expected delivery within 2-3 business days.';
  }

  // Save context
  await saveContext(supabase, phone, 'order_query', {}, order.id);

  return `🚚 *Delivery Status*\n\n🆔 Order: #${shortId}\n📅 Ordered: ${orderDate}\n📊 Status: ${order.status}\n🚚 Delivery: ${deliveryStatus}\n💰 Total: ₹${Number(order.total_amount).toFixed(2)}\n\n${expectedDelivery}`;
}

// ── Order Status Query Handler ──────────────────────────────────────
async function handleOrderStatusQuery(
  supabase: any,
  phone: string,
  message: string
): Promise<string | null> {
  const lower = message.toLowerCase();
  // Intent detection: must contain "order" and "status"
  const isStatusQuery = (lower.includes('order') && lower.includes('status')) ||
    lower.includes('order status');
  if (!isStatusQuery) return null;

  // Find retailer by phone
  const retailer = await findRetailerByPhone(supabase, phone);
  if (!retailer) {
    return "I couldn't find an account linked to this number. Please contact your sales representative.";
  }

  // Extract order ID via regex (UUID or short ID)
  const idMatch = message.match(/order\s*#?\s*([a-f0-9-]{8,36})/i);
  const orderId = idMatch ? idMatch[1] : null;

  let query = supabase
    .from('orders')
    .select('id, status, delivery_status, payment_status, total_amount, order_date, invoice_number, created_at')
    .eq('retailer_id', retailer.id);

  if (orderId) {
    query = query.ilike('id', `${orderId}%`);
  } else {
    query = query.order('created_at', { ascending: false }).limit(1);
  }

  const { data: orders, error } = await query;
  if (error) {
    console.error('Order status query error:', error);
    return "Sorry, I couldn't fetch order details right now. Please try again later.";
  }

  const order = orders?.[0];
  if (!order) {
    return orderId
      ? `❌ No order found with ID #${orderId}. Please check your order ID and try again.`
      : "❌ No orders found for your account yet.";
  }

  const shortId = order.id.substring(0, 8);
  const orderDate = order.order_date || order.created_at?.split('T')[0] || 'N/A';
  const total = order.total_amount != null ? `₹${Number(order.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'N/A';

  return `📦 *Order Status*

🆔 Order: #${shortId}
📅 Date: ${orderDate}
📊 Status: ${order.status || 'N/A'}
🚚 Delivery: ${order.delivery_status || 'Pending'}
💳 Payment: ${order.payment_status || 'Pending'}
💰 Total: ${total}`;
}
// ── Retailer Info Query Handler ─────────────────────────────────────
async function handleRetailerInfoQuery(
  supabase: any,
  phone: string,
  message: string
): Promise<string | null> {
  const lower = message.toLowerCase();

  const isRetailerInfoQuery =
    /\b(my\s*(store|shop|details|retailer|revenue|orders|performance|info))\b/.test(lower) ||
    /\b(store\s*details|retailer\s*details)\b/.test(lower) ||
    /\b(how\s*many\s*orders|total\s*orders|total\s*revenue)\b/.test(lower) ||
    /\b(tell\s*me\s*about\s*my\s*(store|shop))\b/.test(lower) ||
    /\b(give\s*me\s*my\s*(performance|details))\b/.test(lower) ||
    /\b(show\s*my\s*(retailer|store|shop)\s*details)\b/.test(lower);

  if (!isRetailerInfoQuery) return null;

  const retailer = await findRetailerByPhone(supabase, phone);
  if (!retailer) {
    return "I couldn't find a retailer account linked to this number. Please contact your sales representative to register.";
  }

  // Fetch full retailer details
  const { data: retailerDetails } = await supabase
    .from('retailers')
    .select('name, owner_name, address, city, state, phone')
    .eq('id', retailer.id)
    .single();

  // Fetch order stats
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, total_amount, created_at')
    .eq('retailer_id', retailer.id)
    .order('created_at', { ascending: false });

  if (ordersError) {
    console.error('Retailer info orders query error:', ordersError);
  }

  const totalOrders = orders?.length || 0;
  const totalRevenue = orders?.reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0) || 0;
  const lastOrderDate = orders?.[0]?.created_at?.split('T')[0] || 'N/A';
  const formattedRevenue = `₹${totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  const r = retailerDetails || {};
  const addressParts = [r.address, r.city, r.state].filter(Boolean).join(', ');

  return `📊 *Your Store Details*

🏪 Name: ${r.name || retailer.name || 'N/A'}
👤 Owner: ${r.owner_name || 'N/A'}
📍 Address: ${addressParts || 'N/A'}

📦 Total Orders: ${totalOrders}
💰 Total Revenue: ${formattedRevenue}
📅 Last Order: ${lastOrderDate}`;
}

// ── Product Count Query ─────────────────────────────────────────────
async function handleProductCountQuery(
  supabase: any,
  message: string
): Promise<string | null> {
  const lower = message.toLowerCase();

  // Never intercept order/delivery questions ("how many products did I
  // order?") — those belong to the existing handlers and the AI path.
  if (lower.includes('order') || lower.includes('deliver')) return null;

  const isProductCountQuery =
    /(how\s*many|number\s*of|total(\s*number\s*of)?|count\s*of)\s*(active\s*)?products/.test(lower) ||
    /\bproducts?\s*count\b/.test(lower) ||
    /\bkitne\s*products?\b/.test(lower) ||
    /\bproducts?\s*kitne\b/.test(lower);

  if (!isProductCountQuery) return null;

  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  if (error) {
    console.error('Product count query error:', error.message);
    return null; // fall through to the normal AI path
  }

  console.log(`📦 Product count intent matched — ${count} active products`);
  return `📦 We currently have *${count ?? 0}* active products in our catalog.`;
}

// ── Schemes / Discounts Query ───────────────────────────────────────
async function handleSchemesQuery(
  supabase: any,
  message: string
): Promise<string | null> {
  const lower = message.toLowerCase();

  // Order/delivery questions belong to the existing handlers and AI path.
  if (lower.includes('order') || lower.includes('deliver')) return null;

  if (!/\b(schemes?|offers?|discounts?)\b/.test(lower)) return null;

  const { data: schemes, error } = await supabase
    .from('product_schemes')
    .select('name, scheme_type, discount_percentage, discount_amount, buy_quantity, free_quantity, condition_quantity, min_order_value, buy_quantity_unit, product_id, category_id')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Schemes query error:', error.message);
    return null; // fall through to the normal AI path
  }

  if (!schemes || schemes.length === 0) {
    return 'There are no active schemes or offers right now.';
  }

  // Resolve target product/category names in one batched lookup each.
  const productIds = [...new Set(schemes.map((s: any) => s.product_id).filter(Boolean))];
  const categoryIds = [...new Set(schemes.map((s: any) => s.category_id).filter(Boolean))];
  const productNames = new Map<string, string>();
  const categoryNames = new Map<string, string>();
  if (productIds.length > 0) {
    const { data } = await supabase.from('products').select('id, name').in('id', productIds);
    for (const p of data || []) productNames.set(p.id, p.name);
  }
  if (categoryIds.length > 0) {
    const { data } = await supabase.from('product_categories').select('id, name').in('id', categoryIds);
    for (const c of data || []) categoryNames.set(c.id, c.name);
  }

  // Benefit wording is field-driven, not scheme_type-driven, because live
  // type strings vary (buy_x_get_y_free, manual_per_unit_discount, …).
  const describe = (s: any): string => {
    let benefit = '';
    if (Number(s.buy_quantity) > 0 && Number(s.free_quantity) > 0) {
      const unit = s.buy_quantity_unit ? ` ${s.buy_quantity_unit}` : '';
      benefit = `Buy ${s.buy_quantity}${unit} Get ${s.free_quantity} Free`;
    } else if (Number(s.discount_percentage) > 0) {
      benefit = `${Number(s.discount_percentage)}% Off`;
    } else if (Number(s.discount_amount) > 0) {
      benefit = `₹${Number(s.discount_amount)} Off`;
    }
    const target = s.product_id
      ? (productNames.get(s.product_id) || null)
      : s.category_id
        ? (categoryNames.get(s.category_id) ? `${categoryNames.get(s.category_id)} category` : null)
        : 'All products';
    const parts: string[] = [];
    if (benefit) parts.push(benefit);
    if (target) parts.push(`on ${target}`);
    if (Number(s.condition_quantity) > 0 && !(Number(s.buy_quantity) > 0 && Number(s.free_quantity) > 0)) {
      parts.push(`(min qty ${Number(s.condition_quantity)})`);
    }
    if (Number(s.min_order_value) > 0) parts.push(`(min order ₹${Number(s.min_order_value)})`);
    return parts.length > 0 ? `*${s.name}* — ${parts.join(' ')}` : `*${s.name}*`;
  };

  const MAX_LISTED = 8;
  const lines = schemes.slice(0, MAX_LISTED).map((s: any, i: number) => `${i + 1}. ${describe(s)}`);
  if (schemes.length > MAX_LISTED) {
    lines.push(`…and ${schemes.length - MAX_LISTED} more offers.`);
  }

  console.log(`🎁 Schemes intent matched — ${schemes.length} active schemes`);
  return `🎁 *Available Schemes & Offers (${schemes.length})*\n\n${lines.join('\n')}`;
}

// ── Outstanding Dues Query ──────────────────────────────────────────
async function handleDuesQuery(
  supabase: any,
  phone: string,
  message: string
): Promise<string | null> {
  const lower = message.toLowerCase();

  // Order/delivery questions belong to the existing handlers and AI path;
  // "points balance" belongs to the loyalty handler.
  if (lower.includes('order') || lower.includes('deliver')) return null;
  if (/\bpoints?\b/.test(lower)) return null;

  const isDuesQuery =
    /\b(dues?|outstanding|bakaya|baki)\b/.test(lower) ||
    /how\s*much\s*(do\s*)?i\s*owe/.test(lower) ||
    /\bpending\s*(amount|payment|balance)\b/.test(lower) ||
    /\bmy\s*(pending|balance)\b/.test(lower);

  if (!isDuesQuery) return null;

  const retailer = await findRetailerByPhone(supabase, phone);
  if (!retailer) {
    return "I couldn't find an account linked to this number. Please contact your sales representative.";
  }

  const { data } = await supabase
    .from('retailers')
    .select('pending_amount')
    .eq('id', retailer.id)
    .maybeSingle();
  const pending = Number(data?.pending_amount ?? 0) || 0;

  console.log(`💰 Dues intent matched — ₹${pending}`);
  return pending > 0
    ? `💰 *Outstanding Balance*\n\nHi *${retailer.name}*, your current outstanding balance is *₹${pending.toLocaleString('en-IN', { minimumFractionDigits: 2 })}*.\n\nPlease coordinate with your sales representative for payment.`
    : `✅ Great news, *${retailer.name}* — you have no outstanding balance right now!`;
}

// ── Loyalty Points Query ────────────────────────────────────────────
async function handleLoyaltyQuery(
  supabase: any,
  phone: string,
  message: string
): Promise<string | null> {
  const lower = message.toLowerCase();

  if (lower.includes('order') || lower.includes('deliver')) return null;

  const isLoyaltyQuery =
    /\b(loyalty|rewards?)\b/.test(lower) ||
    (/\bpoints?\b/.test(lower) && /\b(my|balance|how\s*many|total|kitne)\b/.test(lower));

  if (!isLoyaltyQuery) return null;

  const retailer = await findRetailerByPhone(supabase, phone);
  if (!retailer) {
    return "I couldn't find an account linked to this number. Please contact your sales representative.";
  }

  const [{ data: earnedRows }, { data: redemptionRows }] = await Promise.all([
    supabase.from('retailer_loyalty_points').select('points').eq('retailer_id', retailer.id),
    supabase
      .from('retailer_loyalty_redemptions')
      .select('points_redeemed, status')
      .eq('retailer_id', retailer.id),
  ]);

  const earned = (earnedRows ?? []).reduce((s: number, r: any) => s + (Number(r.points) || 0), 0);
  const redeemed = (redemptionRows ?? [])
    .filter((r: any) => !['rejected', 'cancelled'].includes(String(r.status ?? '').toLowerCase()))
    .reduce((s: number, r: any) => s + (Number(r.points_redeemed) || 0), 0);
  const balance = Math.max(0, earned - redeemed);

  console.log(`🌟 Loyalty intent matched — earned ${earned}, redeemed ${redeemed}`);
  return `🌟 *Loyalty Points — ${retailer.name}*\n\nEarned: ${earned}\nRedeemed: ${redeemed}\nAvailable balance: *${balance}*`;
}

// ── Next Visit Query ────────────────────────────────────────────────
async function handleNextVisitQuery(
  supabase: any,
  phone: string,
  message: string
): Promise<string | null> {
  const lower = message.toLowerCase();

  if (lower.includes('order') || lower.includes('deliver')) return null;

  const isNextVisitQuery =
    /\bnext\s*visit\b/.test(lower) ||
    (/\bwhen\b/.test(lower) && /\b(visit|come|coming)\b/.test(lower) &&
      /\b(salesman|sales\s*rep|representative|you|team)\b/.test(lower)) ||
    /\b(salesman|sales\s*rep|representative)\b.*\b(kab|aayega|aa\s*raha)\b/.test(lower);

  if (!isNextVisitQuery) return null;

  const retailer = await findRetailerByPhone(supabase, phone);
  if (!retailer) {
    return "I couldn't find an account linked to this number. Please contact your sales representative.";
  }

  const today = new Date().toISOString().split('T')[0];
  const { data: visit } = await supabase
    .from('visits')
    .select('planned_date, status')
    .eq('retailer_id', retailer.id)
    .gte('planned_date', today)
    .neq('status', 'cancelled')
    .order('planned_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  console.log(`📅 Next-visit intent matched — ${visit?.planned_date ?? 'none scheduled'}`);
  if (!visit) {
    return `📅 No upcoming visit is scheduled for your store yet. Your sales representative will plan one soon.`;
  }
  if (visit.planned_date === today) {
    return `📅 *Next Visit*\n\nGood news — your store is on *today's* visit plan!`;
  }
  const d = new Date(`${visit.planned_date}T00:00:00`);
  const label = Number.isNaN(d.getTime())
    ? visit.planned_date
    : d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  return `📅 *Next Visit*\n\nYour store is scheduled for a visit on *${label}*.`;
}

// ── Product Price Query ───────────────────────────────────────────
async function handlePriceQuery(
  supabase: any,
  message: string
): Promise<string | null> {
  const lower = message.toLowerCase();

  if (lower.includes('order') || lower.includes('deliver')) return null;
  if (!/\b(price|rate|cost|mrp)\b/.test(lower)) return null;

  // Extract the product term: "price of X" / "X ka price" / "X price".
  let term = '';
  const m1 = lower.match(/\b(?:price|rate|cost|mrp)\s+(?:of|for)\s+(.+?)[?.!\s]*$/);
  const m2 = lower.match(/^(.+?)\s+(?:ka\s+|ki\s+)?(?:price|rate|cost|mrp)\b/);
  if (m1) term = m1[1];
  else if (m2) term = m2[1];
  term = term
    .replace(/\b(the|a|an|what|whats|what's|is|are|tell|me|please|much|how)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Too vague to search deterministically — let the AI path handle it.
  if (!term || term.length < 2) return null;

  const { data: products } = await supabase
    .from('products')
    .select('name, rate, unit')
    .eq('is_active', true)
    .ilike('name', `%${term}%`)
    .order('name')
    .limit(5);

  if (!products || products.length === 0) {
    console.log(`🏷️ Price intent matched — no product for "${term}"`);
    return `I couldn't find a product matching "${term}" in our catalog.`;
  }

  console.log(`🏷️ Price intent matched — "${term}" → ${products.length} match(es)`);
  if (products.length === 1) {
    const p = products[0];
    return `🏷️ *${p.name}* — ₹${Number(p.rate).toFixed(2)}/${p.unit || 'unit'}`;
  }
  return (
    `🏷️ *Prices — matches for "${term}"*\n\n` +
    products.map((p: any) => `• ${p.name} — ₹${Number(p.rate).toFixed(2)}/${p.unit || 'unit'}`).join('\n')
  );
}

// ── System Prompt Builder ───────────────────────────────────────────
function buildSystemPrompt(today: string, session: Session): string {
  let prompt = `You are a field sales assistant for a distribution/sales app. Today's date is ${today}.

CRITICAL RULES — follow these without exception:
1. ALWAYS call a tool when the user asks about orders, revenue, sales, retailers, or products. NEVER ask for dates — default to the last 7 days if no dates are specified.
2. Interpret natural language dates relative to today (${today}).
3. If the user provides only dates, check conversation history for context. If unclear, use get_revenue_summary as default.
4. For single-word queries like "Orders" or "Revenue" — immediately call the relevant tool with the last 7 days.
5. Keep replies concise (2-4 lines) and format numbers with ₹ for Indian currency.
6. For general greetings, respond warmly and mention you can help with order queries, revenue, retailer insights, product info, and placing orders.
7. When the user asks about products — call get_products immediately.
8. When the user asks about a specific retailer/store (e.g., "Tell me about XYZ store") — call get_retailer_info with the retailer name.
9. NEVER say "please provide dates". Always infer or default.`;

  if (session.state === 'AWAITING_ORDER_DETAILS') {
    prompt += `\n\n⚠️ CURRENT STATE: The user is placing an order for retailer "${session.retailer_name}".
They need to tell you which products and quantities they want.
When they provide product names with quantities, use the place_order tool to parse them.
Example user input: "5 kg adrak, 3 packets vayu 50g, 2 kg haldi powder"
Parse these into structured items using the place_order tool.`;
  } else if (session.state === 'CONFIRMING_ORDER') {
    prompt += `\n\n⚠️ CURRENT STATE: The user has a pending order confirmation.
If they say yes/confirm/ok, the order will be confirmed.
If they say no/cancel, the order will be discarded.
Do NOT call any tools — just acknowledge their response naturally.`;
  }

  prompt += `\n\n10. When the user says "Place Order", "I want to order", or similar — tell them you'll help place an order and ask what products they'd like. The place_order tool will handle parsing.`;

  return prompt;
}

// ── Main Handler ────────────────────────────────────────────────────
// ── In-memory caches (warm-instance only, best-effort) ──────────────
const RETAILER_CACHE_TTL = 5 * 60 * 1000;
const retailerByPhoneCache = new Map<string, { value: any; expiresAt: number }>();
const recentMessageSids = new Map<string, number>(); // SID -> timestamp, for dedup
const MSG_DEDUP_TTL = 60 * 1000;

async function getRetailerCached(supabase: any, phone: string): Promise<any | null> {
  const cached = retailerByPhoneCache.get(phone);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await findRetailerByPhone(supabase, phone);
  retailerByPhoneCache.set(phone, { value, expiresAt: Date.now() + RETAILER_CACHE_TTL });
  return value;
}

function setRetailerCache(phone: string, value: any): void {
  retailerByPhoneCache.set(phone, { value, expiresAt: Date.now() + RETAILER_CACHE_TTL });
}

function getCachedRetailerName(phone: string): string {
  const cached = retailerByPhoneCache.get(phone);
  if (!cached || cached.expiresAt <= Date.now()) return '';
  return cleanDisplayName(cached.value?.name || '');
}

function cleanDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 60);
}

const GREETING_SET = new Set(['hi', 'hello', 'hey', 'namaste', 'hii', 'hiii', 'start', 'menu']);
const recentGreetings = new Map<string, number>();
const GREETING_DEDUP_TTL = 30_000;

function sendStaticGreetingTwiml(): Response {
  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Response><Message>Hello! I am your Field Sales Assistant. How can I help you today?</Message></Response>`;
  return new Response(twiml, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
  });
}

async function sendPlaceOrderTemplateAsync(phone: string): Promise<void> {
  try {
    await sendTwilioTemplate(phone);
  } catch (e) {
    console.error('❌ [bg] place-order template error:', e);
  }
}

serve(async (req) => {
  const t0 = performance.now();
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Warm-up ping endpoint: returns 200 immediately, no heavy work ──
  // Hit via GET ?ping=1 (or path ending /ping) to keep the instance hot.
  const url = new URL(req.url);
  if (req.method === 'GET' && (url.searchParams.get('ping') === '1' || url.pathname.endsWith('/ping'))) {
    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    let body = '';
    let from = '';
    let messageSid = '';
    let profileName = '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.text();
      const params = new URLSearchParams(formData);
      body = params.get('Body') || '';
      from = params.get('From') || '';
      messageSid = params.get('MessageSid') || '';
      profileName = params.get('ProfileName') || '';
    } else {
      const json = await req.json();
      body = json.Body || '';
      from = json.From || '';
      messageSid = json.MessageSid || '';
      profileName = json.ProfileName || '';
    }

    const message = body.trim();
    const phone = from;

    // ── Dedup repeated Twilio retries (in-memory, best-effort) ──
    const now = Date.now();
    for (const [sid, ts] of recentMessageSids) {
      if (now - ts > MSG_DEDUP_TTL) recentMessageSids.delete(sid);
    }
    if (messageSid && recentMessageSids.has(messageSid)) {
      return sendEmptyTwiml();
    }
    if (messageSid) recentMessageSids.set(messageSid, now);

    // ── Fast-path: greeting → instant TwiML text reply, then template w/ button async ──
    if (GREETING_SET.has(message.toLowerCase())) {
      const last = recentGreetings.get(phone);
      if (!last || now - last > GREETING_DEDUP_TTL) {
        recentGreetings.set(phone, now);
        // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
        EdgeRuntime.waitUntil(sendPlaceOrderTemplateAsync(phone));
      }
      console.log(`webhook_latency_ms=${(performance.now() - t0).toFixed(0)} path=greeting`);
      return sendStaticGreetingTwiml();
    }

    console.log(`📩 WhatsApp from ${phone}: "${message}" (SID: ${messageSid})`);

    // ── All other messages: process in background, return empty TwiML now ──
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(processMessageAsync(phone, message));
    console.log(`webhook_latency_ms=${(performance.now() - t0).toFixed(0)} path=async`);
    return sendEmptyTwiml();
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return sendEmptyTwiml();
  }
});

// ── Background: full message processing ─────────────────────────────
async function processMessageAsync(phone: string, message: string): Promise<void> {
  const tStart = performance.now();
  const supabase = getSupabaseClient();
  let aiReply = "Sorry, something went wrong.";

  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');

    const today = new Date().toISOString().split('T')[0];

    const tSession = performance.now();
    const session = await loadOrCreateSession(supabase, phone);
    console.log(`📋 [bg] Session state: ${session.state}, retailer: ${session.retailer_name || 'none'} (loaded in ${(performance.now() - tSession).toFixed(0)}ms)`);


      // ── Handle CONFIRMING_ORDER state ──
      if (session.state === 'CONFIRMING_ORDER') {
        const lower = message.toLowerCase();
        if (['yes', 'confirm', 'ok', 'haan', 'ha', 'y', 'proceed'].some(w => lower.includes(w))) {
          aiReply = await confirmOrder(supabase, session);
          // Save context with the order ID
          if (session.retailer_id) {
            const { data: lastOrder } = await supabase
              .from('orders')
              .select('id')
              .eq('retailer_id', session.retailer_id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            await saveContext(supabase, phone, 'order_placed', {}, lastOrder?.id || null);
          }
          await saveSession(supabase, session);
          await sendTwilioFreeForm(phone, aiReply); return;
        } else if (['no', 'cancel', 'nahi', 'nah', 'n', 'discard'].some(w => lower.includes(w))) {
          session.state = 'IDLE';
          session.pending_items = [];
          await saveSession(supabase, session);
          aiReply = "Order cancelled. Let me know if you need anything else!";
          await sendTwilioFreeForm(phone, aiReply); return;
        }
        // If neither confirm nor cancel, fall through to Gemini
      }

      // ── Handle Order Status Query ──
      const statusReply = await handleOrderStatusQuery(supabase, phone, message);
      if (statusReply) {
        session.conversation_history.push(
          { role: 'user', parts: [{ text: message }] },
          { role: 'model', parts: [{ text: statusReply }] }
        );
        // Save context for follow-ups
        const retailer = await findRetailerByPhone(supabase, phone);
        if (retailer) {
          const { data: latestOrder } = await supabase
            .from('orders')
            .select('id')
            .eq('retailer_id', retailer.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          await saveContext(supabase, phone, 'order_query', {}, latestOrder?.id || null);
        }
        await saveSession(supabase, session);
        await sendTwilioFreeForm(phone, statusReply); return;
      }

      // ── Handle Next Visit Query ──
      // Runs before Retailer Info so "when is the next visit to my store?"
      // gets the visit date instead of the generic store-details card
      // ("my store" alone, without visit wording, still goes to store info).
      const nextVisitReply = await handleNextVisitQuery(supabase, phone, message);
      if (nextVisitReply) {
        session.conversation_history.push(
          { role: 'user', parts: [{ text: message }] },
          { role: 'model', parts: [{ text: nextVisitReply }] }
        );
        await saveSession(supabase, session);
        await sendTwilioFreeForm(phone, nextVisitReply); return;
      }

      // ── Handle Retailer Info Query ──
      const retailerInfoReply = await handleRetailerInfoQuery(supabase, phone, message);
      if (retailerInfoReply) {
        session.conversation_history.push(
          { role: 'user', parts: [{ text: message }] },
          { role: 'model', parts: [{ text: retailerInfoReply }] }
        );
        await saveSession(supabase, session);
        await sendTwilioFreeForm(phone, retailerInfoReply); return;
      }

      // ── Handle Delivery Query ──
      const deliveryReply = await handleDeliveryQuery(supabase, phone, message);
      if (deliveryReply) {
        session.conversation_history.push(
          { role: 'user', parts: [{ text: message }] },
          { role: 'model', parts: [{ text: deliveryReply }] }
        );
        await saveSession(supabase, session);
        await sendTwilioFreeForm(phone, deliveryReply); return;
      }

      // ── Handle Schemes / Discounts Query ──
      // Runs before Follow-Up so Hinglish phrasings like "schemes batao"
      // aren't swallowed by the generic follow-up patterns.
      const schemesReply = await handleSchemesQuery(supabase, message);
      if (schemesReply) {
        session.conversation_history.push(
          { role: 'user', parts: [{ text: message }] },
          { role: 'model', parts: [{ text: schemesReply }] }
        );
        await saveSession(supabase, session);
        await sendTwilioFreeForm(phone, schemesReply); return;
      }

      // ── Handle Follow-Up Query ──
      const followUpReply = await handleFollowUpQuery(supabase, phone, message);
      if (followUpReply) {
        session.conversation_history.push(
          { role: 'user', parts: [{ text: message }] },
          { role: 'model', parts: [{ text: followUpReply }] }
        );
        await saveSession(supabase, session);
        await sendTwilioFreeForm(phone, followUpReply); return;
      }

      // ── Handle Product Count Query ──
      const productCountReply = await handleProductCountQuery(supabase, message);
      if (productCountReply) {
        session.conversation_history.push(
          { role: 'user', parts: [{ text: message }] },
          { role: 'model', parts: [{ text: productCountReply }] }
        );
        await saveSession(supabase, session);
        await sendTwilioFreeForm(phone, productCountReply); return;
      }

      // ── Handle Loyalty Points Query ──
      const loyaltyReply = await handleLoyaltyQuery(supabase, phone, message);
      if (loyaltyReply) {
        session.conversation_history.push(
          { role: 'user', parts: [{ text: message }] },
          { role: 'model', parts: [{ text: loyaltyReply }] }
        );
        await saveSession(supabase, session);
        await sendTwilioFreeForm(phone, loyaltyReply); return;
      }

      // ── Handle Outstanding Dues Query ──
      const duesReply = await handleDuesQuery(supabase, phone, message);
      if (duesReply) {
        session.conversation_history.push(
          { role: 'user', parts: [{ text: message }] },
          { role: 'model', parts: [{ text: duesReply }] }
        );
        await saveSession(supabase, session);
        await sendTwilioFreeForm(phone, duesReply); return;
      }

      // ── Handle Product Price Query ──
      const priceReply = await handlePriceQuery(supabase, message);
      if (priceReply) {
        session.conversation_history.push(
          { role: 'user', parts: [{ text: message }] },
          { role: 'model', parts: [{ text: priceReply }] }
        );
        await saveSession(supabase, session);
        await sendTwilioFreeForm(phone, priceReply); return;
      }

      // ── Handle "Place Order" intent — works from ANY state ──
      const lowerMsg = message.toLowerCase();
      const isPlaceOrderIntent = (
        lowerMsg.includes('place order') || lowerMsg.includes('i want to order') ||
        lowerMsg.includes('new order') || lowerMsg.includes('order karna') ||
        lowerMsg.includes('order place') || lowerMsg.includes('order do')
      );
      if (isPlaceOrderIntent) {
        // Reset any stale state
        session.pending_items = [];
        session.conversation_history = [];
        const retailer = await findRetailerByPhone(supabase, phone);
        if (!retailer) {
          aiReply = "I couldn't find a retailer linked to this phone number. Please contact your sales representative to register first.";
          await saveSession(supabase, session);
          await sendTwilioFreeForm(phone, aiReply); return;
        }

        session.retailer_id = retailer.id;
        session.retailer_name = retailer.name;
        session.owner_id = retailer.owner_id || retailer.user_id || null;
        session.beat_id = retailer.beat_id || null;
        session.territory_id = retailer.territory_id || null;
        session.state = 'AWAITING_ORDER_DETAILS';

        // Fetch product list for context
        const { data: products } = await supabase
          .from('products')
          .select('name, rate, unit')
          .eq('is_active', true)
          .order('name')
          .limit(100);

        let productList = "";
        (products || []).forEach((p: any) => {
          productList += `• ${p.name} — ₹${p.rate}/${p.unit}\n`;
        });
        productList += "\nPlease tell me the products and quantities you'd like to order.\nExample: \"5 kg adrak, 3 packets vayu 50g\"";

        aiReply = `👋 Hello *${retailer.name}*! Welcome back.\n\n🛒 Let's place your order.\n\n📦 *Available Products:*\n\n${productList}`;
        await saveSession(supabase, session);
        await sendTwilioFreeForm(phone, aiReply); return;
      }

      // ── Standard Gemini Chat (IDLE or AWAITING_ORDER_DETAILS) ──
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const systemPrompt = buildSystemPrompt(today, session);

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: systemPrompt,
        tools: allTools,
      });

      // Sanitize history: only user/model roles, must start with 'user'
      let sanitizedHistory = (session.conversation_history || [])
        .filter((h: any) => h.role === 'user' || h.role === 'model');
      while (sanitizedHistory.length > 0 && sanitizedHistory[0].role !== 'user') {
        sanitizedHistory.shift();
      }
      console.log(`🤖 Gemini chat (history: ${sanitizedHistory.length} msgs, state: ${session.state})`);

      const chat = model.startChat({ history: sanitizedHistory });
      let result = await chat.sendMessage(message);
      let response = result.response;

      // Handle function calls
      let functionCalls = response.functionCalls();
      let maxRounds = 3;
      while (functionCalls && functionCalls.length > 0 && maxRounds > 0) {
        maxRounds--;
        console.log(`🔧 Gemini requested ${functionCalls.length} function call(s)`);

        const functionResponses = [];
        for (const call of functionCalls) {
          console.log(`  📊 Executing: ${call.name}(${JSON.stringify(call.args).slice(0, 200)})`);
          const fnResult = await executeFunction(call.name, call.args, session);
          console.log(`  ✅ Result preview: ${JSON.stringify(fnResult).slice(0, 200)}`);
          // Save context after meaningful tool executions
          if (call.name === 'get_products' && fnResult?.total_products !== undefined) {
            await saveContext(supabase, phone, 'product_list', { count: fnResult.total_products });
          }
          functionResponses.push({
            functionResponse: { name: call.name, response: fnResult },
          });
        }

        result = await chat.sendMessage(functionResponses);
        response = result.response;
        functionCalls = response.functionCalls();
      }

      aiReply = response.text() || "";
      console.log('✅ Gemini response:', aiReply.slice(0, 200));

      // Detect unhelpful/empty/default responses and log as unhandled
      const FALLBACK_PATTERNS = [
        "sorry, i couldn't process",
        "i'm not sure how to help",
        "i don't have enough information",
      ];
      const isUnhelpful = !aiReply.trim() || FALLBACK_PATTERNS.some(p => aiReply.toLowerCase().includes(p));
      if (isUnhelpful) {
        console.log('⚠️ Gemini response detected as unhelpful, logging unhandled query');
        aiReply = await logUnhandledQuery(supabase, phone, message);
      }

      // Update conversation history (only store user/model text pairs)
      const updatedHistory = [...sanitizedHistory];
      updatedHistory.push({ role: 'user', parts: [{ text: message }] });
      updatedHistory.push({ role: 'model', parts: [{ text: aiReply }] });
      if (updatedHistory.length > MAX_HISTORY) {
        updatedHistory.splice(0, updatedHistory.length - MAX_HISTORY);
        // Re-ensure first entry is 'user' after splicing
        while (updatedHistory.length > 0 && updatedHistory[0].role !== 'user') {
          updatedHistory.shift();
        }
      }
      session.conversation_history = updatedHistory;

    await saveSession(supabase, session);

    await sendTwilioFreeForm(phone, aiReply);
    console.log(`⏱️ [bg] processMessageAsync (gemini path) total ${(performance.now() - tStart).toFixed(0)}ms`);
  } catch (err) {
    console.error('❌ [bg] Gemini/DB error:', err);
    try {
      const fallback = await logUnhandledQuery(supabase, phone, message);
      await sendTwilioFreeForm(phone, fallback);
    } catch (e) {
      console.error('❌ [bg] fallback send failed:', e);
    }
    console.log(`⏱️ [bg] processMessageAsync (error path) total ${(performance.now() - tStart).toFixed(0)}ms`);
  }
}

const FALLBACK_MESSAGE = "I'm sorry, I couldn't assist with that request at the moment. However, I've shared your query with our internal team, and they'll get back to you shortly!";

async function logUnhandledQuery(supabase: any, phone: string, message: string): Promise<string> {
  try {
    const retailer = await findRetailerByPhone(supabase, phone);
    const today = new Date().toISOString().split('T')[0];

    await supabase
      .from('unhandled_queries')
      .insert({
        phone,
        retailer_id: retailer?.id || null,
        retailer_name: retailer?.name || null,
        message,
        category: 'unknown',
        status: 'open',
        created_date: today,
      })
      .select()
      .maybeSingle(); // ON CONFLICT (dedup index) will silently skip duplicates

    console.log('📝 Logged unhandled query for phone:', phone);
  } catch (logErr) {
    console.error('⚠️ Failed to log unhandled query:', logErr);
  }
  return FALLBACK_MESSAGE;
}

function sendTwiml(message: string): Response {
  // Escape XML special characters
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escaped}</Message>
</Response>`;

  return new Response(twiml, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
  });
}

function sendEmptyTwiml(): Response {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>`;
  return new Response(twiml, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
  });
}

async function sendTwilioTemplate(to: string): Promise<void> {
  const accountSid = 'AC2bed17b2742df7031ebc7de2d726b62f';
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!authToken) {
    console.error('TWILIO_AUTH_TOKEN not configured, skipping template send');
    return;
  }

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const base64Auth = btoa(`${accountSid}:${authToken}`);

  const formBody = new URLSearchParams({
    To: to,
    From: 'whatsapp:+917411681616',
    ContentSid: 'HXae62614f9e4e3b47ede7db13d75175eb',
    ContentVariables: JSON.stringify({}),
  });

  try {
    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${base64Auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('❌ Twilio template send error:', result);
    } else {
      console.log(`✅ Template sent to ${to}: SID ${result.sid}`);
    }
  } catch (err) {
    console.error('❌ Twilio template send exception:', err);
  }
}

// ── Twilio free-form WhatsApp send (Body), with 24h-window template fallback ──
async function sendTwilioFreeForm(to: string, body: string): Promise<void> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || 'AC2bed17b2742df7031ebc7de2d726b62f';
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!authToken) {
    console.error('TWILIO_AUTH_TOKEN not configured, cannot send free-form message');
    return;
  }
  const fromNumber = Deno.env.get('TWILIO_WHATSAPP_NUMBER') || 'whatsapp:+917411681616';
  const fromFormatted = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const base64Auth = btoa(`${accountSid}:${authToken}`);

  try {
    const tSend = performance.now();
    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${base64Auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: toFormatted,
        From: fromFormatted,
        Body: body.slice(0, 1600),
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      console.error(`❌ Twilio free-form send error to ${toFormatted}:`, result);
      // Fall back to greeting template if outside the 24h window
      if (result?.code === 63016) {
        console.log('Outside 24-hour window, falling back to greeting template');
        await sendTwilioTemplate(toFormatted);
      }
    } else {
      console.log(`✅ Twilio reply sent to ${toFormatted} in ${(performance.now() - tSend).toFixed(0)}ms (SID ${result.sid})`);
    }
  } catch (err) {
    console.error('❌ Twilio free-form send exception:', err);
  }
}
