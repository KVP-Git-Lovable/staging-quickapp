import type { QATestAction } from '@/qa/types';
import { supabase } from '@/integrations/supabase/client';
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
        .from('retailers')
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
        .from('products')
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
      const name = `QA-TEST-${crypto.randomUUID().slice(0, 8)}`;
      const { data, error } = await supabase
        .from('retailers')
        .insert({ name, status: 'active' } as any)
        .select('id')
        .single();
      if (error) return { pass: false, errorMessage: `insert failed: ${error.message}` };
      ctx.remember('retailer', data);
      const { error: delErr } = await supabase.from('retailers').delete().eq('id', data.id);
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
      // Pick any beat from the qa_beats mirror; create one on-the-fly if none.
      let beatId: string | null = null;
      const { data: beats } = await supabase.from('beats').select('id').limit(1);
      if (beats && beats.length) {
        beatId = beats[0].id;
      } else {
        const { data: newBeat, error: bErr } = await supabase
          .from('beats')
          .insert({ name: `QA-BEAT-${crypto.randomUUID().slice(0, 6)}` } as any)
          .select('id')
          .single();
        if (bErr) return { pass: false, errorMessage: `beat insert failed: ${bErr.message}` };
        beatId = newBeat.id;
      }

      const planDate = format(new Date(), 'yyyy-MM-dd');
      const { data: plan, error: pErr } = await supabase
        .from('beat_plans')
        .insert({
          user_id: userRes.user.id,
          beat_id: beatId,
          plan_date: planDate,
        } as any)
        .select('id')
        .single();
      if (pErr) return { pass: false, errorMessage: `plan insert failed: ${pErr.message}` };

      const { error: delErr } = await supabase.from('beat_plans').delete().eq('id', plan.id);
      if (delErr) return { pass: false, errorMessage: `plan delete failed: ${delErr.message}` };
      return { pass: true, output: { beat_id: beatId, plan_id: plan.id } };
    },
  },
];
