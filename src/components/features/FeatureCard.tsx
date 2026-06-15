import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FeatureToggle } from './FeatureToggle';
import type { EffectiveFeature } from '@/context/FeatureContext';
import { Check, X, AlertTriangle } from 'lucide-react';

interface FeatureCardProps {
  feature: EffectiveFeature;
  onToggle?: (next: boolean) => void;
  editable?: boolean;
  showOverrideHint?: boolean;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({
  feature,
  onToggle,
  editable = false,
  showOverrideHint = false,
}) => {
  const isBlocked = (feature.blocked_by?.length ?? 0) > 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-sm">{feature.feature_name}</h4>
              {feature.category && (
                <Badge variant="outline" className="text-[10px] capitalize">
                  {feature.category}
                </Badge>
              )}
              {isBlocked ? (
                <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800">
                  <AlertTriangle className="mr-1 h-3 w-3" /> Blocked
                </Badge>
              ) : feature.enabled ? (
                <Badge className="text-[10px] bg-emerald-100 text-emerald-800">
                  <Check className="mr-1 h-3 w-3" /> Enabled
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  <X className="mr-1 h-3 w-3" /> Disabled
                </Badge>
              )}
              {showOverrideHint && feature.company_override !== null && (
                <Badge variant="outline" className="text-[10px]">
                  Override: {feature.company_override ? 'On' : 'Off'}
                </Badge>
              )}
            </div>
            {feature.description && (
              <p className="mt-1 text-xs text-muted-foreground">{feature.description}</p>
            )}
            <code className="mt-1 inline-block text-[10px] text-muted-foreground bg-muted px-1 rounded">
              {feature.feature_key}
            </code>
          </div>
          {editable && onToggle && (
            <FeatureToggle
              enabled={feature.enabled}
              onChange={onToggle}
              blockedBy={feature.blocked_by}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
};
