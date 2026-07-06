/**
 * Session-scoped "out-of-beat" ordering context.
 * Mirrors the backdate / on-behalf context pattern.
 *
 * When set, Cart.tsx sends the order with:
 *   is_out_of_beat     = true
 *   out_of_beat_reason = ctx.reason
 *   is_planned_beat    = false
 *
 * Server-side sync_order_with_items_v2 enforces the OOB permission,
 * the retailer scope, and the credit rule (owner vs collector).
 * This context is purely UI plumbing carried from picker → Cart.
 */
export type OutOfBeatContext = {
  retailerId: string;
  reason: string;
  gpsLat?: number;
  gpsLng?: number;
};

const KEY = 'out_of_beat_context';

export function getOutOfBeatContext(): OutOfBeatContext | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.retailerId && typeof parsed.retailerId === 'string') {
      return {
        retailerId: parsed.retailerId,
        reason: String(parsed.reason || ''),
        gpsLat: typeof parsed.gpsLat === 'number' ? parsed.gpsLat : undefined,
        gpsLng: typeof parsed.gpsLng === 'number' ? parsed.gpsLng : undefined,
      };
    }
  } catch {}
  return null;
}

export function setOutOfBeatContext(ctx: OutOfBeatContext) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ctx));
  } catch {}
}

export function clearOutOfBeatContext() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}
