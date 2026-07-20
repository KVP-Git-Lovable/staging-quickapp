// Cron-triggered dispatcher. Finds due report subscriptions and invokes generate-report per subscription.
// Also supports manual "Run now" from the admin UI when called with { subscription_id, mode: 'manual' }.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { computePeriod, isDue } from '../_shared/reportPeriod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    const providedSecret = req.headers.get('x-cron-secret');
    let isCron = !!providedSecret && providedSecret === Deno.env.get('CRON_SECRET');
    if (!isCron && providedSecret) {
      // Also allow the push_config trigger_secret (used by the DB cron job)
      const admin0 = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data: cfg } = await admin0.from('push_config').select('trigger_secret').eq('id', true).maybeSingle();
      if (cfg?.trigger_secret && providedSecret === cfg.trigger_secret) isCron = true;
    }
    const authHeader = req.headers.get('Authorization');
    const isManual = body?.mode === 'manual' && !!body?.subscription_id;

    if (!isCron && !isManual) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Manual "Run now" — authenticated admin user
    if (isManual) {
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
      }
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims, error: cErr } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
      if (cErr || !claims?.claims?.sub) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
      }
      const { data: allowed } = await userClient.rpc('is_admin_or_manager');
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
      }

      const { data: sub, error } = await admin
        .from('report_subscriptions')
        .select('id, cadence')
        .eq('id', body.subscription_id)
        .maybeSingle();
      if (error || !sub) {
        return new Response(JSON.stringify({ error: 'Subscription not found' }), { status: 404, headers: corsHeaders });
      }
      const period = computePeriod(sub.cadence);
      const result = await invokeGenerate(sub.id, period, 'manual');
      return new Response(JSON.stringify({ ok: true, ...result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cron path
    const { data: subs } = await admin
      .from('report_subscriptions')
      .select('id, cadence, fire_day, fire_time, timezone, last_fired_at')
      .eq('status', 'active');

    const results: Array<Record<string, unknown>> = [];
    for (const s of subs ?? []) {
      if (!isDue(s.cadence, s.fire_day, String(s.fire_time), s.timezone ?? 'Asia/Kolkata')) continue;
      const period = computePeriod(s.cadence);
      // Idempotency — skip if last fired in current period
      if (s.last_fired_at) {
        const last = new Date(s.last_fired_at);
        const nowKey = period.key;
        const lastPeriod = computePeriod(s.cadence, last).key;
        if (lastPeriod === nowKey) {
          results.push({ subscription_id: s.id, skipped: 'already_fired', period: nowKey });
          continue;
        }
      }
      try {
        const r = await invokeGenerate(s.id, period, 'scheduled');
        results.push({ subscription_id: s.id, period: period.key, ...r });
      } catch (e) {
        results.push({ subscription_id: s.id, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('report-dispatcher error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function invokeGenerate(subscriptionId: string, period: { key: string; label: string; date_from: string; date_to: string }, mode: string) {
  const url = `${SUPABASE_URL}/functions/v1/generate-report`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify({ subscription_id: subscriptionId, period, mode }),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}
