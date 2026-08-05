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

    // Path must live under this subscription's folder.
    if (!storage_path.startsWith(`${subscription_id}/`)) {
      return new Response(JSON.stringify({ error: 'Path mismatch' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Use is_admin_or_manager() for parity with the write path (RLS on report_subscriptions).
    const userClientForRpc = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isAdmin } = await userClientForRpc.rpc('is_admin_or_manager');

    // Reports are now scoped per recipient, and the file name carries the scope
    // user's uuid — a guessable path. Membership of recipient_user_ids is
    // therefore not enough: the caller must have been delivered THIS exact file.
    // The delivery log is the record of that, so it is the authority here.
    // Admins keep a blanket pass for the subscription history view.
    let allowed = !!isAdmin;
    if (!allowed) {
      const { data: delivered } = await admin
        .from('report_delivery_log')
        .select('id')
        .eq('subscription_id', subscription_id)
        .eq('recipient_user_id', userId)
        .eq('storage_path', storage_path)
        .limit(1);
      allowed = (delivered?.length ?? 0) > 0;
    }
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
