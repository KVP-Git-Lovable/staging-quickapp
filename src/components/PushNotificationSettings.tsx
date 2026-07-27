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
          try {
            const token = await initWebPush(user.id);
            setEnabled(Boolean(token));
          } catch (error) {
            console.error('Push registration failed:', error);
            setEnabled(false);
          }
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
    <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center shadow-sm ${enabled ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-amber-500/30' : 'bg-muted text-muted-foreground'}`}>
            {enabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-sm text-foreground">Push Notifications</p>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Switch checked={enabled} disabled={saving} onCheckedChange={onToggle} />
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Get real-time alerts on your device for orders, approvals, and mentions.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>

  );
}
