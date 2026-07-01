/**
 * QA-only: Order creation.
 *
 * Programmatic — inserts qa_orders + qa_order_items directly (same
 * pattern as smoke + offline-sync + visit actions). Bypasses the
 * order-entry UI because that UI is only reachable from inside a live
 * visit, which itself requires native camera/GPS-backed attendance.
 */
import type { QATestAction } from '@/qa/types';
import { supabase } from '@/integrations/supabase/client';
import { table } from '@/lib/tableRouter';

export const orderActions: QATestAction[] = [
  {
    id: 'order.create',
    label: 'Create Order (qa_orders + qa_order_items)',
    entity: 'Orders',
    description:
      'Picks the first priced product and creates a single-line order ' +
      'against the retailer + visit from context. Verifies the order ' +
      'and its line item persisted in the qa_* tables.',
    inputs: [
      {
        key: 'retailer_id',
        label: 'Retailer ID',
        type: 'string',
        fromContext: 'retailer.id',
        required: true,
      },
      {
        key: 'visit_id',
        label: 'Visit ID',
        type: 'string',
        fromContext: 'visit.id',
        required: false,
      },
      { key: 'quantity', label: 'Quantity', type: 'number', default: 1 },
    ],
    run: async (input, ctx) => {
      try {
        const { data: userRes, error: uErr } = await supabase.auth.getUser();
        if (uErr || !userRes.user) {
          return { pass: false, errorMessage: 'No authenticated user for QA session.' };
        }
        const userId = userRes.user.id;

        // Retailer name — needed as a NOT NULL snapshot on qa_orders.
        const { data: retailer, error: rErr } = await supabase
          .from(table('retailers') as any)
          .select('id, name')
          .eq('id', input.retailer_id)
          .maybeSingle();
        if (rErr || !retailer) {
          return {
            pass: false,
            errorMessage: `Retailer ${input.retailer_id} not found in qa_retailers: ${rErr?.message ?? 'no row'}`,
          };
        }

        // Pick a priced product. qa_products uses `base_unit_category`
        // and `base_unit` — there is no `category`/`unit` column.
        const { data: product, error: pErr } = await supabase
          .from(table('products') as any)
          .select('id, name, rate, base_unit_category, base_unit')
          .eq('is_active', true)
          .gt('rate', 0)
          .limit(1)
          .maybeSingle();
        if (pErr || !product) {
          return {
            pass: false,
            errorMessage: `No priced active product available in qa_products: ${pErr?.message ?? 'empty'}. Seed at least one product before running this flow.`,
          };
        }

        const qty = Number(input.quantity) || 1;
        const rate = Number((product as any).rate) || 0;
        const total = qty * rate;
        const idem = `qa-order-${crypto.randomUUID()}`;

        // Insert order.
        const { data: order, error: oErr } = await supabase
          .from(table('orders') as any)
          .insert({
            user_id: userId,
            retailer_id: input.retailer_id,
            retailer_name: (retailer as any).name,
            visit_id: input.visit_id ?? null,
            subtotal: total,
            total_amount: total,
            status: 'pending',
            order_date: new Date().toISOString().slice(0, 10),
            idempotency_key: idem,
            order_source: 'qa_automation',
            sales_channel: 'field',
            qa_run_id: ctx.runId,
          } as any)
          .select('id')
          .single();

        if (oErr) return { pass: false, errorMessage: `Order insert failed: ${oErr.message}` };

        // Insert line item — column names match qa_order_items NOT NULLs.
        const { data: item, error: iErr } = await supabase
          .from(table('order_items') as any)
          .insert({
            order_id: order.id,
            product_id: (product as any).id,
            product_name: (product as any).name,
            category: (product as any).base_unit_category ?? 'General',
            rate,
            unit: (product as any).base_unit ?? 'PCS',
            quantity: qty,
            total,
            qa_run_id: ctx.runId,
          } as any)
          .select('id')
          .single();

        if (iErr) {
          return { pass: false, errorMessage: `Order line insert failed: ${iErr.message}` };
        }

        // Read-back verify.
        const { data: verify, error: vErr } = await supabase
          .from(table('orders') as any)
          .select('id, total_amount, status')
          .eq('id', order.id)
          .maybeSingle();
        if (vErr || !verify) {
          return { pass: false, errorMessage: `Order verify failed: ${vErr?.message ?? 'no row'}` };
        }

        ctx.remember('order', { id: order.id, itemId: item.id, total });
        return { pass: true, output: { orderId: order.id, itemId: item.id, total } };
      } catch (e: any) {
        return { pass: false, errorMessage: e?.message ?? String(e) };
      }
    },
  },
];
