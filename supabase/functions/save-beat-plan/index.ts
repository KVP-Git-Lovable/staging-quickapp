import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SaveDay {
  date: string;
  day?: string;
  beat_id: string;
  beat_name: string;
  retailers?: Array<{
    retailer_id?: string;
    id?: string;
    retailer_name?: string;
    name?: string;
    priority_score?: number;
    reasons?: string[];
  }>;
  estimated_value?: number;
  rationale?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const { data: userData } = await supabaseClient.auth.getUser(token);
    const callerId = userData?.user?.id;
    if (!callerId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { userId, fromDate, toDate, days } = body as {
      userId: string;
      fromDate: string;
      toDate: string;
      days: SaveDay[];
    };

    if (!userId || !fromDate || !toDate || !Array.isArray(days)) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Caller must be saving for self (admins use a different cron path).
    if (callerId !== userId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('id, full_name')
      .eq('id', userId)
      .maybeSingle();

    // 1. Remove existing auto-generated plans in the date range (preserve pre-scheduled / manual)
    const { data: existingInRange } = await supabaseClient
      .from('beat_plans')
      .select('id, beat_data, plan_date')
      .eq('user_id', userId)
      .gte('plan_date', fromDate)
      .lte('plan_date', toDate);

    const autoIds = (existingInRange || [])
      .filter((p: any) => p.beat_data?.auto_generated)
      .map((p: any) => p.id);

    if (autoIds.length > 0) {
      await supabaseClient.from('beat_plans').delete().in('id', autoIds);
    }

    const prescheduledDates = new Set(
      (existingInRange || [])
        .filter((p: any) => !p.beat_data?.auto_generated)
        .map((p: any) => p.plan_date)
    );

    // 2. Build inserts from user-edited days, skipping pre-scheduled dates
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const plansToInsert = days
      .filter((d) => d && d.date && d.beat_id && !prescheduledDates.has(d.date))
      .map((d) => ({
        user_id: userId,
        beat_id: d.beat_id,
        plan_date: d.date,
        day_of_week: d.day || dayNames[new Date(d.date + 'T00:00:00').getDay()],
        beat_data: {
          beat_name: d.beat_name,
          auto_generated: true,
          rationale: d.rationale || '',
          retailers: (d.retailers || []).map((r) => ({
            id: r.retailer_id || r.id,
            name: r.retailer_name || r.name,
            priority_score: r.priority_score ?? 0,
            reasons: r.reasons || [],
          })),
          estimated_value: d.estimated_value ?? 0,
        },
      }));

    let plansCreated = 0;
    if (plansToInsert.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('beat_plans')
        .insert(plansToInsert);
      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      plansCreated = plansToInsert.length;

      // Log autonomous action (best-effort)
      try {
        await supabaseClient.from('ai_autonomous_actions').insert({
          user_id: userId,
          action_type: 'auto_beat_plan',
          action_data: {
            planning_period: { start: fromDate, end: toDate },
            plans_created: plansCreated,
            prescheduled_preserved: prescheduledDates.size,
            edited: true,
          },
          status: 'executed',
          executed_at: new Date().toISOString(),
          can_undo: true,
          undo_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      } catch (e) {
        console.log('Could not log autonomous action:', e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results: [
          {
            userId,
            userName: profile?.full_name || '',
            status: 'success',
            plansCreated,
            prescheduledPreserved: prescheduledDates.size,
            planningPeriod: { start: fromDate, end: toDate },
            weeklyPlan: days.filter((d) => d.beat_id),
            rationales: [],
          },
        ],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('save-beat-plan error', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
