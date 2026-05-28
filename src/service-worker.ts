/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | PrecacheEntry)[];
};

interface PrecacheEntry {
  url: string;
  revision?: string;
}
import { precacheAndRoute, createHandlerBoundToURL, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Version runtime caches to force fresh data after deploys
// INCREMENT THIS VERSION TO FORCE COMPLETE CACHE REFRESH
const RUNTIME_CACHE_VERSION = 'v22';

// Workbox will replace this with the list of files to precache.
precacheAndRoute(self.__WB_MANIFEST);

const appShellHandler = createHandlerBoundToURL('/index.html');

// Immediately activate updated service worker and allow manual skip-waiting
self.addEventListener('install', () => {
  console.log('🔧 Installing service worker version:', RUNTIME_CACHE_VERSION);
  self.skipWaiting();
});

self.addEventListener('message', (event) => {
  if (event.data && (event.data === 'SKIP_WAITING' || event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }

  // Handle force clear request
  if (event.data && event.data.type === 'CLEAR_ALL_CACHES') {
    event.waitUntil(
      caches.keys().then((names) => {
        console.log('🗑️ Force clearing all caches...');
        return Promise.all(names.map((name) => caches.delete(name)));
      }),
    );
  }
});

// Cache cleanup on activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Let Workbox manage its own precache caches.
      try {
        cleanupOutdatedCaches();
      } catch {
        // ignore
      }

      const cacheNames = await caches.keys();
      const runtimeCaches = new Set([
        `api-cache-${RUNTIME_CACHE_VERSION}`,
        `images-cache-${RUNTIME_CACHE_VERSION}`,
        `dynamic-cache-${RUNTIME_CACHE_VERSION}`,
        `navigation-cache-${RUNTIME_CACHE_VERSION}`,
      ]);

      // Only delete OUR runtime caches from older versions.
      const deletionPromises = cacheNames
        .filter((name) => {
          const isOurRuntimeCache =
            name.startsWith('api-cache-') ||
            name.startsWith('images-cache-') ||
            name.startsWith('dynamic-cache-') ||
            name.startsWith('navigation-cache-');

          return isOurRuntimeCache && !runtimeCaches.has(name);
        })
        .map((name) => {
          console.log('🗑️ Deleting old runtime cache:', name);
          return caches.delete(name);
        });

      await Promise.all(deletionPromises);

      // Take control immediately
      await self.clients.claim();

      // Notify all clients
      const clients = await self.clients.matchAll();
      clients.forEach((client) => {
        client.postMessage({ type: 'CACHE_UPDATED', version: RUNTIME_CACHE_VERSION });
      });

      console.log('✅ Service worker activated with version:', RUNTIME_CACHE_VERSION);
    })(),
  );
});

// App-shell style navigation handling (prevents white screen)
registerRoute(
  ({ request, url }) => request.mode === 'navigate' && !url.pathname.startsWith('/~oauth'),
  async (args) => {
    // Try network first with generous timeout
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), attempt === 0 ? 8000 : 5000);

        const networkResponse = await fetch(args.request, {
          signal: controller.signal,
          cache: 'no-store',
        });

        clearTimeout(timeoutId);

        if (networkResponse && networkResponse.ok) {
          return networkResponse;
        }
      } catch {
        // Retry once before falling back
      }
    }

    // Fall back to precached app shell
    try {
      return await appShellHandler(args);
    } catch {
      // Last resort: try fetching index.html directly from network one more time
      try {
        const fallbackResponse = await fetch('/index.html', { cache: 'no-store' });
        if (fallbackResponse.ok) return fallbackResponse;
      } catch {
        // ignore
      }

      // True offline with no cache - show minimal offline page
      return new Response(
        `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Offline</title>
    <style>
      body{margin:0;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;color:#111;padding:24px;text-align:center}
      .card{max-width:420px}
      h1{font-size:20px;margin:0 0 10px}
      p{margin:0;opacity:.75;line-height:1.5}
      button{margin-top:16px;padding:10px 24px;border:none;border-radius:8px;background:#4f46e5;color:#fff;font-size:16px;cursor:pointer}
    </style>
  </head>
  <body>
    <div class="card">
      <h1>You're offline</h1>
      <p>Connect to the internet once to finish setting up the app.</p>
      <button onclick="window.location.reload()">Retry</button>
    </div>
    <script>
      window.addEventListener('online', () => window.location.reload());
      // Auto-retry every 5 seconds
      setInterval(() => { if (navigator.onLine) window.location.reload(); }, 5000);
    </script>
  </body>
</html>`,
        { headers: { 'Content-Type': 'text/html' } },
      );
    }
  },
);

// Runtime caching: Supabase API - Use NetworkFirst with very short cache
registerRoute(
  ({ url }) => url.hostname.endsWith('.supabase.co') && !url.pathname.startsWith('/auth/v1/'),
  new NetworkFirst({
    cacheName: `api-cache-${RUNTIME_CACHE_VERSION}`,
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 60 * 2, // 2 minutes only for API responses
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

// Runtime caching: images - Use NetworkFirst with shorter cache
registerRoute(
  ({ request }) => request.destination === 'image',
  new NetworkFirst({
    cacheName: `images-cache-${RUNTIME_CACHE_VERSION}`,
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 2, // 2 hours for images
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

// Skip caching for non-GET requests (Workbox strategies only handle GET)
// Keep a small cache only for GET requests to our own API/function routes.
registerRoute(
  ({ url, request }) => {
    return (
      request.method === 'GET' &&
      (url.pathname.includes('/api/') || url.pathname.includes('/functions/'))
    );
  },
  new NetworkFirst({
    cacheName: `dynamic-cache-${RUNTIME_CACHE_VERSION}`,
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60, // 1 minute for dynamic content
        purgeOnQuotaError: true,
      }),
    ],
  }),
);
