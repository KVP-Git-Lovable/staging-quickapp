import type { QATestFlow } from '@/qa/types';

export const allQAFlows: QATestFlow[] = [
  {
    id: 'flow.smoke',
    label: 'Smoke: read + write qa_* tables',
    description:
      'Verifies QA table routing end-to-end: counts retailers, lists products, ' +
      'then creates and deletes a temp retailer and a temp beat plan.',
    stopOnFailure: false,
    steps: [
      { actionId: 'smoke.count-retailers' },
      { actionId: 'smoke.list-products' },
      { actionId: 'smoke.create-temp-retailer' },
      { actionId: 'smoke.create-temp-beat-plan' },
    ],
  },
  {
    id: 'flow.retailer-to-order',
    label: 'Retailer → Beat → Visit → Order',
    description:
      'Creates a retailer on a beat, opens a visit, places an order. ' +
      'Currently not runnable — all underlying actions are skipped pending service extraction.',
    stopOnFailure: true,
    steps: [
      { actionId: 'retailer.create' },
      { actionId: 'retailer.assign-to-beat' },
      { actionId: 'visit.create' },
      { actionId: 'order.create' },
    ],
  },
  {
    id: 'flow.offline-order-lifecycle',
    label: 'Offline order: queue → sync → verify',
    description:
      'End-to-end: with the app forced offline via the in-app ' +
      'manual-offline toggle, the tester places an order; the ' +
      'action confirms it lands in the local sync queue with ' +
      'pending status, then restores network and confirms exactly ' +
      'one matching row appears server-side with no duplicates.',
    stopOnFailure: true,
    steps: [
      { actionId: 'offline.order-queued-locally' },
      { actionId: 'offline.sync-completes-and-clears-queue' },
    ],
  },
];

