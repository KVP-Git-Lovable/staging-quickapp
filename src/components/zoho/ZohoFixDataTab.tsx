import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import type { ZohoReadinessRow } from '@/hooks/useZohoSync';

interface Props {
  rows: ZohoReadinessRow[];
  onSave: (
    id: string,
    patch: { state?: string; city?: string; pincode?: string; gst_number?: string | null },
  ) => Promise<void>;
}

type Draft = { state: string; city: string; pincode: string; gst_number: string };

export const ZohoFixDataTab: React.FC<Props> = ({ rows, onSave }) => {
  const blocked = useMemo(() => rows.filter((r) => r.is_ready === false), [rows]);
  const grouped = useMemo(() => {
    const map = new Map<string, ZohoReadinessRow[]>();
    blocked.forEach((r) => {
      const key = r.blocker ?? 'unknown';
      map.set(key, [...(map.get(key) ?? []), r]);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [blocked]);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const draftFor = (r: ZohoReadinessRow): Draft =>
    drafts[r.id] ?? {
      state: r.state ?? '',
      city: r.city ?? '',
      pincode: r.pincode ?? '',
      gst_number: r.gst_number ?? '',
    };

  const setDraft = (id: string, patch: Partial<Draft>, base: Draft) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...base, ...patch } }));

  const save = async (r: ZohoReadinessRow) => {
    const d = draftFor(r);
    setSavingId(r.id);
    try {
      await onSave(r.id, {
        state: d.state.trim(),
        city: d.city.trim(),
        pincode: d.pincode.trim(),
        gst_number: d.gst_number.trim() ? d.gst_number.trim() : null,
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[r.id];
        return next;
      });
      toast({ title: 'Saved', description: `${r.name ?? 'Retailer'} updated.` });
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSavingId(null);
    }
  };

  if (blocked.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Every retailer is ready to sync. Nothing to fix.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(([blocker, list]) => (
        <Card key={blocker}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{blocker}</CardTitle>
            <Badge variant="secondary">{list.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {list.map((r) => {
              const d = draftFor(r);
              return (
                <div key={r.id} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_1.2fr_auto] md:items-center">
                  <div className="text-sm font-medium">{r.name ?? '—'}</div>
                  <Input
                    placeholder="State"
                    value={d.state}
                    onChange={(e) => setDraft(r.id, { state: e.target.value }, d)}
                  />
                  <Input
                    placeholder="City"
                    value={d.city}
                    onChange={(e) => setDraft(r.id, { city: e.target.value }, d)}
                  />
                  <Input
                    placeholder="Pincode"
                    value={d.pincode}
                    onChange={(e) => setDraft(r.id, { pincode: e.target.value }, d)}
                  />
                  <Input
                    placeholder="GSTIN (15 chars)"
                    value={d.gst_number}
                    onChange={(e) => setDraft(r.id, { gst_number: e.target.value }, d)}
                  />
                  <Button size="sm" disabled={savingId === r.id} onClick={() => save(r)}>
                    {savingId === r.id ? 'Saving…' : 'Save'}
                  </Button>
                  {blocker === 'duplicate contact name' && (
                    <p className="col-span-full text-xs text-muted-foreground">
                      Another retailer shares this exact name — rename one of them in Retailer Management before syncing.
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
