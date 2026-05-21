import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Eye, History, Sparkles } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, getWeek } from 'date-fns';
import { LeaderboardBanner } from '@/components/notifications/LeaderboardBanner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface SnapshotRow {
  id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  period_label: string;
  user_id: string;
  rank: number;
  total_points: number;
  full_name: string | null;
  profile_picture_url: string | null;
  captured_at: string;
}

interface GroupedSnapshot {
  key: string;
  period_type: string;
  period_start: string;
  period_end: string;
  period_label: string;
  captured_at: string;
  performers: SnapshotRow[];
}

type TypeFilter = 'all' | 'weekly' | 'monthly';
type PeriodFilter = 'all' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';

const rankColor = (rank: number) => (rank === 1 ? '#F5C518' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : '#9CA3AF');

export function BannerHistorySection() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [preview, setPreview] = useState<GroupedSnapshot | null>(null);

  // Ad-hoc preview state
  const today = new Date();
  const [adhocOpen, setAdhocOpen] = useState(false);
  const [adhocType, setAdhocType] = useState<'weekly' | 'monthly'>('weekly');
  const [adhocFrom, setAdhocFrom] = useState(format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [adhocTo, setAdhocTo] = useState(format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [adhocLoading, setAdhocLoading] = useState(false);
  const [adhocResult, setAdhocResult] = useState<null | { top3: any[]; label: string; type: 'weekly' | 'monthly' }>(null);

  const handleAdhocTypeChange = (t: 'weekly' | 'monthly') => {
    setAdhocType(t);
    setAdhocResult(null);
    if (t === 'weekly') {
      setAdhocFrom(format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      setAdhocTo(format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
    } else {
      setAdhocFrom(format(startOfMonth(today), 'yyyy-MM-dd'));
      setAdhocTo(format(endOfMonth(today), 'yyyy-MM-dd'));
    }
  };

  const generateAdhocPreview = async () => {
    if (!adhocFrom || !adhocTo) {
      toast.error('Please select both dates');
      return;
    }
    setAdhocLoading(true);
    setAdhocResult(null);
    try {
      const fromIso = new Date(adhocFrom + 'T00:00:00').toISOString();
      const toIso = new Date(adhocTo + 'T23:59:59').toISOString();
      const { data, error } = await supabase
        .from('gamification_points')
        .select('user_id, points')
        .gte('earned_at', fromIso)
        .lte('earned_at', toIso)
        .limit(10000);
      if (error) throw error;
      const agg = new Map<string, { user_id: string; total: number }>();
      for (const r of (data as any[]) ?? []) {
        const cur = agg.get(r.user_id) ?? { user_id: r.user_id, total: 0 };
        cur.total += Number(r.points) || 0;
        agg.set(r.user_id, cur);
      }
      const topAgg = Array.from(agg.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 3);
      let profilesMap = new Map<string, { full_name: string; profile_picture_url: string }>();
      if (topAgg.length > 0) {
        const { data: profs, error: pErr } = await supabase
          .from('profiles')
          .select('id, full_name, profile_picture_url')
          .in('id', topAgg.map((r) => r.user_id));
        if (pErr) throw pErr;
        profilesMap = new Map(
          (profs ?? []).map((p: any) => [
            p.id,
            { full_name: p.full_name ?? 'Unknown', profile_picture_url: p.profile_picture_url ?? '' },
          ]),
        );
      }
      const top3 = topAgg.map((r, i) => ({
        rank: i + 1,
        full_name: profilesMap.get(r.user_id)?.full_name ?? 'Unknown',
        profile_picture_url: profilesMap.get(r.user_id)?.profile_picture_url ?? '',
        total_points: r.total,
      }));
      const from = new Date(adhocFrom);
      const to = new Date(adhocTo);
      const label =
        adhocType === 'weekly'
          ? `Week ${getWeek(from, { weekStartsOn: 1 })} · ${format(from, 'MMM d')}–${format(to, 'MMM d, yyyy')}`
          : format(from, 'MMMM yyyy');
      setAdhocResult({ top3, label, type: adhocType });
    } catch (e: any) {
      toast.error(e.message || 'Failed to load preview');
    } finally {
      setAdhocLoading(false);
    }
  };

  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ['leaderboard-snapshots-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leaderboard_snapshots')
        .select('*')
        .order('captured_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as SnapshotRow[];
    },
  });

  const grouped = useMemo<GroupedSnapshot[]>(() => {
    const map = new Map<string, GroupedSnapshot>();
    for (const row of snapshots) {
      const key = `${row.period_type}|${row.period_start}|${row.period_end}|${row.period_label}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          period_type: row.period_type,
          period_start: row.period_start,
          period_end: row.period_end,
          period_label: row.period_label,
          captured_at: row.captured_at,
          performers: [],
        });
      }
      map.get(key)!.performers.push(row);
    }
    return Array.from(map.values())
      .map(g => ({ ...g, performers: g.performers.sort((a, b) => a.rank - b.rank) }))
      .sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());
  }, [snapshots]);

  const { data: notifCounts = {} } = useQuery({
    queryKey: ['leaderboard-banner-notif-counts', grouped.map(g => g.key).join(',')],
    enabled: grouped.length > 0,
    queryFn: async () => {
      const minStart = grouped.reduce((m, g) => (g.period_start < m ? g.period_start : m), grouped[0].period_start);
      const { data, error } = await supabase
        .from('notifications')
        .select('user_id, created_at')
        .eq('type', 'leaderboard_banner')
        .gte('created_at', minStart)
        .limit(10000);
      if (error) throw error;
      const result: Record<string, number> = {};
      for (const g of grouped) {
        const users = new Set<string>();
        for (const n of data ?? []) {
          if (n.created_at >= g.period_start && n.created_at <= g.period_end) {
            users.add((n as any).user_id);
          }
        }
        result[g.key] = users.size;
      }
      return result;
    },
  });

  const filtered = useMemo(() => {
    return grouped.filter(g => {
      if (typeFilter !== 'all' && g.period_type.toLowerCase() !== typeFilter) return false;
      if (periodFilter === 'all') return true;
      const start = new Date(g.period_start);
      const end = new Date(g.period_end);
      const now = new Date();
      let rangeStart: Date, rangeEnd: Date;
      switch (periodFilter) {
        case 'this_week': rangeStart = startOfWeek(now); rangeEnd = endOfWeek(now); break;
        case 'last_week': rangeStart = startOfWeek(subWeeks(now, 1)); rangeEnd = endOfWeek(subWeeks(now, 1)); break;
        case 'this_month': rangeStart = startOfMonth(now); rangeEnd = endOfMonth(now); break;
        case 'last_month': rangeStart = startOfMonth(subMonths(now, 1)); rangeEnd = endOfMonth(subMonths(now, 1)); break;
        case 'custom':
          if (!customFrom || !customTo) return true;
          rangeStart = new Date(customFrom); rangeEnd = new Date(customTo); break;
        default: return true;
      }
      return end >= rangeStart && start <= rangeEnd;
    });
  }, [grouped, typeFilter, periodFilter, customFrom, customTo]);

  const typeBtn = (val: TypeFilter, label: string) => (
    <button
      key={val}
      onClick={() => setTypeFilter(val)}
      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
        typeFilter === val ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );

  const periodChip = (val: PeriodFilter, label: string) => (
    <button
      key={val}
      onClick={() => setPeriodFilter(val)}
      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
        periodFilter === val
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background border-border text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-lg">
              <History size={18} /> Banner history ({filtered.length})
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setAdhocOpen(true)} className="gap-1">
              <Sparkles size={14} /> Ad hoc preview
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3 border-b pb-3">
            <div className="inline-flex items-center gap-1 p-1 border rounded-lg bg-muted/30">
              {typeBtn('all', 'All')}
              {typeBtn('weekly', 'Weekly')}
              {typeBtn('monthly', 'Monthly')}
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="flex flex-wrap items-center gap-2">
              {periodChip('this_week', 'This week')}
              {periodChip('last_week', 'Last week')}
              {periodChip('this_month', 'This month')}
              {periodChip('last_month', 'Last month')}
              {periodChip('custom', 'Custom range')}
              {periodFilter === 'custom' && (
                <>
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-8 w-40"
                  />
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-8 w-40"
                  />
                </>
              )}
            </div>
          </div>

          {/* List */}
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <History className="mx-auto h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">No banner snapshots found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((g) => {
                const isWeekly = g.period_type.toLowerCase() === 'weekly';
                const sentCount = notifCounts[g.key] ?? 0;
                return (
                  <div
                    key={g.key}
                    className="flex flex-wrap items-center gap-3 p-3 border rounded-lg hover:bg-muted/30"
                  >
                    <div className="min-w-[140px]">
                      <div className="font-semibold text-sm">{g.period_label}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(g.period_start), 'MMM d')} – {format(new Date(g.period_end), 'MMM d, yyyy')}
                      </div>
                    </div>
                    <Badge
                      className={
                        isWeekly
                          ? 'bg-purple-100 text-purple-700 hover:bg-purple-100 border-0'
                          : 'bg-green-100 text-green-700 hover:bg-green-100 border-0'
                      }
                    >
                      {isWeekly ? 'Weekly' : 'Monthly'}
                    </Badge>
                    <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-[200px]">
                      {g.performers.slice(0, 10).map((p) => (
                        <div
                          key={`${p.user_id}-${p.rank}`}
                          className="inline-flex items-center gap-1.5 px-2 py-1 bg-muted rounded-full text-xs"
                        >
                          <span
                            style={{ background: rankColor(p.rank) }}
                            className="w-2 h-2 rounded-full inline-block"
                          />
                          <span className="font-medium">{p.full_name ?? 'Unknown'}</span>
                          <span className="text-muted-foreground">{Number(p.total_points).toLocaleString()} pts</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      Sent to {sentCount} user{sentCount === 1 ? '' : 's'}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setPreview(g)} className="gap-1">
                      <Eye size={14} /> View
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {preview && (
        <div
          style={{
            background: 'rgba(0,0,0,0.6)',
            minHeight: 600,
            padding: 24,
            marginTop: 16,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: '100%', maxWidth: 460 }}>
            <LeaderboardBanner
              isPreview
              onClosePreview={() => setPreview(null)}
              previewData={{
                period_label: preview.period_label,
                period_type: preview.period_type.toLowerCase() === 'weekly' ? 'weekly' : 'monthly',
                top3: preview.performers.slice(0, 3).map((p) => ({
                  rank: p.rank,
                  full_name: p.full_name ?? 'Unknown',
                  profile_picture_url: p.profile_picture_url ?? '',
                  total_points: Number(p.total_points),
                })),
              }}
            />
          </div>
        </div>
      )}

      <Dialog open={adhocOpen} onOpenChange={(o) => { setAdhocOpen(o); if (!o) setAdhocResult(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles size={16} /> Ad hoc banner preview
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Type</label>
              <div className="inline-flex items-center gap-1 p-1 border rounded-lg bg-muted/30">
                {(['weekly', 'monthly'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => handleAdhocTypeChange(t)}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors capitalize ${
                      adhocType === t ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">From</label>
                <Input type="date" value={adhocFrom} onChange={(e) => { setAdhocFrom(e.target.value); setAdhocResult(null); }} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">To</label>
                <Input type="date" value={adhocTo} onChange={(e) => { setAdhocTo(e.target.value); setAdhocResult(null); }} />
              </div>
            </div>

            <Button onClick={generateAdhocPreview} disabled={adhocLoading} className="w-full">
              {adhocLoading ? 'Generating…' : 'Generate preview'}
            </Button>

            {adhocResult && (
              adhocResult.top3.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
                  No points data found for this date range.
                </div>
              ) : (
                <div
                  style={{
                    background: 'rgba(0,0,0,0.6)',
                    padding: 16,
                    borderRadius: 12,
                    display: 'flex',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ width: '100%', maxWidth: 420 }}>
                    <LeaderboardBanner
                      isPreview
                      onClosePreview={() => setAdhocResult(null)}
                      previewData={{
                        period_label: adhocResult.label,
                        period_type: adhocResult.type,
                        top3: adhocResult.top3,
                      }}
                    />
                  </div>
                </div>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
