/**
 * imageCache — on-demand image caching to device storage (Offline Architecture v2 · Phase 8).
 *
 * Instead of bulk-downloading every product/retailer image, fetch on first view,
 * cache to the filesystem, and serve from disk thereafter (works offline). On web
 * (dev preview) it just returns the remote URL. Pairs with useCachedImage for
 * lazy, on-scroll loading.
 */
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

const DIR = Directory.Cache;
const FOLDER = 'imgcache';

function keyFor(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
  const ext = (url.split('?')[0].match(/\.(jpg|jpeg|png|webp|gif)$/i)?.[1] || 'img').toLowerCase();
  return `${FOLDER}/${Math.abs(h)}.${ext}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Returns a webview-usable URI for the image: a cached local file if available,
 * otherwise downloads+caches it, falling back to the remote URL on any failure.
 */
export async function getCachedImage(url?: string | null): Promise<string | null> {
  if (!url) return null;
  if (!Capacitor.isNativePlatform()) return url; // web: serve remote directly
  const path = keyFor(url);
  try {
    const stat = await Filesystem.stat({ path, directory: DIR }).catch(() => null);
    if (stat) return Capacitor.convertFileSrc((stat as any).uri);
  } catch { /* fall through to download */ }
  try {
    const resp = await fetch(url);
    if (!resp.ok) return url;
    const blob = await resp.blob();
    const b64 = await blobToBase64(blob);
    await Filesystem.writeFile({ path, data: b64, directory: DIR, recursive: true });
    const stat = await Filesystem.stat({ path, directory: DIR });
    return Capacitor.convertFileSrc((stat as any).uri);
  } catch {
    return url; // remote fallback (only pre-cached images show offline)
  }
}

/** Best-effort eviction: clear the whole image cache folder (call rarely, e.g. low storage). */
export async function clearImageCache(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try { await Filesystem.rmdir({ path: FOLDER, directory: DIR, recursive: true }); } catch { /* ignore */ }
}
