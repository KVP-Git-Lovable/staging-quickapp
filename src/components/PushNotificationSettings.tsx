import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { registerNativePush, unregisterNativePush } from '@/utils/pushRegistration';
import { initWebPush, disableWebPush } from '@/lib/firebaseMessaging';
import { useNavigate } from 'react-router-dom';

export function PushNotificationSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('notification_preferences')
        .select('is_enabled')
        .eq('user_id', user.id)
        .eq('template_type', 'push_master')
        .maybeSingle();
      setEnabled(data?.is_enabled ?? true);
      setLoading(false);
    })();
  }, [user?.id]);

  const onToggle = async (next: boolean) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('notification_preferences').upsert(
        { user_id: user.id, template_type: 'push_master', is_enabled: next },
        { onConflict: 'user_id,template_type' },
      );
      if (error) throw error;
      setEnabled(next);

      if (next) {
        if (Capacitor.isNativePlatform()) {
          await registerNativePush(user.id, (r) => navigate(r));
        } else {
          const token = await initWebPush(user.id);
          if (!token) toast.warning('Enable notifications in your browser to receive push alerts.');
        }
        toast.success('Push notifications enabled');
      } else {
        if (Capacitor.isNativePlatform()) await unregisterNativePush();
        else await disableWebPush();
        toast.success('Push notifications disabled');
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to update preference');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          Push Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground pr-4">
          Get real-time alerts on your device for orders, approvals, and mentions.
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Switch checked={enabled} disabled={saving} onCheckedChange={onToggle} />
        )}
      </CardContent>
    </Card>
  );
}
