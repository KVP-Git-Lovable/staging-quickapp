import type { QATestAction } from '@/qa/types';
import { skippedAction } from './_skipped';

// Skipped — retailer create/delete logic currently lives inline in
// src/pages/AddRetailer.tsx and src/components/AddRetailerInlineToBeat.tsx
// (plus the offline IndexedDB queue). A future pass will extract a
// RetailerService.create/delete before wiring these up.
export const retailerActions: QATestAction[] = [
  skippedAction('retailer.create', 'Create Retailer', 'Retailers'),
  skippedAction('retailer.delete', 'Delete Retailer', 'Retailers'),
];
