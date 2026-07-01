/**
 * QA-only: Visit creation.
 *
 * Programmatic (no UI drive): the visit-start button in MyVisits is gated
 * by an active attendance session, which itself requires camera face-match
 * + GPS — neither is triggerable from a WebView. Per the same pattern used
 * by offlineSyncActions we insert into the qa_* mirrors directly via the
 * routed supabase client, so the flow runs hands-free while still
 * exercising qa RLS + grants.
 */
import type { QATestAction } from '@/qa/types';
import { supabase } from '@/integrations/supabase/client';
import { table } from '@/lib/tableRouter';

export const visitActions: QATestAction[] = [
  {
    id: 'visit.create',
    label: 'Create Visit (qa_visits)',
    entity: 'Visits',
    description:
      'Ensures an attendance row exists for today, then inserts a visit ' +
      'for the retailer from context. Fully hands-free — no camera or ' +
      'GPS prompts.',
    inputs: [
      {
        key: 'retailer_id',
        label: 'Retailer ID',
        type: 'string',
        fromContext: 'retailer.id',
        required: true,
      },
    ],
    run: async (input, ctx) => {
      try {
        const { data: userRes, error: uErr } = await supabase.auth.getUser();
        if (uErr || !userRes.user) {
          return { pass: false, errorMessage: 'No authenticated user for QA session.' };
        }
        const userId = userRes.user.id;
        const todayIso = new Date().toISOString().slice(0, 10);
        const nowIso = new Date().toISOString();
        const gps = { lat: 12.9716, lng: 77.5946, accuracy: 10 };

        // 1) Attendance — insert only if today's row is missing.
        const { data: att } = await supabase
          .from(table('attendance') as any)
          .select('id, check_in_time')
          .eq('user_id', userId)
          .eq('date', todayIso)
          .maybeSingle();

        if (!att) {
          const { error: attErr } = await supabase
            .from(table('attendance') as any)
            .insert({
              user_id: userId,
              date: todayIso,
              check_in_time: nowIso,
              check_in_location: gps,
              check_in_address: 'QA stub - Bengaluru',
              status: 'present',
              qa_run_id: ctx.runId,
            } as any);
          if (attErr) {
            return { pass: false, errorMessage: `Attendance seed failed: ${attErr.message}` };
          }
        }

        // 2) Visit row.
        const { data: visit, error: vErr } = await supabase
          .from(table('visits') as any)
          .insert({
            user_id: userId,
            retailer_id: input.retailer_id,
            planned_date: todayIso,
            status: 'in_progress',
            check_in_time: nowIso,
            check_in_location: gps,
            check_in_address: 'QA stub - Bengaluru',
            visit_type: 'planned',
            qa_run_id: ctx.runId,
          } as any)
          .select('id, user_id, retailer_id, planned_date')
          .single();

        if (vErr) return { pass: false, errorMessage: `Visit insert failed: ${vErr.message}` };

        ctx.remember('visit', visit);
        return { pass: true, output: visit };
      } catch (e: any) {
        return { pass: false, errorMessage: e?.message ?? String(e) };
      }
    },
  },
];
