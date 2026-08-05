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
  // Scheduled occurrence key (local date + fire_time). Stamped onto
  // report_subscriptions.last_scheduled_period_key for idempotency. Only
  // present for scheduled runs; manual/preview never carry this.
  occurrence_key?: string | null;
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
  const isServiceRole = auth === `Bearer ${SERVICE_ROLE}`;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const body = (await req.json()) as GenerateRequest;

  // Preview mode: allow any authenticated user; other modes require service role.
  if (!isServiceRole) {
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const { data: userData } = await admin.auth.getUser(token);
    if (!userData?.user || body.mode !== 'preview') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
  }

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
      rowDimensionKey: rowDimensionKeyFrom(pv.config),
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
    .select('id, name, report_definition_id, recipient_user_ids, recipient_mode, attachment_format, push_to_phone, scope, cadence, pdf_template, timezone')
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

  // Fetch branding once per run and reuse across recipients.
  const pdfTemplate: PdfTemplate = (sub as any).pdf_template ?? {};
  const distributorId = def.config?.filters?.distributor_id ?? null;
  const brand = sub.attachment_format === 'pdf'
    ? await resolveBranding(admin, {
        mode: (pdfTemplate.branding ?? 'company') as any,
        distributor_id: distributorId,
      })
    : null;
  const filtersLabel = filtersLabelFrom(def.config?.filters);

  // Look up recipient display names for the meta block on per-recipient PDFs.
  const recipientNames = new Map<string, string>();
  if (recipients.length > 0) {
    const { data: profs } = await admin
      .from('profiles').select('id, full_name').in('id', recipients);
    (profs ?? []).forEach((p: any) => recipientNames.set(p.id, p.full_name || ''));
  }

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
    }, sub.timezone || 'Asia/Kolkata');
    sharedIsEmpty = sharedRows.length === 0;
    sharedDigest = buildDigest(sub.name, period, sharedRows);
    if (sub.attachment_format !== 'summary_only') {
      const bytes = await renderFile(sub.attachment_format, sub.name, period, sharedRows, {
        pdfTemplate, brand, scopeLabel: 'Shared', filtersLabel,
        rowDimensionKey: rowDimensionKeyFrom(def.config),
      });
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
        }, sub.timezone || 'Asia/Kolkata');
        isEmpty = rows.length === 0;
        digest = buildDigest(sub.name, period, rows);
        if (sub.attachment_format !== 'summary_only') {
          const bytes = await renderFile(sub.attachment_format, sub.name, period, rows, {
            pdfTemplate, brand,
            scopeLabel: 'Per recipient',
            filtersLabel,
            recipientName: recipientNames.get(rid) || null,
            rowDimensionKey: rowDimensionKeyFrom(def.config),
          });
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
  // scheduled runs, and last_scheduled_period_key stores the OCCURRENCE key
  // (local date + fire_time) — never the reporting-period key. This ensures
  // changing fire_time produces a new key and permits another same-day run.
  const updates: Record<string, unknown> = {};
  if (deliveredCount > 0) updates.last_fired_at = new Date().toISOString();
  if (triggerType === 'scheduled' && deliveredCount > 0) {
    updates.last_scheduled_fire_at = new Date().toISOString();
    if (body.occurrence_key) {
      updates.last_scheduled_period_key = body.occurrence_key;
    }
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

/**
 * Pivot long RPC output into the wide grid a matrix report is meant to be.
 *
 * get_sales_report returns long rows even for layout='matrix' — one row per
 * rowKey x columnKey with the measure attached. The report builder pivots that
 * client-side (see MatrixTable in ReportSubscriptionsTab), but nothing on the
 * delivery path did, so a scheduled matrix report arrived as a flat three-column
 * list instead of the grid shown in the preview. Same semantics as MatrixTable:
 * first-seen ordering for both axes, measures summed per cell, and a trailing
 * total column keyed by the measure.
 */
function pivotMatrixRows(rows: any[], rowKey?: string, columnKey?: string, valueKey?: string): any[] {
  if (!rows.length || !rowKey || !columnKey || !valueKey) return rows;
  const keys = Object.keys(rows[0] ?? {});
  const isLong = keys.includes(rowKey) && keys.includes(columnKey) && keys.includes(valueKey);
  if (!isLong) return rows; // already wide — leave it alone

  const rowLabels: string[] = [];
  const colLabels: string[] = [];
  const cells: Record<string, Record<string, number>> = {};

  for (const r of rows) {
    const rv = String(r[rowKey] ?? '');
    const cv = String(r[columnKey] ?? '');
    const n = Number(r[valueKey]);
    if (!rowLabels.includes(rv)) rowLabels.push(rv);
    if (!colLabels.includes(cv)) colLabels.push(cv);
    cells[rv] = cells[rv] || {};
    cells[rv][cv] = (cells[rv][cv] || 0) + (Number.isFinite(n) ? n : 0);
  }

  return rowLabels.map((rv) => {
    const out: Record<string, any> = { [rowKey]: rv };
    let total = 0;
    for (const c of colLabels) {
      const v = cells[rv]?.[c] ?? 0;
      out[c] = v;
      total += v;
    }
    out[valueKey] = total;
    return out;
  });
}

/**
 * Keep only the columns the report was actually configured with, in the order
 * they were arranged.
 *
 * The RPCs return a fixed column list per layout regardless of what was picked:
 * the `grouped` branch of get_sales_report always selects quantity, rate,
 * revenue and new_retailers, and `tabular` always returns all 13 detail
 * columns. The builder's preview tables filter that down to the selection
 * (see SummaryTable / TabularTable in ReportSubscriptionsTab), but the delivery
 * path rendered Object.keys() of the raw row — so a report configured with
 * three measures arrived with an extra Rate column, and a 4-column tabular
 * report arrived with 13.
 */
function projectSelectedColumns(rows: any[], def: any): any[] {
  if (!rows.length) return rows;
  // Matrix columns are generated by the pivot from the data itself, so there is
  // no fixed selection to project onto.
  if (def?.layout === 'matrix') return rows;

  const config = def?.config ?? {};
  const keys = Object.keys(rows[0] ?? {});
  const asKeys = (list: any) =>
    (Array.isArray(list) ? list : [])
      .map((v: any) => (typeof v === 'string' ? v : v?.key))
      .filter(Boolean);

  // Whatever the Build step put in rows + values, in that order. No per-layout
  // column lists — if it was selected and the data has it, it ships.
  const wanted = [...asKeys(config.rows), ...asKeys(config.values)];
  if (!wanted.length) return rows;

  const selected: string[] = [];
  for (const k of wanted) {
    if (keys.includes(k)) {
      if (!selected.includes(k)) selected.push(k);
    } else if (keys.includes('grp') && !selected.includes('grp')) {
      // Grouped output returns its row dimension under the generic name `grp`.
      selected.push('grp');
    }
  }
  if (!selected.length) return rows;

  return rows.map((r) => {
    const out: Record<string, any> = {};
    for (const k of selected) out[k] = r[k];
    return out;
  });
}

/** Columns holding a clock time rather than a moment — check_in_time, check_out_time. */
const TIME_COLUMN = /(^|_)time$/i;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Render *_time columns as a bare HH:mm in the subscription's timezone.
 *
 * The RPCs return full timestamptz values ("2026-08-04T08:54:05.23+00:00"), and
 * both renderers printed them verbatim, so the attendance register showed an ISO
 * string where a check-in time belongs. Note the stored value is UTC: dropping
 * the date alone would print 08:54 for someone who clocked in at 14:24 IST, so
 * the conversion has to happen at the same time.
 */
function formatTimeCells(rows: any[], timezone: string): any[] {
  if (!rows.length) return rows;
  const timeKeys = Object.keys(rows[0] ?? {}).filter((k) => TIME_COLUMN.test(k));
  if (!timeKeys.length) return rows;

  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
    });
  } catch {
    // Unknown tz string — fall back to UTC rather than dropping the column.
    fmt = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
    });
  }

  return rows.map((r) => {
    const out = { ...r };
    for (const k of timeKeys) {
      const v = out[k];
      if (typeof v === 'string' && ISO_DATETIME.test(v)) {
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) out[k] = fmt.format(d);
      }
    }
    return out;
  });
}

