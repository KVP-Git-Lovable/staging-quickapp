import { customerPortalSupabase } from '@/integrations/supabase/portal-client';

const DUPLICATE_CART_ENTRY_CODE = '23505';

export interface CartInsertItem {
  retailer_id: string;
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  unit: string;
  source: 'manual' | 'voice' | 'photo';
}

interface ExistingCartRow {
  id: string;
  quantity: number;
  unit: string | null;
}

function normalizeCartItems(items: CartInsertItem[]): CartInsertItem[] {
  const merged = new Map<string, CartInsertItem>();

  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!item.retailer_id || !item.product_id || !Number.isFinite(quantity) || quantity <= 0) continue;

    const key = `${item.retailer_id}::${item.product_id}`;
    const existing = merged.get(key);

    if (existing) {
      existing.quantity += quantity;
      existing.unit = item.unit || existing.unit;
      existing.variant_id = item.variant_id ?? existing.variant_id;
      existing.source = item.source;
    } else {
      merged.set(key, {
        ...item,
        quantity,
      });
    }
  }

  return Array.from(merged.values());
}

async function getExistingCartRow(retailerId: string, productId: string): Promise<ExistingCartRow | null> {
  const { data, error } = await customerPortalSupabase
    .from('customer_portal_cart')
    .select('id, quantity, unit')
    .eq('retailer_id', retailerId)
    .eq('product_id', productId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    quantity: Number(data.quantity || 0),
    unit: data.unit,
  };
}

async function updateCartRow(id: string, quantity: number, unit: string) {
  const { error } = await customerPortalSupabase
    .from('customer_portal_cart')
    .update({ quantity, unit })
    .eq('id', id);

  if (error) throw error;
}

async function insertCartRow(item: CartInsertItem) {
  const { error } = await customerPortalSupabase.from('customer_portal_cart').insert(item);
  return error;
}

/**
 * Upsert items into customer_portal_cart.
 * Duplicate products are merged first, then each item is safely inserted/updated.
 */
export async function upsertCartItems(items: CartInsertItem[]): Promise<{ success: number; failed: number }> {
  const normalizedItems = normalizeCartItems(items);
  if (normalizedItems.length === 0) return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;

  for (const item of normalizedItems) {
    try {
      const added = await upsertSingleCartItem(item);
      if (added) success++;
      else failed++;
    } catch (error) {
      console.error('Cart upsert error:', error);
      failed++;
    }
  }

  return { success, failed };
}

/**
 * Upsert a single item into the cart.
 */
export async function upsertSingleCartItem(item: CartInsertItem): Promise<boolean> {
  const normalizedItem = normalizeCartItems([item])[0];
  if (!normalizedItem) return false;

  let existing = await getExistingCartRow(normalizedItem.retailer_id, normalizedItem.product_id);

  if (existing) {
    await updateCartRow(
      existing.id,
      existing.quantity + normalizedItem.quantity,
      normalizedItem.unit,
    );
    return true;
  }

  const insertError = await insertCartRow(normalizedItem);
  if (!insertError) return true;
  if (insertError.code !== DUPLICATE_CART_ENTRY_CODE) throw insertError;

  existing = await getExistingCartRow(normalizedItem.retailer_id, normalizedItem.product_id);
  if (!existing) throw insertError;

  await updateCartRow(
    existing.id,
    existing.quantity + normalizedItem.quantity,
    normalizedItem.unit,
  );

  return true;
}

/**
 * Ensure the cart has at least the requested quantity for a product.
 */
export async function ensureMinimumCartQuantity(item: CartInsertItem): Promise<{ quantity: number; existed: boolean; changed: boolean }> {
  const normalizedItem = normalizeCartItems([item])[0];
  if (!normalizedItem) return { quantity: 0, existed: false, changed: false };

  let existing = await getExistingCartRow(normalizedItem.retailer_id, normalizedItem.product_id);

  if (existing) {
    const nextQuantity = Math.max(existing.quantity, normalizedItem.quantity);
    const hasChanged = nextQuantity !== existing.quantity || existing.unit !== normalizedItem.unit;

    if (hasChanged) {
      await updateCartRow(existing.id, nextQuantity, normalizedItem.unit);
    }

    return { quantity: nextQuantity, existed: true, changed: hasChanged };
  }

  const insertError = await insertCartRow(normalizedItem);
  if (!insertError) {
    return { quantity: normalizedItem.quantity, existed: false, changed: true };
  }
  if (insertError.code !== DUPLICATE_CART_ENTRY_CODE) throw insertError;

  existing = await getExistingCartRow(normalizedItem.retailer_id, normalizedItem.product_id);
  if (!existing) throw insertError;

  const nextQuantity = Math.max(existing.quantity, normalizedItem.quantity);
  const hasChanged = nextQuantity !== existing.quantity || existing.unit !== normalizedItem.unit;

  if (hasChanged) {
    await updateCartRow(existing.id, nextQuantity, normalizedItem.unit);
  }

  return { quantity: nextQuantity, existed: true, changed: hasChanged };
}
