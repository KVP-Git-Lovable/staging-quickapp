/**
 * Shared image optimizer used by SKU image upload, product image fields,
 * invoice logo/asset uploads, etc.
 *
 * - Resizes longest side to maxDim (default 1280).
 * - Strips EXIF (re-encodes via canvas).
 * - Encodes to WebP at ~0.8 quality; falls back to JPEG if WebP isn't supported.
 * - Skips re-encoding if the source is already small and a non-HEIC raster.
 */
export interface OptimizeImageOptions {
  maxDim?: number;        // longest side cap (px)
  quality?: number;       // 0..1
  targetBytes?: number;   // best-effort soft cap
  preferWebp?: boolean;   // default true
}

export interface OptimizedImage {
  blob: Blob;
  ext: 'webp' | 'jpg' | string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  skipped: boolean;
}

const DEFAULTS = {
  maxDim: 1280,
  quality: 0.8,
  targetBytes: 200 * 1024,
  preferWebp: true,
};

function canEncodeWebp(): boolean {
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    return c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

function extFromMime(mime: string): string {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  return (mime.split('/')[1] || 'bin').toLowerCase();
}

async function loadImage(input: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(input);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not decode image'));
      i.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function optimizeImage(
  file: File | Blob,
  opts: OptimizeImageOptions = {},
): Promise<OptimizedImage> {
  const o = { ...DEFAULTS, ...opts };
  const inputType = (file as File).type || 'application/octet-stream';

  // Cheap skip: already small + safe raster + no resize needed.
  if (
    file.size <= o.targetBytes &&
    /^image\/(jpeg|png|webp)$/.test(inputType)
  ) {
    // We still want to verify dimensions cheaply; if it's small, just pass through.
    return {
      blob: file,
      ext: extFromMime(inputType),
      mime: inputType,
      width: 0,
      height: 0,
      bytes: file.size,
      skipped: true,
    };
  }

  const img = await loadImage(file);
  let { width, height } = img;
  const longest = Math.max(width, height);
  if (longest > o.maxDim) {
    const scale = o.maxDim / longest;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.drawImage(img, 0, 0, width, height);

  const useWebp = o.preferWebp && canEncodeWebp();
  let mime = useWebp ? 'image/webp' : 'image/jpeg';
  let quality = o.quality;

  const encode = (m: string, q: number): Promise<Blob> =>
    new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Encode failed'))),
        m,
        q,
      ),
    );

  let blob = await encode(mime, quality);

  // Soft-target: step quality down to ~0.5 to try to land under targetBytes.
  while (blob.size > o.targetBytes && quality > 0.5) {
    quality = Math.max(0.5, +(quality - 0.1).toFixed(2));
    blob = await encode(mime, quality);
  }

  return {
    blob,
    ext: extFromMime(mime),
    mime,
    width,
    height,
    bytes: blob.size,
    skipped: false,
  };
}
