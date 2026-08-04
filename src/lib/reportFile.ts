import { supabase } from '@/integrations/supabase/client';

/**
 * Shared plumbing for report-delivery attachments, used by both the report
 * dialog and the notification history list so the signing/fetch/filename rules
 * only exist once.
 */

/** Minimal shape both the live notification list and the history list satisfy. */
export interface ReportNotificationLike {
  id: string;
  title?: string | null;
  metadata?: unknown;
}

export interface ReportMeta {
  subscriptionId?: string;
  storagePath?: string;
  format: string;
  period: string;
  bodyMd: string;
  /** True when there is an actual file to fetch (summary_only deliveries have none). */
  hasFile: boolean;
  isPdf: boolean;
  isSheet: boolean;
}

export function getReportMeta(n: ReportNotificationLike | null | undefined): ReportMeta {
  const meta = ((n?.metadata ?? {}) as Record<string, any>) || {};
  const storagePath: string | undefined = meta.storage_path;
  const format: string = meta.attachment_format ?? 'summary_only';
  return {
    subscriptionId: meta.subscription_id,
    storagePath,
    format,
    period: meta.period ?? '',
    bodyMd: meta.body_md ?? '',
    hasFile: Boolean(meta.subscription_id && storagePath),
    isPdf: /\.pdf$/i.test(storagePath ?? '') || format === 'pdf',
    isSheet: /\.(xlsx|xls|csv)$/i.test(storagePath ?? '') || format === 'excel',
  };
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';

export function deriveReportFilename(
  title: string | null | undefined,
  period: string,
  storagePath: string | undefined,
  signedUrl: string
) {
  const ext = (storagePath?.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1]
    || signedUrl.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1]
    || 'xlsx').toLowerCase();
  const base = slugify(title || 'report');
  const periodPart = period ? `-${slugify(period)}` : '';
  return `${base}${periodPart}.${ext}`;
}

/**
 * Sign and fetch in one step. The signed URL is only valid for 300s, so the bytes
 * are always pulled immediately rather than handing the URL to the browser.
 */
export async function fetchReportBlob(
  subscriptionId: string,
  storagePath: string
): Promise<{ blob: Blob; url: string }> {
  const { data, error } = await supabase.functions.invoke('sign-report-file', {
    body: { subscription_id: subscriptionId, storage_path: storagePath },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('No URL returned');

  const res = await fetch(data.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { blob: await res.blob(), url: data.url };
}

/** Fetch the attachment and hand it to the browser as a download. */
export async function downloadReportFile(n: ReportNotificationLike): Promise<void> {
  const { subscriptionId, storagePath, period } = getReportMeta(n);
  if (!subscriptionId || !storagePath) throw new Error('No file attached to this report');

  const { blob, url } = await fetchReportBlob(subscriptionId, storagePath);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = deriveReportFilename(n.title, period, storagePath, url);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
