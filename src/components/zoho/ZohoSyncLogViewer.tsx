import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import type { ZohoLogRow } from '@/hooks/useZohoSync';

interface Props {
  logs: ZohoLogRow[];
  nameById: Record<string, string>;
}

const actionTone = (action: string) => {
  if (action === 'skip') return 'secondary' as const;
  if (action === 'create' || action === 'update') return 'default' as const;
  return 'outline' as const;
};

export const ZohoSyncLogViewer: React.FC<Props> = ({ logs, nameById }) => {
  const [openId, setOpenId] = useState<string | null>(null);

  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No sync activity logged yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sync log (newest first)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {logs.map((log) => (
          <Collapsible
            key={log.id}
            open={openId === log.id}
            onOpenChange={(o) => setOpenId(o ? log.id : null)}
          >
            <div className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={actionTone(log.action)}>{log.action}</Badge>
                <span className="text-sm font-medium">
                  {log.retailer_id ? nameById[log.retailer_id] ?? log.retailer_id : log.entity_type}
                </span>
                {log.http_status != null && (
                  <Badge variant={log.http_status >= 400 ? 'destructive' : 'outline'}>{log.http_status}</Badge>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString()}
                </span>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
              </div>
              {log.error_message && (
                <p className="mt-1 text-xs text-destructive">{log.error_message}</p>
              )}
              <CollapsibleContent>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Request payload</p>
                    <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs">
                      {JSON.stringify(log.request_payload ?? {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Response</p>
                    <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs">
                      {JSON.stringify(log.response_payload ?? {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ))}
      </CardContent>
    </Card>
  );
};
