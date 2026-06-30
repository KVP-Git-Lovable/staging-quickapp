import type { QATestAction } from '@/qa/types';
import { skippedAction } from './_skipped';

// Skipped — order creation logic lives in useOfflineOrderEntry / useOfflineOrderComplete
// plus the sync_order_with_items_v2 RPC path. Extract OrderService.create first.
export const orderActions: QATestAction[] = [
  skippedAction('order.create', 'Create Order', 'Orders'),
];
