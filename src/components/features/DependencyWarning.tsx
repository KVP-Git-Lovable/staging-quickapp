import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface DependencyWarningProps {
  blockedBy: string[];
  className?: string;
}

export const DependencyWarning: React.FC<DependencyWarningProps> = ({ blockedBy, className }) => {
  if (!blockedBy || blockedBy.length === 0) return null;
  return (
    <div className={`flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 ${className ?? ''}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <div className="font-medium">Blocked by missing dependencies</div>
        <div className="mt-0.5">Requires: {blockedBy.join(', ')}</div>
      </div>
    </div>
  );
};
