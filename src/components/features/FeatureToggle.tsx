import React from 'react';
import { Switch } from '@/components/ui/switch';
import { DependencyWarning } from './DependencyWarning';

interface FeatureToggleProps {
  enabled: boolean;
  onChange: (next: boolean) => void;
  blockedBy?: string[];
  disabled?: boolean;
  label?: string;
}

export const FeatureToggle: React.FC<FeatureToggleProps> = ({
  enabled,
  onChange,
  blockedBy = [],
  disabled = false,
  label,
}) => {
  const isBlocked = blockedBy.length > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Switch
          checked={enabled}
          disabled={disabled || isBlocked}
          onCheckedChange={onChange}
        />
        {label && <span className="text-sm">{label}</span>}
      </div>
      {isBlocked && <DependencyWarning blockedBy={blockedBy} />}
    </div>
  );
};
