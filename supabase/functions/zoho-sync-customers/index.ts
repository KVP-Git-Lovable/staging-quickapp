import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Zoho is region-sharded: a refresh token only works on the datacenter it was
// minted in. Try each until one accepts the token.
const ZOHO_DCS = [
  { accounts: 'https://accounts.zoho.in', api: 'https://www.zohoapis.in/books/v3' },
  { accounts: 'https://accounts.zoho.com', api: 'https://www.zohoapis.com/books/v3' },
  { accounts: 'https://accounts.zoho.eu', api: 'https://www.zohoapis.eu/books/v3' },
  { accounts: 'https://accounts.zoho.com.au', api: 'https://www.zohoapis.com.au/books/v3' },
];

const CLIENT_ID = Deno.env.get('ZOHO_CLIENT_ID');
const CLIENT_SECRET = Deno.env.get('ZOHO_CLIENT_SECRET');
const REFRESH_TOKEN = Deno.env.get('ZOHO_REFRESH_TOKEN');
const ORG_ID = Deno.env.get('ZOHO_ORG_ID');

async function getAccessToken(): Promise<{ accessToken: string; apiBase: string }> {
  const errors: string[] = [];

  for (const dc of ZOHO_DCS) {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      refresh_token: REFRESH_TOKEN!,
    });

    const res = await fetch(`${dc.accounts}/oauth/v2/token?${params.toString()}`, {
      method: 'POST',
    });
    const body = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(body);
    } catch {
      // non-JSON body, treat as failure for this DC
    }

    if (res.ok && json.access_token) {
      return { accessToken: json.access_token as string, apiBase: dc.api };
    }
    errors.push(`${dc.accounts} -> [${res.status}] ${body}`);
  }

  throw new Error(`[400] Zoho token refresh failed on all datacenters: ${errors.join(' | ')}`);
}

async function zohoGet(path: string, accessToken: string, apiBase: string) {
  const url = new URL(`${apiBase}${path}`);
  url.searchParams.set('organization_id', ORG_ID!);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`[${res.status}] Zoho GET ${path} failed: ${text}`);
  }
  return JSON.parse(text);
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const missing = [
    ['ZOHO_CLIENT_ID', CLIENT_ID],
    ['ZOHO_CLIENT_SECRET', CLIENT_SECRET],
    ['ZOHO_REFRESH_TOKEN', REFRESH_TOKEN],
    ['ZOHO_ORG_ID', ORG_ID],
  ].filter(([, v]) => !v).map(([k]) => k);

  if (missing.length) {
    return json({ error: 'Missing Zoho secrets', missing }, 500);
  }

  let mode = 'verify';
  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (body && typeof body.mode === 'string') mode = body.mode;
    }
  } catch {
    // ignore, keep default mode
  }

  try {
    const accessToken = await getAccessToken();

    if (mode === 'customers') {
      const data = await zohoGet('/contacts?contact_type=customer&per_page=25', accessToken);
      return json({
        ok: true,
        organization_id: ORG_ID,
        count: data.contacts?.length ?? 0,
        customers: (data.contacts ?? []).map((c: Record<string, unknown>) => ({
          contact_id: c.contact_id,
          contact_name: c.contact_name,
          company_name: c.company_name,
          email: c.email,
          phone: c.phone,
          currency_code: c.currency_code,
          status: c.status,
        })),
      });
    }

    // Default: read-only verification of which org this token is authorized against
    const orgs = await zohoGet('/organizations', accessToken);
    const list = orgs.organizations ?? [];
    const active = list.find((o: Record<string, unknown>) => String(o.organization_id) === ORG_ID);

    return json({
      ok: true,
      token_valid: true,
      configured_org_id: ORG_ID,
      configured_org_accessible: Boolean(active),
      organizations: list.map((o: Record<string, unknown>) => ({
        organization_id: o.organization_id,
        name: o.name,
        contact_name: o.contact_name,
        email: o.email,
        country: o.country,
        currency_code: o.currency_code,
        is_configured: String(o.organization_id) === ORG_ID,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('zoho-sync-customers failed:', message);
    const statusMatch = message.match(/^\[(\d{3})\]/);
    const status = statusMatch ? Number(statusMatch[1]) : 500;
    return json({ ok: false, error: 'Zoho request failed', details: message }, status);
  }
});
