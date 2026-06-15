import React from 'react';
import { useAllFeatures } from '@/hooks/useFeature';
import { useFeatureContext } from '@/context/FeatureContext';
import { FeatureCard } from '@/components/features/FeatureCard';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const CompanyFeaturesTab: React.FC = () => {
  const { features, isLoading, refresh } = useAllFeatures();
  const { companyId } = useFeatureContext();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!companyId) return <p className="text-sm text-muted-foreground">No company found.</p>;

  const total = features.length;
  const enabled = features.filter(f => f.enabled).length;
  const blocked = features.filter(f => (f.blocked_by?.length ?? 0) > 0).length;

  const handleToggle = async (feature: typeof features[number], next: boolean) => {
    const cascade = next && (feature.blocked_by?.length ?? 0) > 0
      ? confirm(`Auto-enable dependencies (${feature.blocked_by.join(', ')})?`)
      : false;
    const { error } = await supabase.rpc('set_company_feature', {
      p_company_id: companyId,
      p_feature_key: feature.feature_key,
      p_enabled: next,
      p_cascade: cascade,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`${feature.feature_name} ${next ? 'enabled' : 'disabled'}`);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-bold">{total}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Enabled</div><div className="text-2xl font-bold text-emerald-600">{enabled}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Blocked</div><div className="text-2xl font-bold text-amber-600">{blocked}</div></CardContent></Card>
      </div>

      <div className="space-y-2">
        {features.map(f => (
          <FeatureCard
            key={f.feature_id}
            feature={f}
            editable
            showOverrideHint
            onToggle={(v) => handleToggle(f, v)}
          />
        ))}
      </div>
    </div>
  );
};
