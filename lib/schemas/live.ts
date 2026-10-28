import { z } from 'zod';
import { istDate, istTime, objectId } from '@/lib/schemas/common';

// M03c T4: a meeting is a live session without a course; its hosts, members and guests are on the session.
export const SESSION_KINDS = ['class', 'review', 'meeting'] as const;
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

// --- Host controls (M03c T2) ---

// What students may do in the room until a host turns it off: share their screen, turn on their microphone, send chat
// messages and reactions. Hosts are never limited.
export const STUDENT_RIGHTS = ['share', 'unmute', 'chat'] as const;
export type StudentRight = (typeof STUDENT_RIGHTS)[number];
export const ALL_RIGHTS: Record<StudentRight, boolean> = { share: true, unmute: true, chat: true };
// 05 §4.3: the removed list stays a bounded read.
export const MAX_REMOVED = 100;
// M03c T5: a recording is `recording` while it runs, then `saved` (its file is in the bucket) or `failed`.
export const RECORDING_STATUSES = ['recording', 'saved', 'failed'] as const;
export const MAX_RECORDINGS = 20;

// --- The room (M03c T4): its actions take the session alone; who may do what comes from the session (a class's course,
// a meeting's hosts and members). A person in the room is their user id, or a guest's id. ---

export const RoomRef = z.object({ sessionId: objectId });
export const RoomPerson = z.object({ sessionId: objectId, identity: objectId });
// Hands to lower (the viewer's own, or any for a host: "Lower all" sends everyone's), guests to let in (M03b, T4).
export const RoomPeople = z.object({ sessionId: objectId, 'identity[]': z.array(objectId).min(1).max(1000) });
export const RoomRight = z.object({ sessionId: objectId, right: z.enum(STUDENT_RIGHTS), allowed: z.boolean() });

// --- Polls (M03c T6): a host asks, the people taking part answer once and may change it while the poll is open. ---

export const POLL_LIMITS = { polls: 20, options: 6, question: 200, option: 120 } as const;
export const POLL_STATUSES = ['open', 'ended'] as const;

export const CreatePoll = z.object({
  sessionId: objectId,
  question: z.string().trim().min(1, 'Ask a question.').max(POLL_LIMITS.question, 'Use at most 200 characters.'),
  'option[]': z
    .array(z.string().trim().max(POLL_LIMITS.option, 'Use at most 120 characters an option.'))
    .transform((options) => [...new Set(options.filter(Boolean))])
    .pipe(
      z
        .array(z.string())
        .min(2, 'Give at least two different options.')
        .max(POLL_LIMITS.options, `Give at most ${POLL_LIMITS.options} options.`),
    ),
  // Students see the results when the poll ends (a host may also show them earlier).
  showResults: z.boolean().default(true),
});
export const PollRef = z.object({ sessionId: objectId, pollId: objectId });
export const AnswerPoll = z.object({ sessionId: objectId, pollId: objectId, optionId: objectId });

// --- Breakout rooms (M03c T7): a host splits the people taking part into 2–20 rooms for a while. ---

export const BREAKOUT_LIMITS = { rooms: 20, limitMin: 120, message: 300 } as const;
// Everyone returns this long after a host closes the rooms (as in Google Meet).
export const BREAKOUT_CLOSING_MS = 60_000;

// The setup posts who goes where as `<identity>:<room>`; a time limit of 0 keeps the rooms open until a host closes them.
export const OpenBreakouts = z.object({
  sessionId: objectId,
  rooms: z.coerce
    .number()
    .int()
    .min(2, 'Make at least two rooms.')
    .max(BREAKOUT_LIMITS.rooms, 'Make at most 20 rooms.'),
  limitMin: z.coerce.number().int().min(0).max(BREAKOUT_LIMITS.limitMin, 'Keep them open at most 2 hours.'),
  'assign[]': z
    .array(z.string().regex(/^[a-f\d]{24}:\d{1,2}$/, 'Invalid assignment'))
    .min(1, 'Nobody is in the room to send to a breakout room.')
    .max(1000),
});
export const BreakoutMessage = z.object({
  sessionId: objectId,
  text: z.string().trim().min(1, 'Write a message.').max(BREAKOUT_LIMITS.message, 'Use at most 300 characters.'),
});
// The room to connect to: 0 is the class or meeting itself, 1–20 a breakout room.
export const RoomTokenRef = z.object({ sessionId: objectId, room: z.number().int().min(0).max(BREAKOUT_LIMITS.rooms) });
export const breakoutRoomName = (roomName: string, room: number) => (room === 0 ? roomName : `${roomName}-b${room}`);

