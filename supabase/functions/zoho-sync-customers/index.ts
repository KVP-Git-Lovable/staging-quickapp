import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Zoho Books allows ~100 calls/minute. Keep a gap between calls in sync_all.
const CALL_DELAY_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

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

async function zohoWrite(
  method: 'POST' | 'PUT',
  path: string,
  payload: unknown,
  accessToken: string,
  apiBase: string,
): Promise<{ ok: boolean; status: number; body: any }> {
  const url = new URL(`${apiBase}${path}`);
  url.searchParams.set('organization_id', ORG_ID!);

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep raw text
  }
  return { ok: res.ok, status: res.status, body };
}

/**
 * Zoho Books India rejects a contact (or applies the wrong tax) without
 * place_of_supply / gst_treatment / currency_code, so they are always sent.
 */
function buildContactPayload(r: Record<string, any>) {
  const gst = typeof r.gst_number === 'string' ? r.gst_number.trim() : '';
  const hasValidGst = gst.length === 15;

  const payload: Record<string, any> = {
    contact_name: (r.name ?? '').trim(),
    company_name: r.legal_name || (r.name ?? '').trim(),
    contact_type: 'customer',
    place_of_supply: r.state ?? null,
    gst_treatment: hasValidGst ? 'business_gst' : 'consumer',
    currency_code: r.currency || 'INR',
  };

  if (hasValidGst) payload.gst_no = gst;
  if (r.pan_no) payload.pan_no = r.pan_no;
  if (r.phone) payload.phone = r.phone;
  if (r.phone) payload.mobile = r.phone;
  if (r.email) payload.email = r.email;

  payload.contact_persons = [
    {
      first_name: (r.name ?? '').trim(),
      email: r.email ?? undefined,
      phone: r.phone ?? undefined,
      mobile: r.phone ?? undefined,
      is_primary_contact: true,
    },
  ];

  if (r.city || r.state || r.pincode) {
    payload.billing_address = {
      address: r.address ?? undefined,
      city: r.city ?? undefined,
      state: r.state ?? undefined,
      zip: r.pincode ?? undefined,
      country: r.country || 'India',
    };
  }

  return payload;
}

type SyncOutcome = {
  retailer_id: string;
  name: string;
  status: 'synced' | 'updated' | 'skipped' | 'failed' | 'dry_run';
  blocker?: string | null;
  error?: string | null;
  zoho_contact_id?: string | null;
  payload?: Record<string, any>;
};

async function logSync(
  db: ReturnType<typeof admin>,
  row: {
    retailer_id: string;
    action: string;
    http_status?: number | null;
    error_message?: string | null;
    request_payload?: unknown;
    response_payload?: unknown;
    synced_by?: string | null;
  },
) {
  await db.from('zoho_sync_log').insert({
    entity_type: 'retailer',
    retailer_id: row.retailer_id,
    action: row.action,
    http_status: row.http_status ?? null,
    error_message: row.error_message ?? null,
    request_payload: (row.request_payload ?? null) as any,
    response_payload: (row.response_payload ?? null) as any,
    synced_by: row.synced_by ?? null,
  });
}

