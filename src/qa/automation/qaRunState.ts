/**
 * QA-only: tracks whether an automated test run is currently in flight,
 * independent of React component lifecycle.
 *
 * runner.ts navigates back to `/qa/run-tests` between every action/step
 * so the next action starts from a known location. That route used to
 * BE the automated-tests screen; it is now the hub. Without this flag,
 * every in-between navigation would bounce the tester onto the hub and
 * unmount the screen that's driving the run. AutomatedTestsScreen sets
 * this flag for the duration of a run; the hub checks it on mount and
 * passes straight through to /qa/run-tests/automated instead of
 * rendering itself.
 */
let running = false;

export function setQaRunInProgress(value: boolean): void {
  running = value;
}

export function isQaRunInProgress(): boolean {
  return running;
}
