import type { QATestAction } from '@/qa/types';
import { supabase } from '@/integrations/supabase/client';
import { table } from '@/lib/tableRouter';
import { goTo } from '@/qa/automation/navigate';
import {
  tap,
  typeText,
  waitForText,
  selectOption,
  randomSelectOption,
  stubGeolocation,
  sleep,
} from '@/qa/automation/uiActions';
import { manualStepAction } from './_skipped';

/**
 * Real UI-driven retailer flow — fully hands-free.
 *
 * Drives `/add-retailer` end-to-end without any human input:
 *   - Types name / phone / address
 *   - Stubs geolocation (QA build only) and taps "Get Location"
 *   - Picks a random beat from the beat dropdown
 *   - Sets Parent Type = "Company" (falls back to picking a random
 *     distributor if the tenant hides "Company")
 *   - Taps Save and cross-verifies the row in qa_retailers
 */
export const retailerActions: QATestAction[] = [
  {
    id: 'retailer.create',
    label: 'Create Retailer (UI)',
    entity: 'Retailers',
    description:
      'Navigates to Add Retailer, fills required fields (beat, parent, GPS included), taps Save, then verifies the qa_retailers row exists.',
    inputs: [
      { key: 'name', label: 'Retailer name', type: 'string', default: `QA Retailer ${Date.now()}` },
      { key: 'phone', label: 'Phone', type: 'string', default: '9000000000' },
      { key: 'address', label: 'Address', type: 'string', default: 'QA Test Address, Bengaluru' },
    ],
    run: async (input, ctx) => {
      // Bengaluru — well inside India, passes downstream validation.
      const restoreGeo = stubGeolocation(12.9716, 77.5946, 10);
      try {
        await goTo('/my-retailers');
        await tap('add-retailer-button', { timeoutMs: 6000 });
        await sleep(400); // let AddRetailer render + load beats

        await typeText('retailer-name-input', String(input.name));
        await typeText('retailer-phone-input', String(input.phone));
        await typeText('retailer-address-input', String(input.address));

        // GPS — stubbed above, this tap resolves synchronously.
        try {
          await tap('retailer-get-location-button', { timeoutMs: 4000 });
          // Give the geocode + toast a moment; success text varies so we
          // don't hard-fail here — the Save-time validation is the real
          // gate on latitude/longitude.
          await sleep(600);
        } catch {
          // If the button testid isn't present in an older build, fall
          // through — Save will surface the real validation error.
        }

        // Beat is mandatory — pick a random real beat from the list.
        try {
          await randomSelectOption('retailer-beat-select', { timeoutMs: 6000 });
          await sleep(300); // let dependent distributor list load
        } catch (e: any) {
          return {
            pass: false,
            errorMessage: `Beat picker failed: ${e?.message ?? e}. Ensure at least one beat exists for this user.`,
          };
        }

        // Parent type: "Company" needs no distributor. Fall back to
        // "Distributor" + random distributor if Company isn't listed.
        let parentedAsCompany = false;
        try {
          await selectOption('retailer-parent-type-select', 'Company', { timeoutMs: 3000 });
          parentedAsCompany = true;
        } catch {
          try {
            await selectOption('retailer-parent-type-select', 'Distributor', { timeoutMs: 3000 });
            await sleep(200);
            await randomSelectOption('retailer-distributor-select', { timeoutMs: 5000 });
          } catch (e: any) {
            return {
              pass: false,
              errorMessage: `Parent/distributor picker failed: ${e?.message ?? e}`,
            };
          }
        }

        await sleep(200);
        await tap('save-retailer-button');

        const uiOk =
          (await waitForText('Retailer Added', { timeoutMs: 6000 })) ||
          (await waitForText('Retailer Saved', { timeoutMs: 1500 })) ||
          (await waitForText('saved successfully', { timeoutMs: 1500 })) ||
          (await waitForText('added successfully', { timeoutMs: 1500 }));

        const { data, error } = await supabase
          .from(table('qa_retailers') as any)
          .select('id, name, phone, created_at')
          .eq('name', input.name)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          return {
            pass: false,
            errorMessage: `DB verify failed: ${error.message}${uiOk ? ' (UI showed success — UI/DB mismatch)' : ''}`,
          };
        }
        if (!data) {
          return {
            pass: false,
            errorMessage: uiOk
              ? 'UI showed success but no matching qa_retailers row found (UI/DB mismatch)'
              : 'No success indicator and no qa_retailers row created — save did not complete',
          };
        }

        ctx.remember('retailer', data);
        return { pass: true, output: { ...data, parentedAsCompany } };
      } catch (e: any) {
        return { pass: false, errorMessage: e?.message ?? String(e) };
      } finally {
        restoreGeo();
      }
    },
  },

  manualStepAction(
    'retailer.delete',
    'Delete Retailer',
    'Retailers',
    'no UI delete control',
    'MyRetailers row actions expose Edit/View only; delete is admin-side and not part of the field UI.',
  ),
];
