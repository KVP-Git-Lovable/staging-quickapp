/**
 * QA-only navigation bridge. Lets QA actions move between routes using
 * the app's existing react-router instance rather than full page loads.
 *
 * QA-build-only. Must not be imported from production code paths.
 */
import type { NavigateFunction } from 'react-router-dom';

let navigateRef: NavigateFunction | null = null;

export function registerNavigator(fn: NavigateFunction): void {
  navigateRef = fn;
}

export async function goTo(path: string): Promise<void> {
  if (!navigateRef) {
    throw new Error(
      'QA navigator not registered — registerNavigator() must be called at the app root (QA mode only).',
    );
  }
  navigateRef(path);
  // brief settle for route transition + first render
  await new Promise((resolve) => setTimeout(resolve, 250));
}

export function isNavigatorReady(): boolean {
  return navigateRef !== null;
}
