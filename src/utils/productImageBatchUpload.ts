/**
 * Bulk-upload product images by filename = SKU.
 * Each file is optimized first, then uploaded to the public `product-images`
 * bucket; the matching product row's `sku_image_url` is updated.
 */
import { supabase } from '@/integrations/supabase/client';
import { optimizeImage } from './imageOptimizer';

const BUCKET = 'product-images';

export interface ImageUploadOutcome {
  file: string;
  sku: string;
  status: 'updated' | 'unmatched' | 'failed';
  url?: string;
  optimizedBytes?: number;
  error?: string;
}

const skuFromFilename = (name: string) => {
  const stem = name.replace(/\.[^.]+$/, '');
  return stem.trim();
};

export async function uploadProductImagesBySku(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImageUploadOutcome[]> {
  // Preload SKU → id map (single pass, paginated).
  const skuToId = new Map<string, string>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, sku')
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) if ((r as any).sku) skuToId.set(String((r as any).sku).toLowerCase(), (r as any).id);
    if (!data || data.length < 1000) break;
    from += 1000;
  }

  const outcomes: ImageUploadOutcome[] = [];
  let done = 0;
  for (const file of files) {
    done++;
    onProgress?.(done, files.length);
    const sku = skuFromFilename(file.name);
    const productId = skuToId.get(sku.toLowerCase());

    if (!productId) {
      outcomes.push({ file: file.name, sku, status: 'unmatched' });
      continue;
    }

    try {
      const optimized = await optimizeImage(file, { maxDim: 1280, quality: 0.8 });
      const path = `products/${sku}.${optimized.ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, optimized.blob, {
          upsert: true,
          contentType: optimized.mime,
          cacheControl: '3600',
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

      const { error: updErr } = await supabase
        .from('products')
        .update({ sku_image_url: publicUrl })
        .eq('id', productId);
      if (updErr) throw updErr;

      outcomes.push({
        file: file.name,
        sku,
        status: 'updated',
        url: publicUrl,
        optimizedBytes: optimized.bytes,
      });
    } catch (e: any) {
      outcomes.push({
        file: file.name,
        sku,
        status: 'failed',
        error: e?.message ?? String(e),
      });
    }
  }

  return outcomes;
}
