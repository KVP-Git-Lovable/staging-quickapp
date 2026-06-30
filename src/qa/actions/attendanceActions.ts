import type { QATestAction } from '@/qa/types';
import { skippedAction } from './_skipped';

// Skipped — punch-in/out logic lives inline in src/components/JourneyMap.tsx
// and related hooks. Extract AttendanceService.punchIn/punchOut first.
export const attendanceActions: QATestAction[] = [
  skippedAction('attendance.punch-in', 'Punch In', 'Attendance'),
  skippedAction('attendance.punch-out', 'Punch Out', 'Attendance'),
];
