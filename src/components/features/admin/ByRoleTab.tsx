import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Search } from 'lucide-react';

interface Role { id: string; name: string }
interface FeatureRow {
  id: string;
  feature_key: string;
  feature_name: string;
  description: string | null;
  category: string;
  is_enabled: boolean;
  override: boolean | null;
}

export const ByRoleTab: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('security_profiles').select('id, name').order('name');
      setRoles((data ?? []) as Role[]);
      if (data && data.length > 0) setSelectedRole(data[0].id);
    })();
  }, []);

  const load = async (roleId: string) => {
    setLoading(true);
    const [{ data: flags }, { data: overrides }] = await Promise.all([
      supabase.from('feature_flags').select('id, feature_key, feature_name, description, category, is_enabled').order('category').order('feature_name'),
      supabase.from('role_feature_config').select('feature_id, is_enabled').eq('role_id', roleId),
    ]);
    const m = new Map<string, boolean | null>();
    (overrides ?? []).forEach((o: any) => m.set(o.feature_id, o.is_enabled));
    setFeatures(((flags ?? []) as any[]).map(f => ({ ...f, override: m.has(f.id) ? m.get(f.id) ?? null : null })));
    setLoading(false);
  };

  useEffect(() => { if (selectedRole) load(selectedRole); }, [selectedRole]);

  const setOverride = async (f: FeatureRow, value: boolean | null) => {
    if (value === null) {
      const { error } = await supabase.from('role_feature_config').delete().eq('role_id', selectedRole).eq('feature_id', f.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.rpc('set_role_feature', {
        p_role_id: selectedRole,
        p_feature_key: f.feature_key,
        p_enabled: value,
      });
      if (error) { toast.error(error.message); return; }
    }
    toast.success(`${f.feature_name}: ${value === null ? 'inherit' : value ? 'force ON' : 'force OFF'}`);
    load(selectedRole);
  };

  const categories = Array.from(new Set(features.map(f => f.category)));
  const filtered = features.filter(f => {
    if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
    if (search && !f.feature_name.toLowerCase().includes(search.toLowerCase()) && !f.feature_key.includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Role:</span>
        <Select value={selectedRole} onValueChange={setSelectedRole}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select a role" /></SelectTrigger>
          <SelectContent>
            {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? <Skeleton className="h-64 w-full" /> : (
        <div className="space-y-2">
          {filtered.map(f => {
            const state = f.override === null ? 'inherit' : f.override ? 'on' : 'off';
            return (
              <Card key={f.id}>
                <CardContent className="p-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{f.feature_name}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">{f.category}</Badge>
                      {!f.is_enabled && <Badge variant="destructive" className="text-[10px]">Global OFF</Badge>}
                      {f.override !== null && <Badge variant="outline" className="text-[10px]">Override: {f.override ? 'On' : 'Off'}</Badge>}
                    </div>
                    {f.description && <p className="mt-1 text-xs text-muted-foreground">{f.description}</p>}
                    <code className="mt-1 inline-block text-[10px] text-muted-foreground bg-muted px-1 rounded">{f.feature_key}</code>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant={state === 'inherit' ? 'default' : 'outline'} onClick={() => setOverride(f, null)}>Inherit</Button>
                    <Button size="sm" variant={state === 'on' ? 'default' : 'outline'} onClick={() => setOverride(f, true)}>On</Button>
                    <Button size="sm" variant={state === 'off' ? 'destructive' : 'outline'} onClick={() => setOverride(f, false)}>Off</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No features match.</p>}
        </div>
      )}
    </div>
  );
};
