import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, RotateCcw, Check } from 'lucide-react';
import type { EffectiveFeature } from '@/context/FeatureContext';

interface Company { id: string; name: string }

export const ByCompanyTab: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [features, setFeatures] = useState<EffectiveFeature[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('companies').select('id,name').order('name');
      setCompanies((data ?? []) as Company[]);
      if (data && data.length > 0 && !selectedCompany) setSelectedCompany(data[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFeatures = async (cid: string) => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_effective_features', { p_company_id: cid });
    if (error) toast.error(error.message);
    setFeatures((data ?? []) as EffectiveFeature[]);
    setLoading(false);
  };

  useEffect(() => { if (selectedCompany) loadFeatures(selectedCompany); }, [selectedCompany]);

  const handleToggle = async (feature: EffectiveFeature, next: boolean) => {
    const blocked = next && (feature.blocked_by?.length ?? 0) > 0;
    const cascade = blocked
      ? confirm(`Enable "${feature.feature_name}" and auto-enable its dependencies (${feature.blocked_by.join(', ')})?`)
      : false;
    const { error } = await supabase.rpc('set_company_feature', {
      p_company_id: selectedCompany,
      p_feature_key: feature.feature_key,
      p_enabled: next,
      p_cascade: cascade,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`${feature.feature_name} ${next ? 'enabled' : 'disabled'} for company`);
    loadFeatures(selectedCompany);
  };

  const handleClearOverride = async (feature: EffectiveFeature) => {
    const { error } = await supabase.rpc('clear_company_feature_override', {
      p_company_id: selectedCompany,
      p_feature_key: feature.feature_key,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Override cleared — feature now inherits global');
    loadFeatures(selectedCompany);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Company:</span>
        <Select value={selectedCompany} onValueChange={setSelectedCompany}>
          <SelectTrigger className="w-[280px]"><SelectValue placeholder="Select a company" /></SelectTrigger>
          <SelectContent>
            {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-2">
          {features.map(f => {
            const blocked = (f.blocked_by?.length ?? 0) > 0;
            return (
              <Card key={f.feature_id}>
                <CardContent className="p-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{f.feature_name}</span>
                      {f.category && <Badge variant="outline" className="text-[10px] capitalize">{f.category}</Badge>}
                      {!f.global_enabled && <Badge variant="destructive" className="text-[10px]">Global OFF</Badge>}
                      {f.company_override !== null && (
                        <Badge variant="outline" className="text-[10px]">Override: {f.company_override ? 'On' : 'Off'}</Badge>
                      )}
                      {blocked && (
                        <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800">
                          <AlertTriangle className="mr-1 h-3 w-3" /> Blocked
                        </Badge>
                      )}
                      {f.enabled && !blocked && (
                        <Badge className="text-[10px] bg-emerald-100 text-emerald-800">
                          <Check className="mr-1 h-3 w-3" /> Effective ON
                        </Badge>
                      )}
                    </div>
                    {f.description && <p className="mt-1 text-xs text-muted-foreground">{f.description}</p>}
                    <code className="mt-1 inline-block text-[10px] text-muted-foreground bg-muted px-1 rounded">{f.feature_key}</code>
                    {blocked && (
                      <p className="mt-1 text-xs text-amber-700">Requires: {f.blocked_by.join(', ')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {f.company_override !== null && (
                      <Button size="sm" variant="ghost" onClick={() => handleClearOverride(f)} title="Clear override (inherit global)">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                    <Switch
                      checked={f.enabled}
                      disabled={!f.global_enabled}
                      onCheckedChange={(v) => handleToggle(f, v)}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
