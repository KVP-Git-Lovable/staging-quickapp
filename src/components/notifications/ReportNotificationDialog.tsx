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

  const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';

  const deriveFilename = (signedUrl: string) => {
    const ext = (storagePath?.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1]
      || signedUrl.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1]
      || 'xlsx').toLowerCase();
    const base = slugify(notification.title || 'report');
    const periodPart = period ? `-${slugify(period)}` : '';
    return `${base}${periodPart}.${ext}`;
  };

  const handleDownload = async () => {
    if (!subscriptionId || !storagePath) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sign-report-file', {
        body: { subscription_id: subscriptionId, storage_path: storagePath },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('No URL returned');

      let blob: Blob;
      try {
        const res = await fetch(data.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        blob = await res.blob();
      } catch (fetchErr) {
        console.error('Report fetch failed:', fetchErr);
        toast.error(
          "Couldn't download the report — please try again. Your browser or an extension may be blocking the download."
        );
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = deriveFilename(data.url);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (e: any) {
      console.error(e);
      toast.error("Couldn't download the report — please try again");
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
