import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { Device } from '@capacitor/device';
import { supabase } from '@/integrations/supabase/client';
import { devLog, devError } from '@/utils/devLog';

let listenersRegistered = false;
let currentToken: string | null = null;

async function upsertToken(token: string, _userId: string, platform: 'android' | 'ios') {
  try {
    const info = await Device.getInfo().catch(() => null);
    const device_info = info
      ? { model: info.model, os: info.operatingSystem, osVersion: info.osVersion }
      : {};
    const { error } = await (supabase.rpc as any)('claim_push_token', {
      p_token: token,
      p_platform: platform,
      p_device_info: device_info,
    });
    if (error) throw error;
    currentToken = token;
  } catch (e) {
    devError('[Push] claim token failed', e);
  }
}

export async function registerNativePush(userId: string, navigate: (path: string) => void) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const perm = await PushNotifications.checkPermissions();
    let status = perm.receive;
    if (status !== 'granted') {
      const req = await PushNotifications.requestPermissions();
      status = req.receive;
    }
    if (status !== 'granted') {
      devLog('[Push] permission not granted');
      return;
    }

    if (!listenersRegistered) {
      listenersRegistered = true;
      const platform = Capacitor.getPlatform() as 'android' | 'ios';

      PushNotifications.addListener('registration', (t) => {
        devLog('[Push] token', t.value);
        upsertToken(t.value, userId, platform);
      });
      PushNotifications.addListener('registrationError', (err) => {
        devError('[Push] registration error', err);
      });
      PushNotifications.addListener('pushNotificationReceived', (n) => {
        devLog('[Push] foreground received', n);
      });
      PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
        const route = (a.notification.data as any)?.route;
        if (route) navigate(route);
      });
    }

    await PushNotifications.register();
  } catch (e) {
    devError('[Push] register failed', e);
  }
}

export async function unregisterNativePush() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (currentToken) {
      await supabase.from('push_device_tokens').delete().eq('token', currentToken);
      currentToken = null;
    }
    await PushNotifications.removeAllListeners();
    listenersRegistered = false;
  } catch (e) {
    devError('[Push] unregister failed', e);
  }
}
