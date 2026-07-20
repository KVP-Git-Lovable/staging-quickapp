import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Loader2, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Notification } from '@/hooks/useNotifications';

interface Props {
  notification: Notification | null;
  onClose: () => void;
}

export function ReportNotificationDialog({ notification, onClose }: Props) {
  const [downloading, setDownloading] = useState(false);
  if (!notification) return null;

  const meta = (notification.metadata ?? {}) as Record<string, any>;
  const subscriptionId: string | undefined = meta.subscription_id;
  const storagePath: string | undefined = meta.storage_path;
  const format: string = meta.attachment_format ?? 'summary_only';
  const period: string = meta.period ?? '';
  const bodyMd: string = meta.body_md ?? '';

  const handleDownload = async () => {
    if (!subscriptionId || !storagePath) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sign-report-file', {
        body: { subscription_id: subscriptionId, storage_path: storagePath },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('No URL returned');
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast.error(e.message || 'Failed to download report');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={18} /> {notification.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs">
            {period && <Badge variant="secondary">{period}</Badge>}
            <Badge variant="outline">{format}</Badge>
          </div>

          {format === 'summary_only' ? (
            <pre className="text-xs bg-muted/50 rounded p-3 whitespace-pre-wrap max-h-80 overflow-y-auto">
              {bodyMd || notification.message}
            </pre>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{notification.message}</p>
              {storagePath ? (
                <Button onClick={handleDownload} disabled={downloading} className="gap-2 w-full">
                  {downloading ? <><Loader2 size={14} className="animate-spin" />Preparing…</> : <><Download size={14} />Download report</>}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground italic">File not available.</p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
