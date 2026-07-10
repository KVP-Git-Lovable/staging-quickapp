/* Firebase Cloud Messaging service worker for PWA web push.
 * Values are loaded from a companion config file the app writes at build/runtime.
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Config injected via URL params at registration time:
//   navigator.serviceWorker.register('/firebase-messaging-sw.js?apiKey=...&projectId=...&appId=...&senderId=...')
const params = new URL(self.location).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  projectId: params.get('projectId'),
  appId: params.get('appId'),
  messagingSenderId: params.get('senderId'),
};

if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || 'Notification';
    const options = {
      body: payload.notification?.body || payload.data?.body || '',
      icon: '/icons/app-icon.png',
      data: payload.data || {},
    };
    self.registration.showNotification(title, options);
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = event.notification.data?.route || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({ type: 'PUSH_CLICK', route });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(route);
    }),
  );
});
