/**
 * useCachedImage — lazy, offline-capable image source (Offline Architecture v2 · Phase 8).
 *
 * Returns a src for <img>: shows the remote URL immediately, then swaps to the
 * cached local file once available. Because it only runs when the component
 * mounts (and virtualized lists only mount visible rows), caching is naturally
 * lazy / on-scroll. Drop-in: `const src = useCachedImage(product.image_url)`.
 */
import { useEffect, useState } from 'react';
import { getCachedImage } from '@/lib/imageCache';

export function useCachedImage(url?: string | null): string | undefined {
  const [src, setSrc] = useState<string | undefined>(url ?? undefined);

  useEffect(() => {
    let alive = true;
    if (!url) { setSrc(undefined); return; }
    setSrc(url); // immediate remote render
    getCachedImage(url)
      .then((local) => { if (alive && local) setSrc(local); })
      .catch(() => { /* keep remote */ });
    return () => { alive = false; };
  }, [url]);

  return src;
}
