import { z } from 'zod';
import { istDate, istTime, objectId } from '@/lib/schemas/common';

export const SESSION_KINDS = ['class', 'review'] as const;
export const SESSION_STATUSES = ['scheduled', 'live', 'ended', 'cancelled'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const ATTENDANCE_MODES = ['manual', 'derived'] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];
export const ATTENDANCE_STATUSES = ['present', 'absent'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export const ATTENDANCE_SOURCES = ['manual', 'derived'] as const;

// 05 §4.3 (A-73): an offering's sessions stay a bounded read.
export const MAX_SESSIONS = 500;
// The lengths the schedule dialog offers; 05 §4.3 allows up to 6 h.
export const LENGTHS_MIN = [30, 45, 60, 90, 120, 180, 240, 300, 360] as const;
// One page of the attendance sheet, and the most one save may change (04 §3 S1).
export const SHEET_PAGE_SIZE = 100;

// --- Scheduling (CRS-04, A-68) ---

const sessionFields = {
  offeringId: objectId,
  title: z.string().trim().min(1, 'Enter a title.').max(160, 'Use at most 160 characters.'),
  date: istDate,
  startTime: istTime,
  lengthMin: z.coerce
    .number({ error: 'Choose a length.' })
    .int('Choose a length.')
    .min(15, 'A class lasts at least 15 minutes.')
    .max(360, 'A class lasts at most 6 hours.'),
  attendanceMode: z.enum(ATTENDANCE_MODES, { error: 'Choose how attendance is taken.' }),
};

export const ScheduleSession = z.object(sessionFields);
export const UpdateSession = z.object({ ...sessionFields, sessionId: objectId });
export const SessionRef = z.object({ offeringId: objectId, sessionId: objectId });
// M03b: hands to lower — the viewer's own, or any for a host ("Lower all" sends everyone's, at most a room's worth).
export const LowerHands = z.object({
  offeringId: objectId,
  sessionId: objectId,
  'identity[]': z.array(objectId).min(1).max(1000),
});

// --- Attendance (ATT-01) ---

const markStatus = z.enum(ATTENDANCE_STATUSES);

// The sheet posts one radio group per student, `status_<studentId>` = present | absent.
export const MarkAttendance = z.looseObject({ offeringId: objectId, sessionId: objectId }).transform((input, ctx) => {
  const marks: { studentId: string; status: AttendanceStatus }[] = [];
  for (const [key, value] of Object.entries(input)) {
    const studentId = /^status_([a-f\d]{24})$/i.exec(key)?.[1];
    if (!studentId) continue;
    const status = markStatus.safeParse(value);
    if (!status.success) {
      ctx.addIssue({ code: 'custom', path: [key], message: 'Choose Present or Absent.' });
      return z.NEVER;
    }
    marks.push({ studentId, status: status.data });
  }
  if (marks.length > SHEET_PAGE_SIZE) {
    ctx.addIssue({ code: 'custom', message: `Save at most ${SHEET_PAGE_SIZE} students at a time.` });
    return z.NEVER;
  }
  return { offeringId: input.offeringId, sessionId: input.sessionId, marks };
});
