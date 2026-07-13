import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Database } from 'lucide-react';

/**
 * Dev/QA toggle for the Offline Architecture v2 SQLite engine (Phase 1).
 * Flips the `offline_engine` flag read by offlineStorage and reloads so the
 * storage layer re-initialises. Default OFF = current Preferences engine.
 */
export const OfflineEngineToggle = () => {
  const [on, setOn] = useState<boolean>(() => {
    try { return localStorage.getItem('offline_engine') === 'sqlite'; } catch { return false; }
  });

  const toggle = (v: boolean) => {
    try {
      if (v) localStorage.setItem('offline_engine', 'sqlite');
      else localStorage.removeItem('offline_engine');
    } catch { /* ignore */ }
    setOn(v);
    // Re-initialise the storage engine on the new setting.
    setTimeout(() => { try { location.reload(); } catch { /* ignore */ } }, 200);
  };

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3 mb-3">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-primary flex-shrink-0" />
        <div>
          <p className="text-sm font-medium">Offline Engine · v2 (SQLite)</p>
          <p className="text-xs text-muted-foreground">
            {on ? 'SQLite active — indexed, no size limit' : 'Preferences (current). Turn on to test v2.'}
          </p>
        </div>
      </div>
      <Switch checked={on} onCheckedChange={toggle} aria-label="Toggle SQLite offline engine" />
    </div>
  );
};
