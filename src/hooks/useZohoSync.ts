import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ZohoReadinessRow {
  id: string;
  name: string | null;
  state: string | null;
  city: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  gst_number: string | null;
  currency: string | null;
  currency_code: string | null;
  gst_treatment: string | null;
  blocker: string | null;
  is_ready: boolean | null;
  zoho_contact_id: string | null;
  zoho_sync_status: string | null;
}

export interface ZohoLogRow {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  retailer_id: string | null;
  http_status: number | null;
  error_message: string | null;
  request_payload: unknown;
  response_payload: unknown;
}

export interface ZohoSummary {
  total: number;
  ready: number;
  skipped: number;
  synced: number;
  failed: number;
  blockers: Record<string, number>;
}

const emptySummary: ZohoSummary = { total: 0, ready: 0, skipped: 0, synced: 0, failed: 0, blockers: {} };

function summarise(rows: ZohoReadinessRow[]): ZohoSummary {
  const s: ZohoSummary = { ...emptySummary, blockers: {} };
  s.total = rows.length;
  for (const r of rows) {
    if (r.is_ready) s.ready += 1;
    else s.blockers[r.blocker ?? 'unknown'] = (s.blockers[r.blocker ?? 'unknown'] ?? 0) + 1;
    if (r.zoho_sync_status === 'synced') s.synced += 1;
    if (r.zoho_sync_status === 'failed') s.failed += 1;
    if (r.zoho_sync_status === 'skipped') s.skipped += 1;
  }
  return s;
}

export function useZohoSync() {
  const [rows, setRows] = useState<ZohoReadinessRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [syncedAt, setSyncedAt] = useState<Record<string, string | null>>({});
  const [logs, setLogs] = useState<ZohoLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [readinessRes, retailerRes, logRes] = await Promise.all([
      supabase.from('zoho_sync_readiness').select('*').order('name', { ascending: true }),
      supabase.from('retailers').select('id, zoho_sync_error, zoho_synced_at'),
      supabase
        .from('zoho_sync_log')
        .select('id, created_at, action, entity_type, retailer_id, http_status, error_message, request_payload, response_payload')
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    setRows((readinessRes.data as ZohoReadinessRow[] | null) ?? []);
    const errMap: Record<string, string | null> = {};
    const atMap: Record<string, string | null> = {};
    ((retailerRes.data as any[] | null) ?? []).forEach((r) => {
      errMap[r.id] = r.zoho_sync_error ?? null;
      atMap[r.id] = r.zoho_synced_at ?? null;
    });
    setErrors(errMap);
    setSyncedAt(atMap);
    setLogs((logRes.data as ZohoLogRow[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const invoke = useCallback(
    async (body: Record<string, unknown>) => {
      setRunning(true);
      try {
        const { data, error } = await supabase.functions.invoke('zoho-sync-customers', { body });
        if (error) {
          const details = (error as any)?.context?.text ? await (error as any).context.text() : error.message;
          throw new Error(details || error.message);
        }
        return data as any;
      } finally {
        setRunning(false);
      }
    },
    [],
  );

  const dryRun = useCallback((retailerIds?: string[]) =>
    invoke(retailerIds?.length ? { mode: 'sync', dry_run: true, retailer_ids: retailerIds } : { mode: 'sync_all', dry_run: true }),
  [invoke]);

  const syncNow = useCallback(
    async (retailerIds?: string[]) => {
      const result = await invoke(
        retailerIds?.length ? { mode: 'sync', retailer_ids: retailerIds } : { mode: 'sync_all' },
      );
      await load();
      return result;
    },
    [invoke, load],
  );

  const updateRetailer = useCallback(
    async (id: string, patch: { state?: string; city?: string; pincode?: string; gst_number?: string | null }) => {
      const { error } = await supabase.from('retailers').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
      await load();
    },
    [load],
  );

  return {
    rows,
    logs,
    errors,
    syncedAt,
    loading,
    running,
    summary: summarise(rows),
    reload: load,
    dryRun,
    syncNow,
    updateRetailer,
  };
}
