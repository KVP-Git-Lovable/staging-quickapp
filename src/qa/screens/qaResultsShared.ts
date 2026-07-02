/**
 * QA-only: shared types + helpers for the automated-test results views.
 * Used by both AutomatedTestsScreen (live/just-finished run) and
 * TestResultsScreen (most-recent run + full history).
 */

export interface ResultRow {
  label: string;
  pass: boolean;
  durationMs: number;
  errorMessage?: string;
  manual?: boolean;
}

export interface QARunRow {
  id: string;
  run_id: string;
  build_type: string | null;
  overall_status: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_tests: number | null;
  passed_tests: number | null;
  failed_tests: number | null;
  notes: string | null;
}

export interface QALogRow {
  id: string;
  test_run_id: string;
  test_name: string | null;
  module_name: string | null;
  status: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  metadata_json: any;
}

export interface QACustomTestStep {
  step: string;
  outcome: string;
}

export interface QACustomTestRow {
  id: string;
  prompt: string;
  page_context: string | null;
  created_at: string;
  run_at: string | null;
  status: string;
  ai_plan: string | null;
  ai_result: string | null;
  steps_taken: QACustomTestStep[] | null;
  pass: boolean | null;
  error_message: string | null;
  created_by: string | null;
  test_run_id: string | null;
}

// Runs older than 5 min still 'running' are almost certainly crashed —
// present them as failed so the UI never gets stuck.
const STUCK_MS = 5 * 60 * 1000;

export const displayStatus = (run: QARunRow): string => {
  if (
    run.overall_status === 'running' &&
    run.started_at &&
    Date.now() - new Date(run.started_at).getTime() > STUCK_MS
  ) {
    return 'failed';
  }
  return run.overall_status ?? 'unknown';
};

export const fmtDuration = (start?: string | null, end?: string | null): string => {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

export const logsToRows = (logs: QALogRow[]): ResultRow[] =>
  logs.map((l) => {
    const started = l.started_at ? new Date(l.started_at).getTime() : 0;
    const completed = l.completed_at ? new Date(l.completed_at).getTime() : 0;
    const metaMs = Number(l?.metadata_json?.durationMs);
    const dur = Number.isFinite(metaMs)
      ? metaMs
      : Math.max(0, completed - started);
    return {
      label: l.test_name ?? '(unnamed)',
      pass: l.status === 'passed',
      durationMs: dur,
      errorMessage: l.error_message ?? undefined,
    };
  });
