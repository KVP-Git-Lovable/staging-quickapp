import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';

const BodySchema = z.object({
  retailer_id: z.string().min(1),
  retailer_name: z.string().min(1).max(200),
  mobile: z.string().min(1),
});

const TEMPLATE_ID = '6a50862e39b1722f50058a55';

function normalizeMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return null;
}

async function sendViaMsg91(mobile: string, name: string, otp: string) {
  const authkey = Deno.env.get('MSG91_AUTHKEY');
  if (!authkey) throw new Error('MSG91_AUTHKEY not configured');

  const res = await fetch('https://control.msg91.com/api/v5/flow', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authkey,
    },
    body: JSON.stringify({
      template_id: TEMPLATE_ID,
      short_url: '0',
      realTimeResponse: '1',
      recipients: [{ mobiles: mobile, OTP: name, var: otp, VAR1: name, VAR2: otp, name, otp }],
    }),
  });

  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, json, text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request', details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { retailer_id, retailer_name, mobile } = parsed.data;
    const normalized = normalizeMobile(mobile);
    if (!normalized) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid Indian mobile number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));

    console.log('[send-retailer-otp] dispatch', {
      retailer_id, retailer_name, mobile: normalized, otp,
    });

    const result = await sendViaMsg91(normalized, retailer_name, otp);
    console.log('[send-retailer-otp] msg91 response', result.status, result.json ?? result.text);

    if (!result.ok || (result.json && result.json.type && result.json.type !== 'success')) {
      const errMsg =
        (result.json && (result.json.message || result.json.description)) ||
        result.text ||
        `MSG91 request failed with status ${result.status}`;
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    console.error('[send-retailer-otp] error', e);
    return new Response(
      JSON.stringify({ success: false, error: e?.message || 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
