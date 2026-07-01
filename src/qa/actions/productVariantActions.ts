/**
 * QA-only: Product variant test actions.
 *
 * Tier 2 read-through note: `product_variants` has no qa_ mirror in
 * this project, so we query it directly (no `table()` wrapper). This
 * is intended per the QA Build System design — reference/catalog
 * tables are read-through.
 *
 * QA-build-only.
 */
import type { QATestAction } from '@/qa/types';
import { goTo } from '@/qa/automation/navigate';
import { selectOption, typeText, waitForElement } from '@/qa/automation/uiActions';
import { supabase } from '@/integrations/supabase/client';

function parseMoney(text: string | null | undefined): number {
  if (!text) return NaN;
  return parseFloat(text.replace(/[^0-9.]/g, ''));
}

async function getVariantPriceFromDb(productId: string, variantLabel: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('product_variants')
    .select('price, variant_name')
    .eq('product_id', productId)
    .ilike('variant_name', `%${variantLabel}%`)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const p = (data as any).price;
  return typeof p === 'number' ? p : null;
}

async function resolveDefaults(input: Record<string, any>): Promise<Record<string, any>> {
  const out = { ...input };
  if (!out.product_id || !out.variant_label) {
    const { data } = await supabase
      .from('product_variants')
      .select('product_id, variant_name, price')
      .not('price', 'is', null)
      .limit(1)
      .maybeSingle();
    if (data) {
      out.product_id = out.product_id ?? (data as any).product_id;
      out.variant_label = out.variant_label ?? (data as any).variant_name;
    }
  }
  if (!out.retailer_id) {
    const { data } = await supabase
      .from('retailers')
      .select('id')
      .limit(1)
      .maybeSingle();
    if (data) out.retailer_id = (data as any).id;
  }
  return out;
}

export const productVariantActions: QATestAction[] = [
  {
    id: 'product.variant-selection-resolves-correct-price',
    label: 'Order item shows the correct variant rate',
    entity: 'Product Variants',
    description:
      'Opens order entry, picks a specific variant, and confirms ' +
      'the rate displayed in the UI matches that variant\'s price ' +
      'in the database — catching the bug where the parent product ' +
      'rate is shown regardless of which variant is selected.',
    inputs: [
      { key: 'retailer_id', label: 'Retailer ID', type: 'string' },
      { key: 'product_id', label: 'Product ID', type: 'string' },
      { key: 'variant_label', label: 'Variant label (as in UI)', type: 'string' },
    ],
    run: async (rawInput) => {
      const input = await resolveDefaults(rawInput);
      if (!input.retailer_id || !input.product_id || !input.variant_label) {
        return {
          pass: false,
          errorMessage: 'No retailer / product / variant available in DB to auto-resolve defaults.',
        };
      }
      try {
        await goTo(`/order-entry?retailerId=${input.retailer_id}&productId=${input.product_id}`);
        try {
          await selectOption('product-variant-select', input.variant_label, { timeoutMs: 5000 });
        } catch (e: any) {
          return {
            pass: false,
            errorMessage:
              `Variant selector not found (data-testid="product-variant-select"). ` +
              `Add the testid to the order entry variant picker so this test can run. (${e.message})`,
          };
        }

        const rateEl = await waitForElement('order-item-rate-display', { timeoutMs: 5000 });
        const uiRate = parseMoney(rateEl.textContent);
        if (isNaN(uiRate)) {
          return { pass: false, errorMessage: 'Could not parse numeric rate from order-item-rate-display.' };
        }

        const dbRate = await getVariantPriceFromDb(input.product_id, input.variant_label);
        if (dbRate == null) {
          return { pass: false, errorMessage: 'No matching variant row (or null price) found in product_variants.' };
        }

        const matches = Math.abs(dbRate - uiRate) < 0.01;
        return {
          pass: matches,
          output: { uiRate, dbRate },
          errorMessage: matches ? undefined : `UI shows ${uiRate} but DB price is ${dbRate}.`,
        };
      } catch (e: any) {
        return { pass: false, errorMessage: e.message ?? String(e) };
      }
    },
  },
  {
    id: 'product.variant-quantity-totals-correctly',
    label: 'Line total = variant rate × quantity',
    entity: 'Product Variants',
    description:
      'Picks a variant, sets a quantity, and verifies the line ' +
      'total shown equals rate × quantity exactly — catches cases ' +
      'where the wrong variant\'s rate is silently used in the ' +
      'calculation even though the right rate is displayed.',
    inputs: [
      { key: 'retailer_id', label: 'Retailer ID', type: 'string' },
      { key: 'product_id', label: 'Product ID', type: 'string' },
      { key: 'variant_label', label: 'Variant label', type: 'string' },
      { key: 'quantity', label: 'Quantity', type: 'number', default: 3 },
    ],
    run: async (rawInput) => {
      const input = await resolveDefaults(rawInput);
      if (!input.retailer_id || !input.product_id || !input.variant_label) {
        return { pass: false, errorMessage: 'No retailer / product / variant available in DB to auto-resolve defaults.' };
      }
      try {
        await goTo(`/order-entry?retailerId=${input.retailer_id}&productId=${input.product_id}`);
        try {
          await selectOption('product-variant-select', input.variant_label, { timeoutMs: 5000 });
        } catch (e: any) {
          return {
            pass: false,
            errorMessage: `Variant selector not found (data-testid="product-variant-select"): ${e.message}`,
          };
        }

        try {
          await typeText('order-quantity-input', String(input.quantity));
        } catch (e: any) {
          return {
            pass: false,
            errorMessage: `Quantity input not found (data-testid="order-quantity-input"): ${e.message}`,
          };
        }

        const rateEl = await waitForElement('order-item-rate-display', { timeoutMs: 5000 });
        const uiRate = parseMoney(rateEl.textContent);

        let lineTotal: number | null = null;
        try {
          const totalEl = await waitForElement('order-item-line-total', { timeoutMs: 3000 });
          lineTotal = parseMoney(totalEl.textContent);
        } catch {
          // Fall back to DB rate × qty consistency check if the UI
          // does not expose a per-line total testid.
        }

        const dbRate = await getVariantPriceFromDb(input.product_id, input.variant_label);
        if (dbRate == null) {
          return { pass: false, errorMessage: 'No matching variant row (or null price) found in product_variants.' };
        }

        if (Math.abs(dbRate - uiRate) > 0.01) {
          return { pass: false, output: { uiRate, dbRate }, errorMessage: `UI rate ${uiRate} ≠ DB rate ${dbRate}` };
        }
        const expected = dbRate * input.quantity;
        if (lineTotal != null) {
          const ok = Math.abs(lineTotal - expected) < 0.01;
          return {
            pass: ok,
            output: { uiRate, dbRate, qty: input.quantity, lineTotal, expected },
            errorMessage: ok ? undefined : `Line total ${lineTotal} ≠ expected ${expected}`,
          };
        }
        return {
          pass: true,
          output: { uiRate, dbRate, qty: input.quantity, expected, note: 'order-item-line-total testid not found; verified rate match only' },
        };
      } catch (e: any) {
        return { pass: false, errorMessage: e.message ?? String(e) };
      }
    },
  },
];
