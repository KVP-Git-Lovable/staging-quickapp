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
      const preferenceEnabled = data?.is_enabled ?? true;

      if (!Capacitor.isNativePlatform() && preferenceEnabled) {
        const browserPermission = 'Notification' in window ? Notification.permission : 'denied';
        if (browserPermission === 'granted') {
          const token = await initWebPush(user.id);
          setEnabled(Boolean(token));
        } else {
          // A saved preference is not the same as an active browser subscription.
          // Keep the switch off so the next user click can request permission.
          setEnabled(false);
        }
      } else {
        setEnabled(preferenceEnabled);
      }
      setLoading(false);
    })();
  }, [user?.id]);

  const onToggle = async (next: boolean) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      if (next) {
        if (Capacitor.isNativePlatform()) {
          await registerNativePush(user.id, (r) => navigate(r));
        } else {
          const token = await initWebPush(user.id);
          if (!token) {
            const permission = 'Notification' in window ? Notification.permission : 'unsupported';
            throw new Error(
              permission === 'denied'
                ? 'Notifications are blocked. Allow them in your browser site settings, then try again.'
                : 'This browser could not register for push notifications.',
            );
          }
        }
      } else {
        if (Capacitor.isNativePlatform()) await unregisterNativePush();
        else await disableWebPush();
      }

      const { error } = await supabase.from('notification_preferences').upsert(
        { user_id: user.id, template_type: 'push_master', is_enabled: next },
        { onConflict: 'user_id,template_type' },
      );
      if (error) throw error;

      setEnabled(next);
      toast.success(next ? 'Push notifications enabled on this device' : 'Push notifications disabled');
    } catch (e: any) {
      setEnabled(false);
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
