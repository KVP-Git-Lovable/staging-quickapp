import type { ImgHTMLAttributes } from 'react';
import { useCachedImage } from '@/hooks/useCachedImage';

/**
 * Drop-in <img> that caches to device storage and serves offline
 * (Offline Architecture v2 · Phase 8). Lazy by nature: only fetches when mounted,
 * so virtualized lists cache on-scroll. Falls back to the remote URL on web/error.
 *
 *   <CachedImg url={gift.image_url} alt={gift.name} className="..." />
 */
type Props = { url?: string | null } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>;

export function CachedImg({ url, ...imgProps }: Props) {
  const src = useCachedImage(url);
  if (!src) return null;
  return <img src={src} {...imgProps} />;
}
