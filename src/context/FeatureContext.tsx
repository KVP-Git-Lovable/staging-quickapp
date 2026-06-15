import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface EffectiveFeature {
  feature_id: string;
  feature_key: string;
  feature_name: string;
  description: string | null;
  category: string | null;
  enabled: boolean;
  global_enabled: boolean;
  company_override: boolean | null;
  blocked_by: string[];
}

interface FeatureContextValue {
  features: Map<string, EffectiveFeature>;
  companyId: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const FeatureContext = createContext<FeatureContextValue>({
  features: new Map(),
  companyId: null,
  isLoading: true,
  error: null,
  refresh: async () => {},
});

const CACHE_KEY = 'effective_features_cache_v1';

const loadCache = (): EffectiveFeature[] | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

export const FeatureProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [features, setFeatures] = useState<Map<string, EffectiveFeature>>(() => {
    const cached = loadCache();
    return cached ? new Map(cached.map(f => [f.feature_key, f])) : new Map();
  });
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      // resolve current company (single-company app today)
      const { data: cmp } = await supabase
        .from('companies')
        .select('id')
        .limit(1)
        .maybeSingle();
      const cid = cmp?.id ?? null;
      setCompanyId(cid);
      if (!cid) { setIsLoading(false); return; }

      const { data, error: rpcErr } = await supabase.rpc('get_effective_features', {
        p_company_id: cid,
      });
      if (rpcErr) throw rpcErr;
      const list = (data ?? []) as EffectiveFeature[];
      setFeatures(new Map(list.map(f => [f.feature_key, f])));
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch {}
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load features');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, user?.id]);

  const value = useMemo(() => ({ features, companyId, isLoading, error, refresh: load }), [features, companyId, isLoading, error, load]);

  return <FeatureContext.Provider value={value}>{children}</FeatureContext.Provider>;
};

export const useFeatureContext = () => useContext(FeatureContext);
