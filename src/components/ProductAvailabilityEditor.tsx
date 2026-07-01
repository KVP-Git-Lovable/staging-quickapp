import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaginated } from '@/utils/fetchAllPaginated';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';

type ScopeType = 'region' | 'zone' | 'state' | 'territory' | 'distributor' | 'user';
type Mode = 'include' | 'exclude';

interface Rule {
  id: string;
  product_id: string;
  scope_type: ScopeType;
  scope_value: string;
  mode: Mode;
}

interface Props {
  productId: string;
}

const SCOPE_LABEL: Record<ScopeType, string> = {
  region: 'Region',
  zone: 'Zone',
  state: 'State',
  territory: 'Territory',
  distributor: 'Distributor',
  user: 'User',
};

export function ProductAvailabilityEditor({ productId }: Props) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { can } = usePermissions();
  const canManage = can('product_availability_settings', 'edit');

  // option sources
  const [regions, setRegions] = useState<string[]>([]);
  const [zones, setZones] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [territories, setTerritories] = useState<Array<{ id: string; name: string }>>([]);
  const [distributors, setDistributors] = useState<Array<{ id: string; name: string }>>([]);
  const [users, setUsers] = useState<Array<{ user_id: string; full_name: string }>>([]);

  // draft new rule
  const [draftMode, setDraftMode] = useState<Mode>('include');
  const [draftScopeType, setDraftScopeType] = useState<ScopeType>('region');
  const [draftScopeValue, setDraftScopeValue] = useState<string>('');

  // Load rules + option sources
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: rulesData }, terrs, dists, profs, retailerStates] = await Promise.all([
          supabase
            .from('product_availability')
            .select('id, product_id, scope_type, scope_value, mode')
            .eq('product_id', productId),
          fetchAllPaginated<{ id: string; name: string; region: string | null; zone: string | null }>(
            (from, to) =>
              supabase
                .from('territories')
                .select('id, name, region, zone')
                .order('name', { ascending: true })
                .range(from, to)
          ).catch((err) => {
            console.warn('[Availability] failed to load territories:', err);
            return [];
          }),
          fetchAllPaginated<{ id: string; name: string; state: string | null }>(
            (from, to) =>
              supabase
                .from('distributors')
                .select('id, name, state')
                .order('name', { ascending: true })
                .range(from, to)
          ).catch((err) => {
            console.warn('[Availability] failed to load distributors:', err);
            return [];
          }),
          fetchAllPaginated<{ id: string; full_name: string | null }>(
            (from, to) =>
              supabase
                .from('profiles')
                .select('id, full_name')
                .order('full_name', { ascending: true })
                .range(from, to)
          ).catch((err) => {
            console.warn('[Availability] failed to load profiles:', err);
            return [];
          }),
          fetchAllPaginated<{ state: string | null }>((from, to) =>
            supabase.from('retailers').select('state').not('state', 'is', null).range(from, to)
          ).catch((err) => {
            console.warn('[Availability] failed to load retailer states:', err);
            return [];
          }),
        ]);
        if (cancelled) return;

        setRules((rulesData ?? []) as Rule[]);
        setTerritories((terrs ?? []).map((t) => ({ id: t.id, name: t.name })));
        setDistributors((dists ?? []).map((d) => ({ id: d.id, name: d.name })));
        setUsers(
          (profs ?? [])
            .filter((p) => p.id && p.full_name)
            .map((p) => ({ user_id: p.id, full_name: p.full_name as string }))
        );

        const regionSet = new Set<string>();
        const zoneSet = new Set<string>();
        for (const t of terrs ?? []) {
          if (t.region) regionSet.add(t.region);
          if (t.zone) zoneSet.add(t.zone);
        }
        setRegions([...regionSet].sort());
        setZones([...zoneSet].sort());

        const stateSet = new Set<string>();
        for (const d of dists ?? []) {
          if (d.state) stateSet.add(d.state);
        }
        for (const r of retailerStates ?? []) {
          if (r.state) stateSet.add(r.state);
        }
        setStates([...stateSet].sort());
      } catch (err) {
        console.error('[Availability] load failed:', err);
        toast.error('Failed to load availability rules');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // reset draft value when scope type changes
  useEffect(() => {
    setDraftScopeValue('');
  }, [draftScopeType]);

  const territoryById = useMemo(() => new Map(territories.map((t) => [t.id, t.name])), [territories]);
  const distributorById = useMemo(() => new Map(distributors.map((d) => [d.id, d.name])), [distributors]);
  const userById = useMemo(() => new Map(users.map((u) => [u.user_id, u.full_name])), [users]);

  const labelForRule = (r: Rule): string => {
    switch (r.scope_type) {
      case 'territory':
        return territoryById.get(r.scope_value) ?? r.scope_value;
      case 'distributor':
        return distributorById.get(r.scope_value) ?? r.scope_value;
      case 'user':
        return userById.get(r.scope_value) ?? r.scope_value;
      default:
        return r.scope_value;
    }
  };

  const summary = useMemo(() => {
    if (rules.length === 0) return 'Visible everywhere';
    const inc = rules.filter((r) => r.mode === 'include').map(labelForRule);
    const exc = rules.filter((r) => r.mode === 'exclude').map(labelForRule);
    const parts: string[] = [];
    if (inc.length) parts.push(`Include: ${inc.join(', ')}`);
    if (exc.length) parts.push(`Exclude: ${exc.join(', ')}`);
    return parts.join(' • ');
  }, [rules, territoryById, distributorById, userById]);

  const renderScopeValuePicker = () => {
    switch (draftScopeType) {
      case 'region':
      case 'zone':
      case 'state': {
        const opts = draftScopeType === 'region' ? regions : draftScopeType === 'zone' ? zones : states;
        return (
          <Select value={draftScopeValue} onValueChange={setDraftScopeValue}>
            <SelectTrigger><SelectValue placeholder={`Select ${SCOPE_LABEL[draftScopeType]}`} /></SelectTrigger>
            <SelectContent>
              {opts.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">No options</div>
              ) : opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      }
      case 'territory':
        return (
          <Select value={draftScopeValue} onValueChange={setDraftScopeValue}>
            <SelectTrigger><SelectValue placeholder="Select Territory" /></SelectTrigger>
            <SelectContent>
              {territories.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case 'distributor':
        return (
          <Select value={draftScopeValue} onValueChange={setDraftScopeValue}>
            <SelectTrigger><SelectValue placeholder="Select Distributor" /></SelectTrigger>
            <SelectContent>
              {distributors.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case 'user':
        return (
          <Select value={draftScopeValue} onValueChange={setDraftScopeValue}>
            <SelectTrigger><SelectValue placeholder="Select User" /></SelectTrigger>
            <SelectContent>
              {users.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        );
    }
  };

  const handleAdd = async () => {
    if (!draftScopeValue) {
      toast.error('Pick a scope value');
      return;
    }
    // dedupe locally first
    const dupe = rules.find(
      (r) => r.scope_type === draftScopeType && r.scope_value === draftScopeValue && r.mode === draftMode
    );
    if (dupe) {
      toast.message('That rule already exists');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('product_availability')
        .insert({
          product_id: productId,
          scope_type: draftScopeType,
          scope_value: draftScopeValue,
          mode: draftMode,
        })
        .select('id, product_id, scope_type, scope_value, mode')
        .single();
      if (error) {
        // 23505 unique violation → treat as skip
        if ((error as any).code === '23505') {
          toast.message('That rule already exists');
        } else {
          throw error;
        }
      } else if (data) {
        setRules((prev) => [...prev, data as Rule]);
        setDraftScopeValue('');
        toast.success('Rule added');
      }
    } catch (err: any) {
      console.error('[Availability] add failed:', err);
      toast.error(err?.message ?? 'Failed to add rule');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (rule: Rule) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('product_availability').delete().eq('id', rule.id);
      if (error) throw error;
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      toast.success('Rule removed');
    } catch (err: any) {
      console.error('[Availability] remove failed:', err);
      toast.error(err?.message ?? 'Failed to remove rule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 border rounded-md p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Availability</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Variants inherit the base product's availability.
          </p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="text-sm bg-muted/50 rounded px-3 py-2">
        <span className="text-muted-foreground mr-1">Status:</span>
        <span className="font-medium">{loading ? 'Loading…' : summary}</span>
      </div>

      {!loading && (
        <>
          {rules.length > 0 && (
            <div className="space-y-2">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-sm border rounded px-2 py-1.5">
                  <Badge
                    variant="outline"
                    className={
                      r.mode === 'include'
                        ? 'border-green-500 text-green-700 bg-green-50'
                        : 'border-red-500 text-red-700 bg-red-50'
                    }
                  >
                    {r.mode === 'include' ? 'Include' : 'Exclude'}
                  </Badge>
                  <span className="text-muted-foreground">{SCOPE_LABEL[r.scope_type]} =</span>
                  <span className="font-medium flex-1 truncate">{labelForRule(r)}</span>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemove(r)}
                      disabled={saving}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canManage ? (
            <div className="grid grid-cols-1 sm:grid-cols-[120px_140px_1fr_auto] gap-2 items-center pt-2 border-t">
              <Select value={draftMode} onValueChange={(v) => setDraftMode(v as Mode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="include">Include</SelectItem>
                  <SelectItem value="exclude">Exclude</SelectItem>
                </SelectContent>
              </Select>
              <Select value={draftScopeType} onValueChange={(v) => setDraftScopeType(v as ScopeType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SCOPE_LABEL) as ScopeType[]).map((k) => (
                    <SelectItem key={k} value={k}>{SCOPE_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {renderScopeValuePicker()}
              <Button onClick={handleAdd} disabled={saving || !draftScopeValue}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground pt-2 border-t">
              You don't have permission to manage availability rules.
            </div>
          )}
        </>
      )}
    </div>
  );
}
