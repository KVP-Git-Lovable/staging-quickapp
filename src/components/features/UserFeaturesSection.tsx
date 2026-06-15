import React from 'react';
import { useAllFeatures } from '@/hooks/useFeature';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, X, Sparkles } from 'lucide-react';

export const UserFeaturesSection: React.FC = () => {
  const { features, isLoading } = useAllFeatures();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" /> Features Available to Me
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : features.length === 0 ? (
          <p className="text-sm text-muted-foreground">No features configured.</p>
        ) : (
          <ul className="divide-y">
            {features.map(f => (
              <li key={f.feature_id} className="py-2 flex items-start gap-3">
                {f.enabled ? (
                  <Check className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
                ) : (
                  <X className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{f.feature_name}</div>
                  {f.description && (
                    <div className="text-xs text-muted-foreground">{f.description}</div>
                  )}
                </div>
                <span className={`text-xs ${f.enabled ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  {f.enabled ? 'Enabled' : 'Not enabled'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
