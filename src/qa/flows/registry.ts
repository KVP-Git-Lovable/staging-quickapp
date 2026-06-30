import type { QATestFlow } from '@/qa/types';

export const allQAFlows: QATestFlow[] = [
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
