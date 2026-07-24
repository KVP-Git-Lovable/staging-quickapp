// Generates a report file (Excel/PDF/summary_only), uploads to Storage,
// and creates in-app notifications for recipients. Push delivery is handled
// exclusively by the notifications_push_dispatch DB trigger.
//
// Delivery model:
// - Every run generates and delivers, regardless of row count. Empty datasets
//   still produce a file (headers only) or a "No records for this period"
//   digest, still create a notification, still write a delivery log row.
// - The delivery log is APPEND-ONLY. Each run inserts a new row tagged with
//   trigger_type = 'scheduled' | 'manual'.
// - Scheduled idempotency is enforced upstream by report-dispatcher against
//   report_subscriptions.last_scheduled_period_key. Manual runs never touch
//   that field, and never suppress a scheduled slot.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import ExcelJS from 'npm:exceljs@4.4.0';
import { buildReportModel, renderReportPdf, PdfTemplate } from './pdf-renderer.ts';
import { resolveBranding } from './branding.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface GenerateRequest {
  subscription_id?: string;
  period?: { key: string; label: string; date_from: string; date_to: string };
  mode: 'manual' | 'scheduled' | 'preview';
  // Preview-only payload: renders a PDF from an in-progress wizard config
  // without writing to report_subscriptions or report_delivery_log.
  preview?: {
    name: string;
    dataset_key: string;
    layout: string;
    config: any;
    pdf_template: PdfTemplate;
    period: { key: string; label: string; date_from: string; date_to: string };
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${SERVICE_ROLE}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const body = (await req.json()) as GenerateRequest;

  // -------- Preview mode: on-demand PDF, no persistence --------
  if (body.mode === 'preview') {
    if (!body.preview) {
      return new Response(JSON.stringify({ error: 'preview payload required' }), { status: 400, headers: corsHeaders });
    }
    const pv = body.preview;
    const { data: dataset } = await admin
      .from('reportable_datasets').select('source').eq('key', pv.dataset_key).maybeSingle();
    if (!dataset) {
      return new Response(JSON.stringify({ error: 'Dataset not found' }), { status: 404, headers: corsHeaders });
    }
    const rows = await callRpc(admin, dataset.source, { layout: pv.layout, config: pv.config }, {
      date_from: pv.period.date_from, date_to: pv.period.date_to,
    });
    const distributorId = pv.config?.filters?.distributor_id ?? null;
    const brand = await resolveBranding(admin, {
      mode: (pv.pdf_template?.branding ?? 'company') as any,
      distributor_id: distributorId,
    });
    const model = buildReportModel({
      reportName: pv.name || 'Report',
      period: pv.period,
      rows,
      scopeLabel: 'Preview',
      filtersLabel: filtersLabelFrom(pv.config?.filters),
    });
    const pdfBytes = await renderReportPdf(model, pv.pdf_template ?? {}, brand);
    return new Response(pdfBytes, {
      headers: { ...corsHeaders, 'Content-Type': 'application/pdf' },
    });
  }

  const { subscription_id, period, mode } = body;
  if (!subscription_id || !period) {
    return new Response(JSON.stringify({ error: 'subscription_id and period required' }), { status: 400, headers: corsHeaders });
  }
  const triggerType: 'scheduled' | 'manual' = mode === 'manual' ? 'manual' : 'scheduled';

  const { data: sub, error: sErr } = await admin
    .from('report_subscriptions')
    .select('id, name, report_definition_id, recipient_user_ids, recipient_mode, attachment_format, push_to_phone, scope, cadence, pdf_template')
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

  const recipientMode: string = sub.recipient_mode ?? 'named_users';
  let recipients: string[] = [];
  let scope: string = sub.scope ?? 'shared';
  if (recipientMode === 'all_managers') {
    const { data: mgrs, error: mErr } = await admin.rpc('report_all_managers');
    if (mErr) console.error('report_all_managers error', mErr);
    recipients = (mgrs ?? []).map((m: any) => m.user_id).filter(Boolean);
    scope = 'per_recipient';
  } else {
    recipients = sub.recipient_user_ids ?? [];
  }
  recipients = Array.from(new Set(recipients));

  const outcomes: Array<Record<string, unknown>> = [];

  // Shared: always call the RPC fresh and always render/upload — overwriting
  // the storage object for this period so late-arriving data replaces the
  // earlier (possibly empty) file.
  let sharedPath: string | null = null;
  let sharedDigest = '';
  let sharedRows: any[] = [];
  let sharedIsEmpty = false;
  if (scope === 'shared' && recipients.length > 0) {
    sharedRows = await callRpc(admin, dataset.source, def, {
      date_from: period.date_from,
      date_to: period.date_to,
    });
    sharedIsEmpty = sharedRows.length === 0;
    sharedDigest = buildDigest(sub.name, period, sharedRows);
    if (sub.attachment_format !== 'summary_only') {
      const bytes = await renderFile(sub.attachment_format, sub.name, period, sharedRows);
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
      let isEmpty = sharedIsEmpty;

      if (scope === 'per_recipient') {
        rows = await callRpc(admin, dataset.source, def, {
          date_from: period.date_from,
          date_to: period.date_to,
          scope_user_id: rid,
        });
        isEmpty = rows.length === 0;
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

      const bodyLine = isEmpty
        ? `${period.label} — No records for this period.`
        : `${period.label} — ${rows.length} row${rows.length === 1 ? '' : 's'}`;

      const metadata: Record<string, unknown> = {
        subscription_id: sub.id,
        definition_id: def.id,
        report_name: sub.name,
        period: period.label,
        period_key: period.key,
        attachment_format: sub.attachment_format,
        trigger_type: triggerType,
        row_count: rows.length,
        is_empty: isEmpty,
        push_to_phone: sub.push_to_phone === true,
      };
      if (path) metadata.storage_path = path;
      if (sub.attachment_format === 'summary_only') metadata.body_md = digest;

      const { data: notif, error: nErr } = await admin
        .from('notifications')
        .insert({
          user_id: rid,
          title: sub.name,
          message: sub.attachment_format === 'summary_only' ? digest.slice(0, 500) : bodyLine,
          type: 'report_delivery',
          related_table: 'report_subscriptions',
          related_id: sub.id,
          metadata,
        })
        .select('id')
        .single();

      const pushStatus: string | null = notif
        ? (sub.push_to_phone ? 'dispatched_by_trigger' : 'skipped_push_off')
        : null;

      // Append-only log row (no upsert). Every run is recorded.
      await admin.from('report_delivery_log').insert({
        subscription_id: sub.id,
        recipient_user_id: rid,
        period: period.key,
        notification_id: notif?.id ?? null,
        storage_path: path,
        in_app_status: nErr ? 'failed' : 'delivered',
        push_status: pushStatus,
        error: nErr ? nErr.message : null,
        trigger_type: triggerType,
      });

      outcomes.push({ recipient: rid, notification_id: notif?.id, push: pushStatus, delivered: !nErr, empty: isEmpty });
    } catch (e) {
      console.error('per-recipient error', rid, e);
      try {
        await admin.from('report_delivery_log').insert({
          subscription_id: sub.id,
          recipient_user_id: rid,
          period: period.key,
          notification_id: null,
          storage_path: null,
          in_app_status: 'failed',
          push_status: null,
          error: String(e).slice(0, 500),
          trigger_type: triggerType,
        });
      } catch (_) { /* swallow */ }
      outcomes.push({ recipient: rid, error: String(e), delivered: false });
    }
  }

  const deliveredCount = outcomes.filter((o: any) => o.delivered === true).length;
  const emptyRun = outcomes.length > 0 && outcomes.every((o: any) => o.empty === true);

  // last_fired_at reflects the most recent run of EITHER kind (display only).
  // last_scheduled_fire_at / last_scheduled_period_key are set only for
  // scheduled runs, so manual runs never consume a scheduled slot.
  const updates: Record<string, unknown> = {};
  if (deliveredCount > 0) updates.last_fired_at = new Date().toISOString();
  if (triggerType === 'scheduled' && deliveredCount > 0) {
    updates.last_scheduled_fire_at = new Date().toISOString();
    updates.last_scheduled_period_key = period.key;
  }
  if (Object.keys(updates).length > 0) {
    await admin.from('report_subscriptions').update(updates).eq('id', sub.id);
  }

  return new Response(JSON.stringify({
    ok: true,
    recipients: outcomes.length,
    delivered: deliveredCount,
    empty: emptyRun,
    trigger_type: triggerType,
    outcomes,
  }), {
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
  if (!rows || rows.length === 0) return `${name} — ${period.label}\n\nNo records for this period.`;
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
    ws.addRow(['No records for this period.']);
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
    draw('No records for this period.');
  }
  return await pdf.save();
}
