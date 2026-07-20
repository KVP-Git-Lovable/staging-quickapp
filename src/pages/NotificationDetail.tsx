import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ReportNotificationDialog } from '@/components/notifications/ReportNotificationDialog';
import { LoadingScreen } from '@/components/LoadingScreen';
import { toast } from 'sonner';
import type { Notification } from '@/hooks/useNotifications';

export default function NotificationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [notification, setNotification] = useState<Notification | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) {
        toast.error('Notification not found');
        navigate('/');
        return;
      }
      // Mark read
      supabase.from('notifications').update({ is_read: true }).eq('id', id).then(() => {});
      setNotification(data as unknown as Notification);
      setLoading(false);
    })();
  }, [id, navigate]);

  if (loading) return <LoadingScreen />;
  if (!notification) return null;

  if (notification.type === 'report_delivery') {
    return <ReportNotificationDialog notification={notification} onClose={() => navigate(-1)} />;
  }

  // Fallback for other types — route to notifications hub or home
  navigate('/');
  return null;
}
