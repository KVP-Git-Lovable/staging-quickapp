import React from 'react';
import { createRoot } from 'react-dom/client';
// Import PWA capture FIRST to catch beforeinstallprompt event early
import './utils/pwaInstallCapture';
import App from './App.tsx';
import './index.css';
// Import i18n BEFORE app renders to ensure translations are available
import './i18n/config';
import { Capacitor } from '@capacitor/core';
// Core modules - static imports (always in main bundle)
import { offlineStorage } from './lib/offlineStorage';
import { initCrashlytics } from './utils/crashlytics';
import { initDownloadNotifications } from './utils/fileDownloader';

console.log('🚀 App starting...');

const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes('id-preview--') ||
  window.location.hostname.includes('lovableproject.com');

const isStandaloneApp =
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

const isNativeApp = Capacitor.isNativePlatform();
const shouldDisableServiceWorker = isPreviewHost || isInIframe || isNativeApp || isStandaloneApp;

const cleanupServiceWorkersAndCaches = async () => {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      console.log('🧹 Existing service workers unregistered');
    }

    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      console.log('🧹 Existing caches cleared');
    }
  } catch (cleanupError) {
    console.warn('⚠️ Failed to cleanup service workers/caches:', cleanupError);
  }
};

if (shouldDisableServiceWorker) {
  void cleanupServiceWorkersAndCaches();
}

// Recover from stale Vite optimized-dep references after a dev/preview restart.
// When Vite re-bundles deps, its `?v=<hash>` URL changes; pages still holding the
// old reference fail with "Failed to fetch dynamically imported module ... .vite/deps/...".
// Detect that specific error once and force a clean reload so users aren't stuck
// (e.g. on the invoice generator pulling in jspdf).
(() => {
  let recovering = false;
  const isStaleViteDepError = (msg?: string) =>
    !!msg &&
    msg.includes('Failed to fetch dynamically imported module') &&
    msg.includes('/.vite/deps/');

  const recover = async (reason: string) => {
    if (recovering) return;
    recovering = true;
    console.warn('♻️ Recovering from stale module load:', reason);
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (e) {
      console.warn('Cache/SW cleanup failed during recovery:', e);
    }
    const url = new URL(window.location.href);
    url.searchParams.set('_r', Date.now().toString());
    window.location.replace(url.toString());
  };

  window.addEventListener('error', (e) => {
    if (isStaleViteDepError(e?.message)) recover(e.message);
  });
  window.addEventListener('unhandledrejection', (e: any) => {
    const msg = e?.reason?.message || String(e?.reason || '');
    if (isStaleViteDepError(msg)) recover(msg);
  });
})();

// Initialize and render app immediately
const root = document.getElementById("root");
if (!root) {
  console.error('❌ Root element not found');
  throw new Error('Root element not found');
}

// Render app with StrictMode for better error detection
console.log('🎨 Rendering app...');
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
console.log('✅ App rendered successfully');

// Initialize background services after render
(async () => {
  try {
    // Do not keep a PWA service worker in preview, iframe, installed app, or native wrapper contexts.
    // Those contexts were the source of stale order-sync code on already-installed mobile apps.
    if (shouldDisableServiceWorker) {
      console.log('🛑 Skipping service worker registration for current runtime:', {
        isPreviewHost,
        isInIframe,
        isNativeApp,
        isStandaloneApp,
      });
    } else if ('serviceWorker' in navigator) {
      const { registerSW } = await import('virtual:pwa-register');
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          console.log('🔄 New content available, applying update now');
          updateSW(true);
        },
        onOfflineReady() {
          console.log('📴 App ready to work offline');
        },
        onRegistered(registration) {
          console.log('✅ Service Worker registered', registration);
        },
        onRegisterError(error) {
          console.error('❌ Service Worker registration error:', error);
        }
      });
    }
  } catch (error) {
    console.warn('⚠️ Service Worker registration failed:', error);
  }

  try {
    console.log('📦 Initializing offline storage...');
    await offlineStorage.init();
    console.log('✅ Offline storage ready');
  } catch (error) {
    console.warn('⚠️ Offline storage init failed:', error);
  }

  try {
    await initDownloadNotifications();
    console.log('✅ Download notifications initialized');
  } catch (error) {
    console.warn('⚠️ Download notifications init failed:', error);
  }

  try {
    await initCrashlytics();
  } catch (error) {
    console.warn('⚠️ Crashlytics init failed:', error);
  }

  try {
    const { initNativeStatusBar } = await import('./utils/nativeStatusBar');
    await initNativeStatusBar();
  } catch (error) {
    console.warn('⚠️ Native status bar init failed:', error);
  }
})();
