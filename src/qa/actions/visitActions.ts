import type { QATestAction } from '@/qa/types';
import { manualStepAction } from './_skipped';

/**
 * Visit creation in this app requires the user to be checked-in
 * (attendance) which itself depends on camera face-match + GPS — both
 * native capabilities that cannot be reliably triggered from inside
 * the WebView via DOM events alone. Per the QA module policy we
 * surface this as a manual step rather than fake the prerequisites.
 *
 * Once a QA-mode bypass for attendance prerequisites is wired into the
 * app screens, this action can be converted to real UI automation
 * using the existing `goTo` / `tap` / `waitForText` primitives.
 */
export const visitActions: QATestAction[] = [
  manualStepAction(
    'visit.create',
    'Create Visit (UI)',
    'Visits',
    'attendance check-in (camera + GPS)',
    'Start Visit on MyVisits is gated by an active attendance session, which requires native camera and GPS — neither is automatable from inside the WebView.',
  ),
];
