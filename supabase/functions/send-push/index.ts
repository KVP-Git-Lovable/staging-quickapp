import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

const PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID')!;
const SERVICE_ACCOUNT_RAW = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

let cachedToken: { token: string; exp: number } | null = null;
let cachedTriggerSecret: { value: string; exp: number } | null = null;

async function loadTriggerSecret(admin: ReturnType<typeof createClient>): Promise<string | null> {
  const now = Date.now();
  if (cachedTriggerSecret && cachedTriggerSecret.exp > now) return cachedTriggerSecret.value;
  const { data, error } = await admin
    .from('push_config')
    .select('trigger_secret')
    .eq('id', true)
    .maybeSingle();
  if (error || !data?.trigger_secret) return null;
  cachedTriggerSecret = { value: data.trigger_secret as string, exp: now + 5 * 60 * 1000 };
  return cachedTriggerSecret.value;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const sa = JSON.parse(SERVICE_ACCOUNT_RAW);
  const key = await importPrivateKey(sa.private_key);
  const jwt = await create(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: getNumericDate(0),
      exp: getNumericDate(3600),
    },
    key,
  );
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const j = await resp.json();
  if (!resp.ok) throw new Error('OAuth token error: ' + JSON.stringify(j));
  cachedToken = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return cachedToken.token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Validate shared secret from DB trigger. Fail closed: if the secret can't
    // be loaded from push_config, reject the request rather than skipping.
    const providedSecret = req.headers.get('x-push-secret') ?? '';
    const expectedSecret = await loadTriggerSecret(admin);
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json();
    const { user_id, title, body: messageBody, data } = payload ?? {};
    if (!user_id || !title || !messageBody) {
      return new Response(JSON.stringify({ error: 'missing fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Master push toggle from notification_preferences (template_type='push_master')
    const { data: pref } = await admin
      .from('notification_preferences')
      .select('is_enabled')
      .eq('user_id', user_id)
      .eq('template_type', 'push_master')
      .maybeSingle();
    if (pref && pref.is_enabled === false) {
      return new Response(JSON.stringify({ skipped: 'push_disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: tokens } = await admin
      .from('push_device_tokens')
      .select('id, token, platform')
      .eq('user_id', user_id);

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;
    const route = data?.route ?? '/';
    const stringData: Record<string, string> = {};
    for (const [k, v] of Object.entries(data ?? {})) {
      if (v !== null && v !== undefined) stringData[k] = String(v);
    }

    let sent = 0;
    const stale: string[] = [];
    const errors: string[] = [];
    await Promise.all(
      tokens.map(async (t) => {
        const message = {
          message: {
            token: t.token,
            notification: { title, body: messageBody },
            data: stringData,
            android: {
              priority: 'HIGH',
              notification: { channel_id: 'default', click_action: 'FLUTTER_NOTIFICATION_CLICK' },
            },
            webpush: {
              notification: { title, body: messageBody, icon: '/icons/app-icon.png' },
              fcm_options: { link: route },
            },
          },
        };
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        });
        if (r.ok) {
          sent++;
        } else {
          const txt = await r.text();
          if (r.status === 404 || r.status === 410 || txt.includes('UNREGISTERED')) {
            stale.push(t.id);
          }
          errors.push(`${r.status}:${txt.slice(0, 200)}`);
          console.error('FCM error', r.status, txt);
        }
      }),
    );

    if (stale.length > 0) {
      await admin.from('push_device_tokens').delete().in('id', stale);
    }

    try {
      await admin.from('notification_event_log').insert({
        event_code: 'push_dispatch',
        source_table: 'notifications',
        record_id: data?.notification_id ? String(data.notification_id) : null,
        actor_user_id: user_id,
        processed: sent > 0,
        metadata: {
          attempted: tokens.length,
          sent,
          stale: stale.length,
          errors: errors.slice(0, 5),
        },
      });
    } catch (logErr) {
      console.error('log insert failed', logErr);
    }

    return new Response(JSON.stringify({ sent, stale: stale.length, attempted: tokens.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('send-push error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
