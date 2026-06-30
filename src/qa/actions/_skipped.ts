import type { QATestAction } from '@/qa/types';

/**
 * Helper to declare a placeholder action whose business logic has
 * not yet been extracted into a service layer. The action shows in
 * the picker (grouped by entity) but is disabled — the runner
 * refuses to execute it and the UI explains why.
 */
export const skippedAction = (
  id: string,
  label: string,
  entity: string,
  reason = 'Logic not yet extracted — uses inline page/hook code today. A dedicated service module is needed before this can be exercised here.',
): QATestAction => ({
  id,
  label,
  entity,
  description: reason,
  inputs: [],
  skipped: true,
  skippedReason: reason,
  run: async () => ({
    pass: false,
    errorMessage: `Action "${id}" is not runnable: ${reason}`,
  }),
});
