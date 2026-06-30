import type { QATestAction } from '@/qa/types';
import { manualStepAction } from './_skipped';

/**
 * Order creation in this app starts from inside an active retailer
 * Visit. Visit start in turn requires an active attendance session
 * (camera face-match + GPS). Both attendance prerequisites are native
 * capabilities that cannot be triggered from inside the WebView via
 * DOM events alone, so we surface this as a manual step rather than
 * fake the prerequisites.
 *
 * Once a QA-mode bypass for attendance + visit prerequisites is wired
 * in, this action can be converted to real UI automation that drives
 * the order entry screen and verifies qa_orders / qa_order_items.
 */
export const orderActions: QATestAction[] = [
  manualStepAction(
    'order.create',
    'Create Order (UI)',
    'Orders',
    'attendance + visit prerequisites',
    'Order entry is reached from inside a Visit, which requires attendance check-in (camera + GPS) — neither is automatable from inside the WebView.',
  ),
];