async function callRpc(
  admin: any,
  source: string,
  def: any,
  filters: Record<string, unknown>,
  timezone = 'Asia/Kolkata',
): Promise<any[]> {
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
  let out = (data ?? []) as any[];
  // Applied here rather than in the PDF renderer so the Excel file and the
  // summary digest get the same shape as the PDF.
  if (def.layout === 'matrix') out = pivotMatrixRows(out, rows, cols, values[0]);
  out = projectSelectedColumns(out, def);
  return formatTimeCells(out, timezone);
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

async function renderFile(
  format: string,
  name: string,
  period: { key: string; label: string; date_from: string; date_to: string },
  rows: any[],
  opts: {
    pdfTemplate: PdfTemplate;
    brand: any | null;
    scopeLabel?: string | null;
    filtersLabel?: string | null;
    recipientName?: string | null;
    rowDimensionKey?: string | null;
  },
): Promise<Uint8Array> {
  if (format === 'pdf') {
    const model = buildReportModel({
      reportName: name,
      period,
      rows,
      recipientName: opts.recipientName ?? null,
      scopeLabel: opts.scopeLabel ?? null,
      filtersLabel: opts.filtersLabel ?? null,
      rowDimensionKey: opts.rowDimensionKey ?? null,
    });
    return renderReportPdf(model, opts.pdfTemplate ?? {}, opts.brand);
  }
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

function filtersLabelFrom(filters: any): string | null {
  if (!filters || typeof filters !== 'object') return null;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(filters)) {
    if (v === null || v === undefined || v === '' || k === 'scope_user_id' || k === 'date_from' || k === 'date_to') continue;
    const label = k.replace(/_id$/, '').replace(/_/g, ' ');
    const val = typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}\u2026` : String(v);
    parts.push(`${label}: ${val}`);
  }
  return parts.length ? parts.join(', ') : null;
}

// Extract the primary row-dimension key from a report definition config so
// the PDF row-label column can be titled "Team member" / "Beat" / "Date"
// instead of the raw grouping key ("grp", "user_id"…).
function rowDimensionKeyFrom(config: any): string | null {
  if (!config) return null;
  const r = Array.isArray(config.rows) ? config.rows[0] : config.rows;
  if (!r) return null;
  if (typeof r === 'string') return r;
  if (typeof r === 'object') return r.key ?? r.field ?? r.name ?? null;
  return null;
}
