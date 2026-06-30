import type { QATestAction } from '@/qa/types';
import { skippedAction } from './_skipped';

// Skipped — visit creation logic lives in src/components/CreateNewVisitModal.tsx
// and the useVisitsData* hooks today. Extract VisitService.create first.
export const visitActions: QATestAction[] = [
  skippedAction('visit.create', 'Create Visit', 'Visits'),
];
