import type { QATestAction } from '@/qa/types';
import { supabase } from '@/integrations/supabase/client';
import { table } from '@/lib/tableRouter';
import { goTo } from '@/qa/automation/navigate';
import { tap, typeText, waitForText, sleep } from '@/qa/automation/uiActions';
import { manualStepAction } from './_skipped';

/**
 * Real UI-driven retailer flow.
 *
 * Drives the live `/add-retailer` screen: types into the actual name /
 * phone / address inputs, taps the actual Save button, waits for the
 * actual success toast, then cross-verifies via the `qa_retailers`
 * table that the row landed.
 *
 * Note on GPS: AddRetailer.tsx server-side validation in this codebase
 * requires valid lat/lng. If the test environment can't supply real GPS
 * (Capacitor permission, web geolocation prompt), the Save step will
 * surface as a real UI failure — which is the correct signal, not a
 * faked pass.
 */
export const retailerActions: QATestAction[] = [
  {
    id: 'retailer.create',
    label: 'Create Retailer (UI)',
    entity: 'Retailers',
    description:
      'Navigates to Add Retailer, fills name/phone/address, taps Save, then verifies the qa_retailers row exists.',
    inputs: [
      { key: 'name', label: 'Retailer name', type: 'string', default: `QA Retailer ${Date.now()}` },
      { key: 'phone', label: 'Phone', type: 'string', default: '9000000000' },
      { key: 'address', label: 'Address', type: 'string', default: 'QA Test Address, Bengaluru' },
    ],
    run: async (input, ctx) => {
      try {
        await goTo('/my-retailers');
        await tap('add-retailer-button', { timeoutMs: 6000 });
        await sleep(300); // let AddRetailer render

        await typeText('retailer-name-input', String(input.name));
        await typeText('retailer-phone-input', String(input.phone));
        await typeText('retailer-address-input', String(input.address));
        await tap('save-retailer-button');

        // Try a few common success-text variants used by the app's toasts
        const uiOk =
          (await waitForText('Retailer Added', { timeoutMs: 5000 })) ||
          (await waitForText('Retailer Saved', { timeoutMs: 1500 })) ||
          (await waitForText('saved successfully', { timeoutMs: 1500 }));

        // DB cross-verification (server-authoritative) — even if the toast
        // wording shifts, we trust the qa_retailers row as ground truth.
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
        if (!uiOk) {
          return {
            pass: false,
            errorMessage: 'qa_retailers row exists but no UI success indicator was shown (UI/DB mismatch)',
            output: data,
          };
        }

        ctx.remember('retailer', data);
        return { pass: true, output: data };
      } catch (e: any) {
        return { pass: false, errorMessage: e?.message ?? String(e) };
      }
    },
  },

  // No standalone "Delete Retailer" control exists in the active retailer
  // UI today (rows expose Edit/View only). Surfacing as manual rather
  // than faking a workaround.
  manualStepAction(
    'retailer.delete',
    'Delete Retailer',
    'Retailers',
    'no UI delete control',
    'MyRetailers row actions expose Edit/View only; delete is admin-side and not part of the field UI.',
  ),
];
