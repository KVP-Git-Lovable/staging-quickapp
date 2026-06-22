/**
 * Phase 2a — Order Edit gating helper.
 *
 * Pure function. Does not touch the DB. Phase 2b will wire this into the UI
 * (e.g. enabling/disabling an "Edit Order" button and short-circuiting the
 * edit flow on the server).
 */

export interface OrderLike {
  status?: string | null;
  dispatched_at?: string | null;
  invoice_generated_at?: string | null;
}

export interface OrderEditPolicy {
  edit_enabled: boolean;
  editable_until: 'invoice_generated' | string;
}

export interface UserPermissionsLike {
  /** Map of permission_name -> boolean (e.g. has can_edit on the action). */
  [key: string]: boolean | undefined;
}

export interface CanEditOrderResult {
  allowed: boolean;
  reason: string;
}

const REASON_NO_PERMISSION = "You don't have permission to edit orders.";
const REASON_DISPATCHED =
  'This order can no longer be edited because it has been dispatched.';
const REASON_INVOICE_GENERATED =
  'This order can no longer be edited because its invoice has been generated.';
const REASON_INVALID_STATE = "This order can't be edited in its current state.";
const REASON_DISABLED_BY_POLICY = 'Order editing is currently disabled by your administrator.';

/**
 * Returns whether the given user can edit the given order under the given policy.
 *
 * Rules (in order):
 *   1. user must have `action_order_edit`
 *   2. policy.edit_enabled must be true
 *   3. order.status must not be 'cancelled' or 'delivered'
 *   4. Edit window — keyed by policy.editable_until:
 *        - 'dispatched' (default): editable until the order is dispatched.
 *          A persisted invoice row does NOT block edits — only dispatched_at does.
 *        - 'invoice_generated' (legacy): editable until invoice_generated_at or dispatch.
 */
export function canEditOrder(
  order: OrderLike | null | undefined,
  userPermissions: UserPermissionsLike | null | undefined,
  policy: OrderEditPolicy | null | undefined,
): CanEditOrderResult {
  if (!order) {
    return { allowed: false, reason: REASON_INVALID_STATE };
  }

  if (!userPermissions || !userPermissions.action_order_edit) {
    return { allowed: false, reason: REASON_NO_PERMISSION };
  }

  if (policy && policy.edit_enabled === false) {
    return { allowed: false, reason: REASON_DISABLED_BY_POLICY };
  }

  const status = (order.status ?? '').toLowerCase();
  if (status === 'cancelled' || status === 'delivered') {
    return { allowed: false, reason: REASON_INVALID_STATE };
  }

  // Default editable window: BEFORE dispatch (persisted invoice rows no longer block).
  const editableUntil = policy?.editable_until ?? 'dispatched';

  if (editableUntil === 'dispatched') {
    if (order.dispatched_at) {
      return { allowed: false, reason: REASON_DISPATCHED };
    }
  } else if (editableUntil === 'invoice_generated') {
    if (order.invoice_generated_at || order.dispatched_at) {
      return { allowed: false, reason: REASON_INVOICE_GENERATED };
    }
  }

  return { allowed: true, reason: '' };
}

export const ORDER_EDIT_REASONS = {
  NO_PERMISSION: REASON_NO_PERMISSION,
  DISPATCHED: REASON_DISPATCHED,
  INVOICE_GENERATED: REASON_INVOICE_GENERATED,
  INVALID_STATE: REASON_INVALID_STATE,
  DISABLED_BY_POLICY: REASON_DISABLED_BY_POLICY,
} as const;
