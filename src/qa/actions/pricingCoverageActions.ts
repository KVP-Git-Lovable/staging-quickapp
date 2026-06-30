/**
 * QA-only: Pricing coverage test actions.
 *
 * Uses the actual `products` schema in this project:
 *   - is_active : boolean
 *   - rate      : numeric
 *
 * QA-build-only.
 */
import type { QATestAction } from '@/qa/types';
import { goTo } from '@/qa/automation/navigate';
import { waitForElement } from '@/qa/automation/uiActions';
import { supabase } from '@/integrations/supabase/client';
import { table } from '@/lib/tableRouter';

function parseMoney(text: string | null | undefined): number {
  if (!text) return NaN;
  return parseFloat(text.replace(/[^0-9.]/g, ''));
}

export const pricingCoverageActions: QATestAction[] = [
  {
    id: 'pricing.all-active-products-have-a-rate',
    label: 'All active products have a non-zero rate',
    entity: 'Pricing',
    description:
      'Sweeps every active product and flags any with NULL or ' +
      'zero rate — those would render as free or blank in the ' +
      'order screen. Pure data-coverage check, no UI walk.',
    inputs: [],
    run: async () => {
      try {
        const { data, error } = await supabase
          .from(table('products') as any)
          .select('id, name, rate, is_active')
          .eq('is_active', true);
        if (error) return { pass: false, errorMessage: error.message };

        const rows = (data ?? []) as Array<{ id: string; name: string; rate: number | null }>;
        const missing = rows.filter((p) => p.rate == null || p.rate === 0);
        if (missing.length > 0) {
          return {
            pass: false,
            output: { missingCount: missing.length, missing: missing.slice(0, 25) },
            errorMessage: `${missing.length} active product(s) have no rate: ${missing
              .slice(0, 10)
              .map((p) => p.name)
              .join(', ')}${missing.length > 10 ? '…' : ''}`,
          };
        }
        return { pass: true, output: { checkedCount: rows.length } };
      } catch (e: any) {
        return { pass: false, errorMessage: e.message ?? String(e) };
      }
    },
  },
  {
    id: 'pricing.spot-check-catalog-screen-matches-db',
    label: 'Catalog screen prices match DB (spot check)',
    entity: 'Pricing',
    description:
      'Opens the product management catalog and spot-checks that ' +
      'the first N rendered prices match the DB — catches caching ' +
      'bugs and stale UI bindings. Requires product price elements ' +
      'to carry data-testid="product-price-{id}".',
    inputs: [
      { key: 'sample_size', label: 'Number of products to spot-check', type: 'number', default: 5, required: true },
    ],
    run: async (input) => {
      try {
        await goTo('/product-management');
        const { data, error } = await supabase
          .from(table('products') as any)
          .select('id, name, rate')
          .eq('is_active', true)
          .limit(input.sample_size);
        if (error) return { pass: false, errorMessage: error.message };
        const rows = (data ?? []) as Array<{ id: string; name: string; rate: number }>;
        if (rows.length === 0) {
          return { pass: false, errorMessage: 'No active products returned to spot-check.' };
        }

        const mismatches: Array<{ name: string; dbRate: number; uiText: string }> = [];
        for (const p of rows) {
          try {
            const el = await waitForElement(`product-price-${p.id}`, { timeoutMs: 3000 });
            const uiText = el.textContent ?? '';
            const uiRate = parseMoney(uiText);
            if (isNaN(uiRate) || Math.abs(uiRate - p.rate) > 0.01) {
              mismatches.push({ name: p.name, dbRate: p.rate, uiText });
            }
          } catch {
            mismatches.push({ name: p.name, dbRate: p.rate, uiText: '(element not found)' });
          }
        }

        if (mismatches.length > 0) {
          return {
            pass: false,
            output: { mismatches },
            errorMessage:
              `${mismatches.length} price mismatch(es). ` +
              `If all show "(element not found)", add data-testid="product-price-{id}" to ` +
              `the catalog price cells.`,
          };
        }
        return { pass: true, output: { checkedCount: rows.length } };
      } catch (e: any) {
        return { pass: false, errorMessage: e.message ?? String(e) };
      }
    },
  },
];
