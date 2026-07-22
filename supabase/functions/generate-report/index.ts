// Generates a report file (Excel/PDF/summary_only), uploads to Storage,
// creates in-app notifications for recipients, and optionally pushes to their devices.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import ExcelJS from 'npm:exceljs@4.4.0';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface GenerateRequest {
  subscription_id: string;
  period: { key: string; label: string; date_from: string; date_to: string };
  mode: 'manual' | 'scheduled';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Service-role only (invoked by dispatcher)
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${SERVICE_ROLE}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const body = (await req.json()) as GenerateRequest;
  const { subscription_id, period } = body;

  const { data: sub, error: sErr } = await admin
    .from('report_subscriptions')
    .select('id, name, report_definition_id, recipient_user_ids, recipient_mode, attachment_format, push_to_phone, scope, cadence')
    .eq('id', subscription_id)
    .maybeSingle();
  if (sErr || !sub) {
    return new Response(JSON.stringify({ error: 'Subscription not found' }), { status: 404, headers: corsHeaders });
  }

  const { data: def } = await admin
    .from('report_definitions')
    .select('id, name, dataset_key, layout, config')
    .eq('id', sub.report_definition_id)
    .maybeSingle();
  if (!def) {
    return new Response(JSON.stringify({ error: 'Definition not found' }), { status: 404, headers: corsHeaders });
  }

  const { data: dataset } = await admin
    .from('reportable_datasets')
    .select('source')
    .eq('key', def.dataset_key)
    .maybeSingle();
  if (!dataset) {
    return new Response(JSON.stringify({ error: 'Dataset not found' }), { status: 404, headers: corsHeaders });
  }

  // Resolve recipients — hierarchy-aware.
  // all_managers: recompute every run so hierarchy changes are reflected without config edits.
  const recipientMode: string = sub.recipient_mode ?? 'named_users';
  let recipients: string[] = [];
  let scope: string = sub.scope ?? 'shared';
  if (recipientMode === 'all_managers') {
    const { data: mgrs, error: mErr } = await admin.rpc('report_all_managers');
    if (mErr) console.error('report_all_managers error', mErr);
    recipients = (mgrs ?? []).map((m: any) => m.user_id).filter(Boolean);
    scope = 'per_recipient'; // each manager sees only their own reporting tree
  } else {
    recipients = sub.recipient_user_ids ?? [];
  }
  const outcomes: Array<Record<string, unknown>> = [];

  // Shared: single RPC call + single file
  let sharedPath: string | null = null;
  let sharedDigest = '';
  let sharedRows: any[] = [];
  if (scope === 'shared' || recipients.length === 0) {
    const rows = await callRpc(admin, dataset.source, def, {
      date_from: period.date_from,
      date_to: period.date_to,
    });
    sharedRows = rows;
    sharedDigest = buildDigest(sub.name, period, rows);
    if (sub.attachment_format !== 'summary_only') {
      const bytes = await renderFile(sub.attachment_format, sub.name, period, rows);
      const path = `${sub.id}/${period.key}/shared.${sub.attachment_format === 'pdf' ? 'pdf' : 'xlsx'}`;
      const { error: upErr } = await admin.storage.from('report-files').upload(path, bytes, {
        contentType: sub.attachment_format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });
      if (upErr) console.error('upload err', upErr);
      else sharedPath = path;
    }
  }

  for (const rid of recipients) {
    try {
      let path = sharedPath;
      let digest = sharedDigest;
      let rows = sharedRows;

      if (scope === 'per_recipient') {
        rows = await callRpc(admin, dataset.source, def, {
          date_from: period.date_from,
          date_to: period.date_to,
          scope_user_id: rid,
        });
        // For all_managers mode, skip managers whose subtree returned no data.
        if (recipientMode === 'all_managers' && rows.length === 0) {
          await admin.from('report_delivery_log').upsert({
            subscription_id: sub.id,
            recipient_user_id: rid,
            period: period.key,
            notification_id: null,
            storage_path: null,
            in_app_status: 'skipped_empty',
            push_status: null,
            error: null,
          }, { onConflict: 'subscription_id,recipient_user_id,period' });
          outcomes.push({ recipient: rid, skipped: 'empty' });
          continue;
        }
        digest = buildDigest(sub.name, period, rows);
        if (sub.attachment_format !== 'summary_only') {
          const bytes = await renderFile(sub.attachment_format, sub.name, period, rows);
          path = `${sub.id}/${period.key}/${rid}.${sub.attachment_format === 'pdf' ? 'pdf' : 'xlsx'}`;
          await admin.storage.from('report-files').upload(path, bytes, {
            contentType: sub.attachment_format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            upsert: true,
          });
        }
      }

      const metadata: Record<string, unknown> = {
        subscription_id: sub.id,
        definition_id: def.id,
        report_name: sub.name,
        period: period.label,
        period_key: period.key,
        attachment_format: sub.attachment_format,
      };
      if (path) metadata.storage_path = path;
      if (sub.attachment_format === 'summary_only') metadata.body_md = digest;

      // Insert notification
      const { data: notif, error: nErr } = await admin
        .from('notifications')
        .insert({
          user_id: rid,
          title: sub.name,
          message: sub.attachment_format === 'summary_only' ? digest.slice(0, 500) : `${period.label} — ${rows.length} row${rows.length === 1 ? '' : 's'}`,
          type: 'report_delivery',
          related_table: 'report_subscriptions',
          related_id: sub.id,
          metadata,
        })
        .select('id')
        .single();

      let pushStatus: string | null = null;
      if (sub.push_to_phone && notif) {
        try {
          const { data: cfg } = await admin.from('push_config').select('trigger_secret').eq('id', true).maybeSingle();
          if (cfg?.trigger_secret) {
            const r = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-push-secret': cfg.trigger_secret,
              },
              body: JSON.stringify({
                user_id: rid,
                title: sub.name,
                body: `${period.label} report is ready`,
                data: {
                  route: `/notifications/${notif.id}`,
                  notification_id: notif.id,
                  type: 'report_delivery',
                },
              }),
            });
            pushStatus = r.ok ? 'sent' : `failed_${r.status}`;
          } else {
            pushStatus = 'skipped_no_secret';
          }
        } catch (pErr) {
          pushStatus = `error_${String(pErr).slice(0, 60)}`;
        }
      }

      await admin.from('report_delivery_log').upsert({
        subscription_id: sub.id,
        recipient_user_id: rid,
        period: period.key,
        notification_id: notif?.id ?? null,
        storage_path: path,
        in_app_status: nErr ? `failed_${nErr.message.slice(0, 80)}` : 'created',
        push_status: pushStatus,
        error: nErr ? nErr.message : null,
      }, { onConflict: 'subscription_id,recipient_user_id,period' });

      outcomes.push({ recipient: rid, notification_id: notif?.id, push: pushStatus });
    } catch (e) {
      console.error('per-recipient error', rid, e);
      outcomes.push({ recipient: rid, error: String(e) });
    }
  }

  await admin.from('report_subscriptions').update({ last_fired_at: new Date().toISOString() }).eq('id', sub.id);

  return new Response(JSON.stringify({ ok: true, recipients: outcomes.length, outcomes }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

async function callRpc(admin: any, source: string, def: any, filters: Record<string, unknown>): Promise<any[]> {
  const config = def.config ?? {};
  const rows = Array.isArray(config.rows) ? config.rows[0] : config.rows;
  const cols = Array.isArray(config.columns) ? config.columns[0] : config.columns;
  const values = Array.isArray(config.values)
    ? config.values.map((v: any) => (typeof v === 'string' ? v : v.key))
    : [];
  const mergedFilters = { ...(config.filters ?? {}), ...filters };
  const { data, error } = await admin.rpc(source, {
    p_layout: def.layout,
    p_rows: rows ?? null,
    p_columns: cols ?? null,
    p_values: values,
    p_filters: mergedFilters,
  });
  if (error) throw error;
  return (data ?? []) as any[];
}

function buildDigest(name: string, period: { label: string }, rows: any[]): string {
  if (!rows || rows.length === 0) return `${name} — ${period.label}\n\nNo data for this period.`;
  const preview = rows.slice(0, 10);
  const keys = Object.keys(preview[0] ?? {});
  const lines = [
    `${name} — ${period.label}`,
    `Rows: ${rows.length}`,
    '',
    keys.join(' | '),
    '-'.repeat(keys.join(' | ').length),
    ...preview.map(r => keys.map(k => String(r[k] ?? '')).join(' | ')),
  ];
  if (rows.length > preview.length) lines.push(`… (${rows.length - preview.length} more)`);
  return lines.join('\n');
}

async function renderFile(format: string, name: string, period: { label: string }, rows: any[]): Promise<Uint8Array> {
  if (format === 'pdf') return renderPdf(name, period, rows);
  return renderExcel(name, period, rows);
}

async function renderExcel(name: string, period: { label: string }, rows: any[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name.slice(0, 30) || 'Report');
  ws.addRow([name]);
  ws.addRow([`Period: ${period.label}`]);
  ws.addRow([]);
  if (rows.length > 0) {
    const keys = Object.keys(rows[0]);
    const header = ws.addRow(keys);
    header.font = { bold: true };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    for (const r of rows) ws.addRow(keys.map(k => r[k] ?? ''));
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    keys.forEach((k, i) => {
      ws.getColumn(i + 1).width = Math.max(12, Math.min(40, k.length + 4));
    });
  } else {
    ws.addRow(['No data']);
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

async function renderPdf(name: string, period: { label: string }, rows: any[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const draw = (text: string, size = 10, isBold = false) => {
    if (y < 40) { page = pdf.addPage([595, 842]); y = 800; }
    page.drawText(text.slice(0, 130), { x: 40, y, size, font: isBold ? bold : font, color: rgb(0.1, 0.1, 0.1) });
    y -= size + 4;
  };
  draw(name, 16, true);
  draw(`Period: ${period.label}`, 10);
  draw('', 6);
  if (rows.length > 0) {
    const keys = Object.keys(rows[0]);
    draw(keys.join(' | '), 9, true);
    for (const r of rows) draw(keys.map(k => String(r[k] ?? '')).join(' | '), 9);
  } else {
    draw('No data for this period.');
  }
  return await pdf.save();
}
