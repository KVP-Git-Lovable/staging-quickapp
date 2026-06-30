import type { QATestAction } from '@/qa/types';

/**
 * Marks an action that genuinely cannot be automated from inside the
 * WebView because it requires a native device capability (camera,
 * GPS permission prompt, native picker, etc.). The action still
 * appears in the picker so it can be triggered, but the runner
 * reports it as "Manual step required" instead of trying to fake it.
 */
export const manualStepAction = (
  id: string,
  label: string,
  entity: string,
  capability: string,
  extra?: string,
): QATestAction => {
  const reason = `Manual step required: ${capability}${extra ? ` — ${extra}` : ''}`;
  return {
    id,
    label,
    entity,
    description: reason,
    inputs: [],
    skipped: true,
    skippedReason: reason,
    run: async () => ({
      pass: false,
      errorMessage: reason,
    }),
  };
};

/**
 * @deprecated Retained only for back-compat with any older registrations.
 * New actions should either be real UI automation or use `manualStepAction`.
 */
export const skippedAction = manualStepAction;
