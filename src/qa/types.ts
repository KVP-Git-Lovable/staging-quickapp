export interface QATestContext {
  runId: string;
  memory: Record<string, any>;
  remember: (key: string, value: any) => void;
  recall: (key: string) => any;
}

export interface QATestInputField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  default?: any;
  /**
   * Auto-fills from a previous step's remembered output using dot
   * notation, e.g. 'retailer.id'. Still editable when the action
   * is run standalone (not part of a flow).
   */
  fromContext?: string;
}

export interface QATestStepResult {
  pass: boolean;
  output?: any;
  errorMessage?: string;
  durationMs: number;
}

export interface QATestAction {
  id: string;
  label: string;
  entity: string;
  description?: string;
  inputs: QATestInputField[];
  run: (
    input: Record<string, any>,
    ctx: QATestContext,
  ) => Promise<{ pass: boolean; output?: any; errorMessage?: string }>;
  /**
   * When true, the UI must render the action as disabled and show
   * `skippedReason`. The runner refuses to execute it.
   */
  skipped?: boolean;
  skippedReason?: string;
}

export interface QATestFlowStep {
  actionId: string;
  input?: Record<string, any>;
}

export interface QATestFlow {
  id: string;
  label: string;
  description?: string;
  steps: QATestFlowStep[];
  stopOnFailure?: boolean;
}
