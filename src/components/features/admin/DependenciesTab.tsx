import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface Feature { id: string; feature_key: string; feature_name: string }
interface Dep {
  id: string;
  feature_id: string;
  depends_on_feature_id: string;
  dependency_type: 'hard' | 'soft';
  description: string | null;
}

export const DependenciesTab: React.FC = () => {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [deps, setDeps] = useState<Dep[]>([]);
  const [fId, setFId] = useState('');
  const [depId, setDepId] = useState('');
  const [type, setType] = useState<'hard' | 'soft'>('hard');
  const [desc, setDesc] = useState('');

  const load = async () => {
    const [{ data: f }, { data: d }] = await Promise.all([
      supabase.from('feature_flags').select('id,feature_key,feature_name').order('feature_name'),
      supabase.from('feature_dependencies').select('*').order('created_at', { ascending: false }),
    ]);
    setFeatures((f ?? []) as Feature[]);
    setDeps((d ?? []) as Dep[]);
  };

  useEffect(() => { load(); }, []);

  const featureById = (id: string) => features.find(x => x.id === id)?.feature_name ?? id;

  const handleAdd = async () => {
    if (!fId || !depId) { toast.error('Select both features'); return; }
    if (fId === depId) { toast.error('A feature cannot depend on itself'); return; }
    const { error } = await supabase.from('feature_dependencies').insert({
      feature_id: fId, depends_on_feature_id: depId, dependency_type: type, description: desc || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Dependency added');
    setFId(''); setDepId(''); setDesc('');
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('feature_dependencies').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Removed');
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-sm">Add Dependency</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="text-xs text-muted-foreground">Feature</label>
              <Select value={fId} onValueChange={setFId}>
                <SelectTrigger><SelectValue placeholder="Feature" /></SelectTrigger>
                <SelectContent>{features.map(f => <SelectItem key={f.id} value={f.id}>{f.feature_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Depends on</label>
              <Select value={depId} onValueChange={setDepId}>
                <SelectTrigger><SelectValue placeholder="Prerequisite" /></SelectTrigger>
                <SelectContent>{features.map(f => <SelectItem key={f.id} value={f.id}>{f.feature_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <Select value={type} onValueChange={(v) => setType(v as 'hard' | 'soft')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hard">Hard (blocks)</SelectItem>
                  <SelectItem value="soft">Soft (warns)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Description (optional)</label>
              <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Why?" />
            </div>
          </div>
          <Button onClick={handleAdd} size="sm"><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {deps.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No dependencies defined</p>}
        {deps.map(d => (
          <Card key={d.id}>
            <CardContent className="p-3 flex items-center justify-between gap-3">
              <div className="flex-1 text-sm">
                <span className="font-medium">{featureById(d.feature_id)}</span>
                <span className="mx-2 text-muted-foreground">requires</span>
                <span className="font-medium">{featureById(d.depends_on_feature_id)}</span>
                <Badge variant={d.dependency_type === 'hard' ? 'destructive' : 'secondary'} className="ml-2 text-[10px]">
                  {d.dependency_type}
                </Badge>
                {d.description && <p className="text-xs text-muted-foreground mt-1">{d.description}</p>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(d.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
