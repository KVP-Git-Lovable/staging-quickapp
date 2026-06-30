import type { QATestAction } from '@/qa/types';
import { manualStepAction } from './_skipped';

/**
 * Attendance punch-in / punch-out in this app requires a live camera
 * photo (face-match) and a GPS fix with permission grant. Both are
 * native device capabilities that cannot be reliably triggered from
 * inside the WebView by dispatching DOM events alone — a faked path
 * would not exercise the same code real users hit. Per QA policy we
 * surface these as manual steps rather than fake them.
 */
export const attendanceActions: QATestAction[] = [
  manualStepAction(
    'attendance.punch_in',
    'Attendance — Punch In',
    'Attendance',
    'camera + GPS',
    'Start My Day on Attendance requires a live face-match photo and a GPS fix; neither can be supplied from inside the WebView.',
  ),
  manualStepAction(
    'attendance.punch_out',
    'Attendance — Punch Out',
    'Attendance',
    'camera + GPS',
    'End My Day on Attendance requires a live face-match photo and a GPS fix; neither can be supplied from inside the WebView.',
  ),
];