// --- The whiteboard (M03c T8): a host opens it on the stage and lets the others draw, or only watch. ---

export const OpenBoard = z.object({ sessionId: objectId, studentsDraw: z.boolean().default(false) });
// T16 (decision 11): the name of the video a presenter's browser sends of the board while the room is recorded.
export const BOARD_TRACK = 'whiteboard';
export const BoardDrawing = z.object({ sessionId: objectId, allowed: z.boolean() });

// --- Meetings (M03c T4) ---

// 05 §4.3: the scheduler and up to four co-hosts; members picked from the LMS; guests by email.
export const MEETING_LIMITS = { coHosts: 4, members: 50, guests: 20, lengthMin: 360 } as const;

const guestEmails = z
  .string()
  .max(5000)
  .default('')
  .transform((value) => [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ])
  .pipe(
    z
      .array(z.email('One of these is not an email address.'))
      .max(MEETING_LIMITS.guests, `Invite at most ${MEETING_LIMITS.guests} guests.`),
  );

// The dialog posts a day, a start and an end (IST, the same day), and the people as hidden `coHost[]` and `member[]`.
export const SaveMeeting = z
  .object({
    meetingId: objectId.optional(),
    title: z.string().trim().min(1, 'Enter a title.').max(160, 'Use at most 160 characters.'),
    date: istDate,
    startTime: istTime,
    endTime: istTime,
    'coHost[]': z
      .array(objectId)
      .max(MEETING_LIMITS.coHosts, `Add at most ${MEETING_LIMITS.coHosts} co-hosts.`)
      .default([]),
    'member[]': z
      .array(objectId)
      .max(MEETING_LIMITS.members, `Invite at most ${MEETING_LIMITS.members} people from the LMS.`)
      .default([]),
    guests: guestEmails,
    // T14: what is still in the people box when the form is sent, added as Enter would add it.
    typed: z.string().trim().max(2000).default(''),
  })
  .refine((m) => m.endTime > m.startTime, { path: ['endTime'], message: 'End after the start.' });
export const MeetingRef = z.object({ meetingId: objectId });
// The people picker's search: an email or roll number, or words of a name; among everyone the viewer may invite, staff
// only (co-hosts), or faculty only (an offering's faculty).
export const PEOPLE_SCOPES = ['all', 'staff', 'faculty'] as const;
export const FindPeople = z.object({
  q: z.string().trim().min(2, 'Type at least two letters.').max(80),
  scope: z.enum(PEOPLE_SCOPES).default('all'),
});
// A pasted list of emails and roll numbers, matched exactly (the meeting's people field).
export const MatchPeople = z.object({
  keys: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
});

// A personal meeting link (lib/auth/meeting-link.ts): a guest's id, or the meeting's and a member's, and the signature.
export const meetingLink = z
  .string()
  .regex(/^[a-f\d]{24}(\.[a-f\d]{24})?\.[A-Za-z\d_-]{43}$/, 'This link is not valid.');
// T14 (decision 9): joining by that link without signing in. A guest gives their name; a member joins under their own.
// Meetings scheduled before passcodes ask for none (A-220), so the box may be absent.
export const JoinMeeting = z.object({
  token: meetingLink,
  name: z.string().trim().max(80, 'Use at most 80 characters.').default(''),
  passcode: z.string().trim().max(20).default(''),
});
// A host sends one person's invitation again: a member's or co-host's account, or a guest.
export const ResendInvitation = z.object({ meetingId: objectId, personId: objectId });

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
