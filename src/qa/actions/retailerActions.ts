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
      // Pre-flight: fail fast (with a clear message) instead of stalling
      // mid-form when the QA tenant has no seed beats.
      try {
        const { count: beatCount } = await supabase
          .from(table('beats') as any)
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true);
        if (!beatCount || beatCount === 0) {
          return {
            pass: false,
            errorMessage:
              'No active beats in qa_beats — seed at least one beat before running this flow (retailer.create needs a mandatory beat pick).',
          };
        }
      } catch (e: any) {
        return { pass: false, errorMessage: `Beat pre-flight failed: ${e?.message ?? e}` };
      }

      // Bengaluru — well inside India, passes downstream validation.
      const restoreGeo = stubGeolocation(12.9716, 77.5946, 10);
      try {
        await goTo('/my-retailers');
        await tap('add-retailer-button', { timeoutMs: 6000 });
        // Radix Sheet animates in over ~300ms — give it 700ms then
        // explicitly wait for the first form input before typing so
        // slow first paints don't flake with an 8s default timeout.
        await sleep(700);
        try {
          await (await import('@/qa/automation/uiActions')).waitForElement(
            'retailer-name-input',
            { timeoutMs: 12000 },
          );
        } catch (e: any) {
          return { pass: false, errorMessage: `Add Retailer form did not mount: ${e?.message ?? e}` };
        }

        // Fill order matters — required fields first so Save enables
        // by the time we reach it.
        await typeText('retailer-name-input', String(input.name));
        await typeText('retailer-phone-input', String(input.phone));
        await typeText('retailer-address-input', String(input.address));

        // Beat is mandatory — pick a random real beat from the list.
        let pickedBeatLabel: string | null = null;
        try {
          pickedBeatLabel = await randomSelectOption('retailer-beat-select', { timeoutMs: 6000 });
          await sleep(300); // let dependent distributor list load
        } catch (e: any) {
          return {
            pass: false,
            errorMessage: `Beat picker failed: ${e?.message ?? e}. Ensure at least one beat exists for this user.`,
          };
        }

        // Parent type: "Company" needs no distributor.
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

        // Retail Type + Category.
        try {
          await randomSelectOption('retailer-retail-type-select', { timeoutMs: 4000 });
          await sleep(150);
        } catch (e: any) {
          return { pass: false, errorMessage: `Retail Type picker failed: ${e?.message ?? e}` };
        }
        try {
          await randomSelectOption('retailer-category-select', { timeoutMs: 4000 });
          await sleep(150);
        } catch (e: any) {
          return { pass: false, errorMessage: `Category picker failed: ${e?.message ?? e}` };
        }

        // GPS — stubbed above, the tap resolves synchronously but the
        // reverse-geocode + controlled state update need a moment.
        try {
          await tap('retailer-get-location-button', { timeoutMs: 4000 });
          await sleep(800);
        } catch { /* Save validation is the real gate */ }

        // Give controlled form state a beat to re-run validation, then
        // poll the Save button until it un-disables (≤3s).
        await sleep(300);
        const saveDeadline = Date.now() + 3000;
        let saveEl: HTMLElement | null = null;
        while (Date.now() < saveDeadline) {
          saveEl = document.querySelector<HTMLElement>('[data-testid="save-retailer-button"]');
          if (
            saveEl &&
            !saveEl.hasAttribute('disabled') &&
            saveEl.getAttribute('aria-disabled') !== 'true'
          ) break;
          await sleep(150);
        }
        if (
          !saveEl ||
          saveEl.hasAttribute('disabled') ||
          saveEl.getAttribute('aria-disabled') === 'true'
        ) {
          const invalid = Array.from(
            document.querySelectorAll('[aria-invalid="true"]'),
          )
            .map((n) => (n as HTMLElement).getAttribute('data-testid') || (n as HTMLElement).getAttribute('name') || n.tagName)
            .join(', ');
          return {
            pass: false,
            errorMessage: `save-retailer-button stayed disabled after 3s. aria-invalid fields: ${invalid || '(none reported)'}`,
          };
        }

        await tap('save-retailer-button');

        const uiOk =
          (await waitForText('Retailer Added', { timeoutMs: 6000 })) ||
          (await waitForText('Retailer Saved', { timeoutMs: 1500 })) ||
          (await waitForText('saved successfully', { timeoutMs: 1500 })) ||
          (await waitForText('added successfully', { timeoutMs: 1500 }));

        // Re-read with beat context so downstream actions (visit,
        // assign-to-beat) can rely on both beat_id + beat_name.
        const { data, error } = await supabase
          .from(table('retailers') as any)
          .select('id, name, phone, beat_id, created_at')
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

        let beatName: string | null = pickedBeatLabel;
        if (!beatName && (data as any).beat_id) {
          const { data: b } = await supabase
            .from(table('beats') as any)
            .select('beat_name')
            .eq('id', (data as any).beat_id)
            .maybeSingle();
          beatName = (b as any)?.beat_name ?? null;
        }
        // Attribute the row to this QA run so cleanup_qa_run() can
        // remove it. The AddRetailer UI insert doesn't set qa_run_id,
        // so we backfill it here post-verify.
        try {
          await supabase
            .from(table('retailers') as any)
            .update({ qa_run_id: ctx.runId } as any)
            .eq('id', (data as any).id);
        } catch { /* non-fatal — attribution best-effort */ }

        const remembered = { ...data, beat_name: beatName };
        ctx.remember('retailer', remembered);
        return { pass: true, output: { ...remembered, parentedAsCompany } };
      } catch (e: any) {
        return { pass: false, errorMessage: e?.message ?? String(e) };
      } finally {
        restoreGeo();
      }
    },
  },

  {
    id: 'retailer.assign-to-beat',
    label: 'Record beat assignment (qa_retailer_beat_assignments)',
    entity: 'Retailers',
    description:
      'Inserts a current beat assignment row for the retailer created by ' +
      'retailer.create. qa_retailer_beat_assignments needs retailer_id, ' +
      'beat_id, beat_name, user_id.',
    inputs: [
      { key: 'retailer_id', label: 'Retailer ID', type: 'string', fromContext: 'retailer.id', required: true },
      { key: 'beat_id', label: 'Beat ID', type: 'string', fromContext: 'retailer.beat_id', required: true },
      { key: 'beat_name', label: 'Beat name', type: 'string', fromContext: 'retailer.beat_name', required: true },
    ],
    run: async (input) => {
      try {
        const { data: userRes, error: uErr } = await supabase.auth.getUser();
        if (uErr || !userRes.user) {
          return { pass: false, errorMessage: 'No authenticated user for QA session.' };
        }
        const { data, error } = await supabase
          .from(table('retailer_beat_assignments') as any)
          .insert({
            retailer_id: input.retailer_id,
            beat_id: input.beat_id,
            beat_name: input.beat_name,
            user_id: userRes.user.id,
            is_current: true,
            assigned_from: new Date().toISOString(),
          } as any)
          .select('id')
          .single();
        if (error) return { pass: false, errorMessage: `Assignment insert failed: ${error.message}` };
        return { pass: true, output: { id: data.id } };
      } catch (e: any) {
        return { pass: false, errorMessage: e?.message ?? String(e) };
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
