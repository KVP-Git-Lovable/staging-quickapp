import type { QATestAction } from '@/qa/types';
import { supabase } from '@/integrations/supabase/client';
import { table } from '@/lib/tableRouter';
import { format } from 'date-fns';

/**
 * Runnable smoke actions for the QA harness.
 * These hit qa_* tables only (via the QA-routed supabase client) so they
 * are safe to run in the QA APK and verify routing + RLS + grants end-to-end.
 */
export const smokeActions: QATestAction[] = [
  {
    id: 'smoke.count-retailers',
    label: 'Count retailers (qa_retailers)',
    entity: 'Smoke',
    inputs: [],
    run: async () => {
      const { count, error } = await supabase
        .from(table('retailers') as any)
        .select('id', { count: 'exact', head: true });
      if (error) return { pass: false, errorMessage: error.message };
      return { pass: true, output: { count } };
    },
  },
  {
    id: 'smoke.list-products',
    label: 'List 5 products (qa_products)',
    entity: 'Smoke',
    inputs: [],
    run: async () => {
      const { data, error } = await supabase
        .from(table('products') as any)
        .select('id, name')
        .limit(5);
      if (error) return { pass: false, errorMessage: error.message };
      return { pass: true, output: { rows: data?.length ?? 0 } };
    },
  },
  {
    id: 'smoke.create-temp-retailer',
    label: 'Create + delete temp retailer (qa_retailers)',
    entity: 'Smoke',
    inputs: [],
    run: async (_input, ctx) => {
      const { data: userRes, error: uErr } = await supabase.auth.getUser();
      if (uErr || !userRes.user) {
        return { pass: false, errorMessage: 'Not authenticated' };
      }
      // qa_retailers.beat_id is NOT NULL — resolve any existing beat.
      const { data: beats, error: bErr } = await supabase
        .from(table('beats') as any)
        .select('id')
        .limit(1);
      if (bErr) return { pass: false, errorMessage: `beat lookup failed: ${bErr.message}` };
      let beatId: string | null = beats?.[0]?.id ?? null;
      if (!beatId) {
        const { data: newBeat, error: nbErr } = await supabase
          .from(table('beats') as any)
          .insert({ beat_name: `QA-BEAT-${crypto.randomUUID().slice(0, 6)}` } as any)
          .select('id')
          .single();
        if (nbErr) return { pass: false, errorMessage: `beat seed failed: ${nbErr.message}` };
        beatId = newBeat.id;
      }

      const name = `QA-TEST-${crypto.randomUUID().slice(0, 8)}`;
      const { data, error } = await supabase
        .from(table('retailers') as any)
        .insert({
          name,
          user_id: userRes.user.id,
          beat_id: beatId,
          address: 'QA Test Address',
          status: 'active',
          qa_run_id: ctx.runId,
        } as any)
        .select('id')
        .single();
      if (error) return { pass: false, errorMessage: `insert failed: ${error.message}` };
      ctx.remember('retailer', data);
      const { error: delErr } = await supabase
        .from(table('retailers') as any)
        .delete()
        .eq('id', data.id);
      if (delErr) return { pass: false, errorMessage: `delete failed: ${delErr.message}` };
      return { pass: true, output: { id: data.id, name } };
    },
  },
  {
    id: 'smoke.create-temp-beat-plan',
    label: 'Create + delete temp beat plan (qa_beat_plans)',
    entity: 'Smoke',
    inputs: [],
    run: async () => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) {
        return { pass: false, errorMessage: 'no authenticated user' };
      }
      // qa_beat_plans.beat_name is NOT NULL — get both id + name.
      let beatId: string | null = null;
      let beatName: string | null = null;
      const { data: beats } = await supabase
        .from(table('beats') as any)
        .select('id, beat_name')
        .limit(1);
      if (beats && beats.length) {
        beatId = beats[0].id;
        beatName = (beats[0] as any).beat_name ?? `QA-BEAT-${beats[0].id.slice(0, 6)}`;
      } else {
        const seedName = `QA-BEAT-${crypto.randomUUID().slice(0, 6)}`;
        const { data: newBeat, error: bErr } = await supabase
          .from(table('beats') as any)
          .insert({ beat_name: seedName } as any)
          .select('id, beat_name')
          .single();
        if (bErr) return { pass: false, errorMessage: `beat insert failed: ${bErr.message}` };
        beatId = newBeat.id;
        beatName = (newBeat as any).beat_name ?? seedName;
      }

      const planDate = format(new Date(), 'yyyy-MM-dd');
      const { data: plan, error: pErr } = await supabase
        .from(table('beat_plans') as any)
        .insert({
          user_id: userRes.user.id,
          beat_id: beatId,
          beat_name: beatName,
          plan_date: planDate,
          beat_data: {},
        } as any)
        .select('id')
        .single();
      if (pErr) return { pass: false, errorMessage: `plan insert failed: ${pErr.message}` };

      const { error: delErr } = await supabase
        .from(table('beat_plans') as any)
        .delete()
        .eq('id', plan.id);
      if (delErr) return { pass: false, errorMessage: `plan delete failed: ${delErr.message}` };
      return { pass: true, output: { beat_id: beatId, plan_id: plan.id } };
    },
  },
];
