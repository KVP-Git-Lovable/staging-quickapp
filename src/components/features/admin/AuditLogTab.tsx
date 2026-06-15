import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface AuditRow {
  id: string;
  feature_flag_id: string;
  changed_by: string | null;
  old_value: boolean | null;
  new_value: boolean | null;
  changed_at: string;
  company_id: string | null;
  action: string | null;
}

interface Feature { id: string; feature_key: string; feature_name: string }
interface Company { id: string; name: string }

export const AuditLogTab: React.FC = () => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [features, setFeatures] = useState<Map<string, Feature>>(new Map());
  const [companies, setCompanies] = useState<Map<string, Company>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: a }, { data: f }, { data: c }] = await Promise.all([
        supabase.from('feature_flag_audit').select('*').order('changed_at', { ascending: false }).limit(200),
        supabase.from('feature_flags').select('id,feature_key,feature_name'),
        supabase.from('companies').select('id,name'),
      ]);
      setRows((a ?? []) as AuditRow[]);
      setFeatures(new Map(((f ?? []) as Feature[]).map(x => [x.id, x])));
      setCompanies(new Map(((c ?? []) as Company[]).map(x => [x.id, x])));
      setLoading(false);
    })();
  }, []);

  if (loading) return <Skeleton className="h-64 w-full" />;

  const fmt = (v: boolean | null) =>
    v === null ? <Badge variant="outline" className="text-[10px]">inherit</Badge>
      : v ? <Badge className="text-[10px] bg-emerald-100 text-emerald-800">ON</Badge>
        : <Badge variant="secondary" className="text-[10px]">OFF</Badge>;

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>When</TableHead>
            <TableHead>Feature</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No audit entries yet</TableCell></TableRow>
          )}
          {rows.map(r => (
            <TableRow key={r.id}>
              <TableCell className="text-xs">{new Date(r.changed_at).toLocaleString()}</TableCell>
              <TableCell className="text-sm">{features.get(r.feature_flag_id)?.feature_name ?? r.feature_flag_id.slice(0, 8)}</TableCell>
              <TableCell className="text-sm">{r.company_id ? (companies.get(r.company_id)?.name ?? '—') : <span className="text-muted-foreground">global</span>}</TableCell>
              <TableCell className="text-xs">{r.action ?? 'global_toggle'}</TableCell>
              <TableCell className="text-xs flex items-center gap-1">
                {fmt(r.old_value)} <span>→</span> {fmt(r.new_value)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
