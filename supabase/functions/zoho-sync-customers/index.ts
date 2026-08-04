import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Auth runs through the Lovable connector gateway — Lovable holds and refreshes
// the Zoho OAuth token, so no client id / secret / refresh token is needed here.
const GATEWAY_URL = 'https://connector-gateway.lovable.dev/zoho_books';
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const ZOHO_BOOKS_API_KEY = Deno.env.get('ZOHO_BOOKS_API_KEY');
const PREFERRED_ORG_ID = Deno.env.get('ZOHO_ORG_ID') ?? null;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Zoho Books allows ~100 calls/minute. Keep a gap between calls in sync_all.
const CALL_DELAY_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function gatewayHeaders() {
  if (!LOVABLE_API_KEY || !ZOHO_BOOKS_API_KEY) {
    throw new Error('[400] Zoho Books connector is not linked to this project (missing LOVABLE_API_KEY or ZOHO_BOOKS_API_KEY)');
  }
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    'X-Connection-Api-Key': ZOHO_BOOKS_API_KEY,
    'Content-Type': 'application/json',
  };
}

async function gatewayFetch(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  orgId: string | null,
  payload?: unknown,
): Promise<{ ok: boolean; status: number; body: any; raw: string }> {
  const url = new URL(`${GATEWAY_URL}${path}`);
  if (orgId) url.searchParams.set('organization_id', orgId);

  const res = await fetch(url.toString(), {
    method,
    headers: gatewayHeaders(),
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const raw = await res.text();
  let body: any = raw;
  try {
    body = JSON.parse(raw);
  } catch {
    // keep raw text
  }
  return { ok: res.ok, status: res.status, body, raw };
}

let cachedOrgId: string | null = null;
let cachedGstEnabled: boolean | null = null;

/** Resolve the organization to operate on: preferred ZOHO_ORG_ID if visible, else default org. */
async function getOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const res = await gatewayFetch('GET', '/organizations', null);
  if (!res.ok) {
    throw new Error(`[${res.status}] Zoho GET /organizations failed: ${res.raw}`);
  }
  const orgs: any[] = res.body?.organizations ?? [];
  if (!orgs.length) throw new Error('[400] No Zoho Books organizations visible to this connection');
  const match = PREFERRED_ORG_ID ? orgs.find((o) => String(o.organization_id) === String(PREFERRED_ORG_ID)) : null;
  const chosen = match ?? orgs.find((o) => o.is_default_org) ?? orgs[0];
  cachedOrgId = String(chosen.organization_id);
  cachedGstEnabled = chosen.is_gst_enabled === true;
  return cachedOrgId;
}

/** True only when the active Zoho org has GST enabled (India GST fields are invalid otherwise). */
async function isGstEnabled(): Promise<boolean> {
  if (cachedGstEnabled === null) await getOrgId();
  return cachedGstEnabled === true;
}


async function zohoGet(path: string) {
  const orgId = await getOrgId();
  const res = await gatewayFetch('GET', path, orgId);
  if (!res.ok) {
    throw new Error(`[${res.status}] Zoho GET ${path} failed: ${res.raw}`);
  }
  return res.body;
}

async function zohoWrite(
  method: 'POST' | 'PUT',
  path: string,
  payload: unknown,
): Promise<{ ok: boolean; status: number; body: any }> {
  const orgId = await getOrgId();
  const { ok, status, body } = await gatewayFetch(method, path, orgId, payload);
  return { ok, status, body };
}


/**
 * India GST fields (gst_treatment, gst_no, place_of_supply, pan_no) are only valid
 * when the Zoho org has GST enabled — otherwise Zoho returns
 * {"code":8,"message":"Invalid Element gst_treatment"}.
 */
function buildContactPayload(r: Record<string, any>, gstEnabled: boolean) {
  const gst = typeof r.gst_number === 'string' ? r.gst_number.trim() : '';
  const hasValidGst = gst.length === 15;

  const payload: Record<string, any> = {
    contact_name: (r.name ?? '').trim(),
    company_name: r.legal_name || (r.name ?? '').trim(),
    contact_type: 'customer',
    currency_code: r.currency || 'INR',
  };

  if (gstEnabled) {
    payload.place_of_supply = r.state ?? null;
    payload.gst_treatment = hasValidGst ? 'business_gst' : 'consumer';
    if (hasValidGst) payload.gst_no = gst;
    if (r.pan_no) payload.pan_no = r.pan_no;
  }

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
  opts: { dryRun: boolean; syncedBy: string | null },
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

  const isUpdate = Boolean(retailer.zoho_contact_id);
  const path = isUpdate ? `/contacts/${retailer.zoho_contact_id}` : '/contacts';
  const result = await zohoWrite(isUpdate ? 'PUT' : 'POST', path, payload);


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
    ['LOVABLE_API_KEY', LOVABLE_API_KEY],
    ['ZOHO_BOOKS_API_KEY', ZOHO_BOOKS_API_KEY],
  ].filter(([, v]) => !v).map(([k]) => k);

  // dry runs need no credentials either
  const needsSecrets = !(dryRun && (mode === 'sync' || mode === 'sync_all'));
  if (missing.length && needsSecrets) {
    return json({ error: 'Zoho Books connector is not linked to this project', missing }, 500);
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

      const results: SyncOutcome[] = [];

      for (let i = 0; i < ids.length; i += 1) {
        results.push(await syncOneRetailer(db, ids[i], { dryRun, syncedBy }));
        if (!dryRun && i < ids.length - 1) await sleep(CALL_DELAY_MS);
      }

      const counts = results.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {});

      return json({ ok: true, mode, dry_run: dryRun, processed: results.length, counts, results });
    }

    if (mode === 'customers') {
      const orgId = await getOrgId();
      const data = await zohoGet('/contacts?contact_type=customer&per_page=25');
      return json({
        ok: true,
        organization_id: orgId,
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

    // Default: read-only verification of which org the connector is authorized against
    const orgs = await zohoGet('/organizations');
    const activeOrgId = await getOrgId();

    const list = orgs.organizations ?? [];

    return json({
      ok: true,
      token_valid: true,
      auth_mode: 'lovable_connector_gateway',
      configured_org_id: activeOrgId,
      configured_org_accessible: list.some((o: Record<string, unknown>) => String(o.organization_id) === activeOrgId),
      organizations: list.map((o: Record<string, unknown>) => ({
        organization_id: o.organization_id,
        name: o.name,
        contact_name: o.contact_name,
        email: o.email,
        country: o.country,
        currency_code: o.currency_code,
        is_configured: String(o.organization_id) === activeOrgId,
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