async function syncOneRetailer(
  db: ReturnType<typeof admin>,
  retailerId: string,
  opts: { dryRun: boolean; syncedBy: string | null; token?: { accessToken: string; apiBase: string } },
): Promise<SyncOutcome> {
  const { data: retailer, error: rErr } = await db
    .from('retailers')
    .select('id, name, legal_name, phone, email, address, city, state, pincode, country, gst_number, pan_no, currency, zoho_contact_id')
    .eq('id', retailerId)
    .maybeSingle();

  if (rErr || !retailer) {
    return { retailer_id: retailerId, name: '', status: 'failed', error: rErr?.message ?? 'Retailer not found' };
  }

  // Readiness gate — never burn a Zoho API call on a row Zoho will reject.
  const { data: readiness } = await db
    .from('zoho_sync_readiness')
    .select('is_ready, blocker')
    .eq('id', retailerId)
    .maybeSingle();

  if (readiness && readiness.is_ready === false) {
    const blocker = readiness.blocker ?? 'not ready';
    await logSync(db, { retailer_id: retailerId, action: 'skip', error_message: blocker, synced_by: opts.syncedBy });
    await db
      .from('retailers')
      .update({ zoho_sync_status: 'skipped', zoho_sync_error: blocker })
      .eq('id', retailerId);
    return { retailer_id: retailerId, name: retailer.name, status: 'skipped', blocker };
  }

  const payload = buildContactPayload(retailer);

  if (opts.dryRun) {
    return { retailer_id: retailerId, name: retailer.name, status: 'dry_run', payload };
  }

  const token = opts.token ?? (await getAccessToken());
  const isUpdate = Boolean(retailer.zoho_contact_id);
  const path = isUpdate ? `/contacts/${retailer.zoho_contact_id}` : '/contacts';
  const result = await zohoWrite(isUpdate ? 'PUT' : 'POST', path, payload, token.accessToken, token.apiBase);

  const zohoOk = result.ok && (result.body?.code === 0 || result.body?.code === undefined);

  if (!zohoOk) {
    const message =
      typeof result.body === 'object' && result.body?.message
        ? String(result.body.message)
        : typeof result.body === 'string'
          ? result.body
          : 'Zoho rejected the contact';
    await logSync(db, {
      retailer_id: retailerId,
      action: isUpdate ? 'update' : 'create',
      http_status: result.status,
      error_message: message,
      request_payload: payload,
      response_payload: result.body,
      synced_by: opts.syncedBy,
    });
    await db.from('retailers').update({ zoho_sync_status: 'failed', zoho_sync_error: message }).eq('id', retailerId);
    return { retailer_id: retailerId, name: retailer.name, status: 'failed', error: message };
  }

  const contactId = result.body?.contact?.contact_id ?? retailer.zoho_contact_id ?? null;

  await logSync(db, {
    retailer_id: retailerId,
    action: isUpdate ? 'update' : 'create',
    http_status: result.status,
    request_payload: payload,
    response_payload: result.body,
    synced_by: opts.syncedBy,
  });

  await db
    .from('retailers')
    .update({
      zoho_contact_id: contactId,
      zoho_synced_at: new Date().toISOString(),
      zoho_sync_status: 'synced',
      zoho_sync_error: null,
    })
    .eq('id', retailerId);

  return {
    retailer_id: retailerId,
    name: retailer.name,
    status: isUpdate ? 'updated' : 'synced',
    zoho_contact_id: contactId,
  };
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

  let mode = 'verify';
  let dryRun = false;
  let retailerIds: string[] = [];
  let limit = 250;

  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (body && typeof body.mode === 'string') mode = body.mode;
      if (body && body.dry_run === true) dryRun = true;
      if (body && Array.isArray(body.retailer_ids)) retailerIds = body.retailer_ids.filter((x: unknown) => typeof x === 'string');
      if (body && typeof body.limit === 'number') limit = Math.min(Math.max(1, body.limit), 500);
    }
  } catch {
    // ignore, keep defaults
  }

  const db = admin();

  // Caller identity (best-effort, used only for audit rows)
  let syncedBy: string | null = null;
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const { data } = await db.auth.getUser(authHeader.replace('Bearer ', ''));
    syncedBy = data?.user?.id ?? null;
  }

  // readiness works WITHOUT Zoho secrets so data quality can be checked first.
  if (mode === 'readiness') {
    const { data, error } = await db.from('zoho_sync_readiness').select('blocker, is_ready, zoho_sync_status');
    if (error) return json({ ok: false, error: error.message }, 500);

    const rows = data ?? [];
    const blockers: Record<string, number> = {};
    let ready = 0;
    const statuses: Record<string, number> = {};
    for (const r of rows) {
      if (r.is_ready) ready += 1;
      else blockers[r.blocker ?? 'unknown'] = (blockers[r.blocker ?? 'unknown'] ?? 0) + 1;
      const s = r.zoho_sync_status ?? 'not_synced';
      statuses[s] = (statuses[s] ?? 0) + 1;
    }
    return json({
      ok: true,
      total: rows.length,
      ready,
      blocked: rows.length - ready,
      blockers,
      statuses,
    });
  }

  const missing = [
    ['ZOHO_CLIENT_ID', CLIENT_ID],
    ['ZOHO_CLIENT_SECRET', CLIENT_SECRET],
    ['ZOHO_REFRESH_TOKEN', REFRESH_TOKEN],
    ['ZOHO_ORG_ID', ORG_ID],
  ].filter(([, v]) => !v).map(([k]) => k);

  // dry runs need no credentials either
  const needsSecrets = !(dryRun && (mode === 'sync' || mode === 'sync_all'));
  if (missing.length && needsSecrets) {
    return json({ error: 'Missing Zoho secrets', missing }, 500);
  }

  try {
    if (mode === 'sync' || mode === 'sync_all') {
      let ids = retailerIds;
      if (mode === 'sync_all' || ids.length === 0) {
        const { data, error } = await db
          .from('zoho_sync_readiness')
          .select('id')
          .eq('is_ready', true)
          .limit(limit);
        if (error) return json({ ok: false, error: error.message }, 500);
        const readyIds = (data ?? []).map((r: any) => r.id).filter(Boolean);
        ids = mode === 'sync_all' ? readyIds : ids;
      }

      if (ids.length === 0) return json({ ok: true, dry_run: dryRun, processed: 0, results: [] });

      const token = dryRun ? undefined : await getAccessToken();
      const results: SyncOutcome[] = [];

      for (let i = 0; i < ids.length; i += 1) {
        results.push(await syncOneRetailer(db, ids[i], { dryRun, syncedBy, token }));
        if (!dryRun && i < ids.length - 1) await sleep(CALL_DELAY_MS);
      }

      const counts = results.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {});

      return json({ ok: true, mode, dry_run: dryRun, processed: results.length, counts, results });
    }

    const { accessToken, apiBase } = await getAccessToken();

    if (mode === 'customers') {
      const data = await zohoGet('/contacts?contact_type=customer&per_page=25', accessToken, apiBase);
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
    const orgs = await zohoGet('/organizations', accessToken, apiBase);

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
