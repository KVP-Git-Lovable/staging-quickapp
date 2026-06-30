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
      { actionId: 'visit.create' },
      { actionId: 'order.create' },
    ],
  },
];

