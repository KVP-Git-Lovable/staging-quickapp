import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, deleteToken } from 'firebase/messaging';
import { supabase } from '@/integrations/supabase/client';
import { devLog, devError } from '@/utils/devLog';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

function isPreviewOrIframe(): boolean {
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const h = window.location.hostname;
  return (
    h.startsWith('id-preview--') ||
    h.startsWith('preview--') ||
    h.endsWith('.lovableproject.com') ||
    h.endsWith('.lovableproject-dev.com') ||
    h.endsWith('.beta.lovable.dev')
  );
}

let currentToken: string | null = null;

export async function initWebPush(userId: string, onNotification?: () => void): Promise<string | null> {
  try {
    if (isPreviewOrIframe()) return null;
    if (!('Notification' in window)) return null;
    if (!(await isSupported())) return null;
    if (!config.apiKey || !VAPID_KEY) {
      devLog('[Push] Firebase web config missing');
      return null;
    }

    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return null;
    } else if (Notification.permission !== 'granted') {
      return null;
    }

    if (!getApps().length) initializeApp(config);
    // Pass Firebase web config to the SW via URL params so the SW file stays generic
    const swUrl =
      `/firebase-messaging-sw.js?apiKey=${encodeURIComponent(config.apiKey!)}` +
      `&projectId=${encodeURIComponent(config.projectId!)}` +
      `&appId=${encodeURIComponent(config.appId!)}` +
      `&senderId=${encodeURIComponent(config.messagingSenderId!)}`;
    const reg = await navigator.serviceWorker.register(swUrl);
    const messaging = getMessaging();
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) return null;

    await supabase.from('push_device_tokens').upsert(
      {
        user_id: userId,
        token,
        platform: 'web',
        device_info: { userAgent: navigator.userAgent },
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    );
    currentToken = token;

    onMessage(messaging, () => {
      onNotification?.();
    });

    return token;
  } catch (e) {
    devError('[Push] web init failed', e);
    return null;
  }
}

export async function disableWebPush() {
  try {
    if (currentToken) {
      await supabase.from('push_device_tokens').delete().eq('token', currentToken);
    }
    if (await isSupported()) {
      const messaging = getMessaging();
      await deleteToken(messaging).catch(() => {});
    }
    currentToken = null;
  } catch (e) {
    devError('[Push] web disable failed', e);
  }
}
