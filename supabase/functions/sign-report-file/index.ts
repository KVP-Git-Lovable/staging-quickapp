// Mints a short-lived signed URL for a report file after verifying the caller is a recipient
// of the owning subscription.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: c, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !c?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = c.claims.sub;

    const { subscription_id, storage_path } = await req.json();
    if (!subscription_id || !storage_path || typeof storage_path !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: sub } = await admin
      .from('report_subscriptions')
      .select('recipient_user_ids, created_by')
      .eq('id', subscription_id)
      .maybeSingle();

    const isAdmin = !!(await admin.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle()).data;
    const allowed = isAdmin || !!sub && (sub.created_by === userId || (sub.recipient_user_ids ?? []).includes(userId));
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Path must live under this subscription's folder
    if (!storage_path.startsWith(`${subscription_id}/`)) {
      return new Response(JSON.stringify({ error: 'Path mismatch' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: signed, error: sErr } = await admin.storage.from('report-files').createSignedUrl(storage_path, 300);
    if (sErr || !signed) {
      return new Response(JSON.stringify({ error: sErr?.message ?? 'sign failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ url: signed.signedUrl, expires_in: 300 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
