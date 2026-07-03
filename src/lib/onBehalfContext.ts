/**
 * Session-scoped "on-behalf" ordering context.
 * Mirrors the backdate context pattern used in MyVisits + Cart.
 *
 * When set, Cart.tsx sends the order with:
 *   user_id           = ctx.userId   (credited user / owner)
 *   placed_by_user_id = auth.uid()   (actual enterer)
 *
 * Server-side sync_order_with_items_v2 enforces the on-behalf permission
 * + team-scope check; this context is purely UI plumbing.
 */
export type OnBehalfContext = { userId: string; name: string };

const KEY = 'on_behalf_context';

export function getOnBehalfContext(): OnBehalfContext | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.userId && typeof parsed.userId === 'string') {
      return { userId: parsed.userId, name: String(parsed.name || '') };
    }
  } catch {}
  return null;
}

export function setOnBehalfContext(ctx: OnBehalfContext) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ctx));
  } catch {}
}

export function clearOnBehalfContext() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}
