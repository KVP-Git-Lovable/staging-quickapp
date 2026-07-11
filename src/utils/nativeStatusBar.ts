import { Capacitor } from '@capacitor/core';

/**
 * Configure native status bar so the WebView sits below the system status bar
 * and env(safe-area-inset-*) values reflect the true insets on Android 15+/iOS.
 */
export const initNativeStatusBar = async () => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Keep WebView below status bar — insets remain reliable across notch/punch-hole devices.
    await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  } catch (e) {
    console.warn('[nativeStatusBar] init failed:', e);
  }
};
