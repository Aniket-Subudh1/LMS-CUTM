import 'server-only';
import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { offeringAccess } from '@/lib/auth/access';
import { requireViewer, type Viewer } from '@/lib/auth/session';
import { getSettings } from '@/lib/data/settings';
import { db } from '@/lib/db';
import { attendancePct, deriveAttendance } from '@/lib/domain/attendance';
import { istDateToDate, istDayKey } from '@/lib/domain/time';
import { joinToken } from '@/lib/integrations/live';
import { Attendance } from '@/lib/models/attendance';
import { Enrollment } from '@/lib/models/enrollment';
import { LiveSession, type LiveSessionDoc } from '@/lib/models/live-session';
import { Offering } from '@/lib/models/offering';
import { User } from '@/lib/models/user';
import { pageSize } from '@/lib/schemas/common';
import { SHEET_PAGE_SIZE, type AttendanceMode, type AttendanceStatus, type SessionStatus } from '@/lib/schemas/live';

const MINUTE_MS = 60_000;
// T3: a class can be started from 15 minutes before its start time.
export const START_EARLY_MS = 15 * MINUTE_MS;

// What the page shows: `not_held` is a scheduled class whose end passed without a start (A-71).
export type SessionState = 'upcoming' | 'live' | 'ended' | 'cancelled' | 'not_held';

export type LiveSessionRow = {
  id: string;
  title: string;
  status: SessionStatus;
  state: SessionState;
  attendanceMode: AttendanceMode;
  scheduledStart: Date;
  scheduledEnd: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  finalized: boolean;
};

// A student's own result for one class: no status while it runs or until it is finalized.
export type MyAttendance = { status: AttendanceStatus | null; presenceSec: number; focusedSec: number };

type SessionDoc = Pick<
  LiveSessionDoc,
  'title' | 'status' | 'attendanceMode' | 'scheduledStart' | 'scheduledEnd' | 'startedAt' | 'endedAt' | 'finalizedAt'
> & { _id: Types.ObjectId };

const SESSION_FIELDS = {
  title: 1,
  status: 1,
  attendanceMode: 1,
  scheduledStart: 1,
  scheduledEnd: 1,
  startedAt: 1,
  endedAt: 1,
  finalizedAt: 1,
} as const;

function toRow(doc: SessionDoc, now: Date): LiveSessionRow {
  const notHeld = doc.status === 'scheduled' && doc.scheduledEnd < now;
  return {
    id: String(doc._id),
    title: doc.title,
    status: doc.status,
    state: notHeld ? 'not_held' : doc.status === 'scheduled' ? 'upcoming' : doc.status,
    attendanceMode: doc.attendanceMode,
    scheduledStart: doc.scheduledStart,
    scheduledEnd: doc.scheduledEnd,
    startedAt: doc.startedAt ?? null,
    endedAt: doc.endedAt ?? null,
    finalized: Boolean(doc.finalizedAt),
  };
}

type View = 'teacher' | 'student' | 'oversee';

// 09 §2: the offering's faculty teach and join as host; admins manage every class and may join any of them as host
// (Aniket, 17 Oct 2026); HoDs only look. Attendance counts enrolled students only, so a host's time in the room is not
// recorded.
async function liveAccess(viewer: Viewer, offeringId: string) {
  const access = await offeringAccess(viewer, offeringId);
  const offering = await Offering.findById(offeringId, { title: 1, category: 1, facultyIds: 1, calendar: 1 }).lean();
  if (!offering) notFound();
  const view: View = access === 'learn' ? 'student' : access === 'teach' ? 'teacher' : 'oversee';
  return {
    offering,
    view,
    canManage: access === 'teach' || viewer.roles.includes('admin'),
    hosts: viewer.roles.includes('admin') || offering.facultyIds.some((id) => id.equals(viewer.id)),
  };
}

// An open connection to the room right now (05 §4.4).
const IN_CLASS = { presence: { $elemMatch: { leftAt: null } } };

export type PastSession = LiveSessionRow & {
  present: number;
  recorded: number;
  manual: number;
  mine: MyAttendance | null;
};

export type SessionList = {
  view: View;
  canManage: boolean;
  category: 'ugc' | 'skill';
  live: (LiveSessionRow & { inClass: number })[];
  // M03b T6: scheduled classes still ahead and cancelled ones whose time is still ahead (they can be restored), a page
  // of them at a time.
  upcoming: LiveSessionRow[];
  upcomingTotal: number;
  past: PastSession[];
  total: number;
  // Classes that ran, for the attendance chart's tiles.
  held: number;
  enrolled: number;
  // The student's own live-class attendance over finalized classes (A-72).
  mine: { attended: number; held: number; pct: number | null } | null;
  // A-68: the next course-calendar session on or after today, to prefill "Schedule a class".
  next: { title: string; day: string } | null;
  thresholdPct: number;
};

// T3, T9: the Live tab — live now, upcoming, and past classes with their attendance. Both lists page (index
// offeringId, scheduledStart).
export async function listSessions(offeringId: string, page: number, upcomingPage = 1): Promise<SessionList> {
  const viewer = await requireViewer();
  const { offering, view, canManage } = await liveAccess(viewer, offeringId);
  const now = new Date();
  const notOver = ['scheduled', 'cancelled'] satisfies SessionStatus[];
  const upcomingFilter = { offeringId, status: { $in: notOver }, scheduledEnd: { $gte: now } };
  const pastFilter = {
    offeringId,
    $or: [{ status: 'ended' as const }, { status: { $in: notOver }, scheduledEnd: { $lt: now } }],
  };
  const [live, upcoming, upcomingTotal, past, total, held, enrolled, { liveThresholdPct }] = await Promise.all([
    LiveSession.find({ offeringId, status: 'live' }, SESSION_FIELDS).sort({ scheduledStart: 1 }).limit(10).lean(),
    LiveSession.find(upcomingFilter, SESSION_FIELDS)
      .sort({ scheduledStart: 1 })
      .skip((upcomingPage - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    LiveSession.countDocuments(upcomingFilter),
    LiveSession.find(pastFilter, SESSION_FIELDS)
      .sort({ scheduledStart: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    LiveSession.countDocuments(pastFilter),
    LiveSession.countDocuments({ offeringId, status: 'ended' }),
    Enrollment.countDocuments({ offeringId, status: 'active' }),
    getSettings('attendance'),
  ]);
  const pastIds = past.map((doc) => doc._id);
  const student = view === 'student';
  const [counts, mineRows, inClass, overall] = await Promise.all([
    student
      ? []
      : Attendance.aggregate<{ _id: Types.ObjectId; present: number; recorded: number; manual: number }>([
          { $match: { sessionId: { $in: pastIds } } },
          {
            $group: {
              _id: '$sessionId',
              present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
              recorded: { $sum: { $cond: [{ $in: ['$status', ['present', 'absent']] }, 1, 0] } },
              manual: { $sum: { $cond: [{ $eq: ['$source', 'manual'] }, 1, 0] } },
            },
          },
        ]),
    student
      ? Attendance.find(
          { sessionId: { $in: pastIds }, studentId: viewer.id },
          { sessionId: 1, status: 1, presenceSec: 1, focusedSec: 1 },
        ).lean()
      : [],
    student ? [] : Promise.all(live.map((doc) => Attendance.countDocuments({ sessionId: doc._id, ...IN_CLASS }))),
    student
      ? Attendance.aggregate<{ attended: number; held: number }>([
          { $match: { offeringId: new Types.ObjectId(offeringId), studentId: new Types.ObjectId(viewer.id) } },
          { $match: { status: { $in: ['present', 'absent'] } } },
          {
            $group: {
              _id: null,
              attended: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
              held: { $sum: 1 },
            },
          },
        ])
      : [],
  ]);
  const countOf = new Map(counts.map((row) => [String(row._id), row]));
  const mineOf = new Map(mineRows.map((row) => [String(row.sessionId), row]));
  const today = istDateToDate(istDayKey(now));
  const nextSession = canManage ? offering.calendar.find((row) => row.date >= today) : undefined;
  const { attended = 0, held: mineHeld = 0 } = overall[0] ?? {};
  return {
    view,
    canManage,
    category: offering.category,
    live: live.map((doc, i) => ({ ...toRow(doc, now), inClass: inClass[i] ?? 0 })),
    upcoming: upcoming.map((doc) => toRow(doc, now)),
    upcomingTotal,
    past: past.map((doc) => {
      const count = countOf.get(String(doc._id));
      const mine = mineOf.get(String(doc._id));
      return {
        ...toRow(doc, now),
        present: count?.present ?? 0,
        recorded: count?.recorded ?? 0,
        manual: count?.manual ?? 0,
        mine: student
          ? { status: mine?.status ?? null, presenceSec: mine?.presenceSec ?? 0, focusedSec: mine?.focusedSec ?? 0 }
          : null,
      };
    }),
    total,
    held,
    enrolled,
    mine: student ? { attended, held: mineHeld, pct: attendancePct(attended, mineHeld) } : null,
    next: nextSession ? { title: nextSession.topic, day: istDayKey(nextSession.date) } : null,
    thresholdPct: liveThresholdPct,
  };
}

export type SessionDetail = {
  view: View;
  canManage: boolean;
  category: 'ugc' | 'skill';
  // The room page's top bar names the course (M03b).
  offeringTitle: string;
  session: LiveSessionRow;
  canStartAt: Date;
  // A join token for the faculty (host) and enrolled students while the class is live (T4).
  join: { serverUrl: string; token: string } | null;
  inClass: number;
  enrolled: number;
  // Staff, once the class has started.
  summary: { present: number; absent: number; manual: number; avgPresenceSec: number; avgFocusedSec: number } | null;
  mine: MyAttendance | null;
  thresholdPct: number;
};

// T4, T9: one class, for whoever may see it; a student sees only their own attendance (09 §3).
export async function getSession(offeringId: string, sessionId: string): Promise<SessionDetail> {
  const viewer = await requireViewer();
  const { offering, view, canManage, hosts } = await liveAccess(viewer, offeringId);
  if (!Types.ObjectId.isValid(sessionId)) notFound();
  const doc = await LiveSession.findOne({ _id: sessionId, offeringId }, { ...SESSION_FIELDS, roomName: 1 }).lean();
  if (!doc) notFound();
  const now = new Date();
  const session = toRow(doc, now);
  const student = view === 'student';
  const joins = doc.status === 'live' && (student || hosts);
  const [join, inClass, enrolled, stats, mine, { liveThresholdPct }] = await Promise.all([
    joins
      ? joinToken({
          roomName: doc.roomName,
          userId: viewer.id,
          name: viewer.name,
          role: student ? 'participant' : 'host',
          // T4: valid until two hours after the scheduled end, and never less than a minute.
          ttlSec: Math.max(60, Math.round((doc.scheduledEnd.getTime() + 120 * MINUTE_MS - now.getTime()) / 1000)),
        })
      : null,
    student || doc.status !== 'live' ? 0 : Attendance.countDocuments({ sessionId: doc._id, ...IN_CLASS }),
    Enrollment.countDocuments({ offeringId, status: 'active' }),
    student || !doc.startedAt
      ? []
      : Attendance.aggregate<{
          present: number;
          absent: number;
          manual: number;
          avgPresenceSec: number;
          avgFocusedSec: number;
        }>([
          { $match: { sessionId: doc._id } },
          {
            $group: {
              _id: null,
              present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
              absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
              manual: { $sum: { $cond: [{ $eq: ['$source', 'manual'] }, 1, 0] } },
              avgPresenceSec: { $avg: '$presenceSec' },
              avgFocusedSec: { $avg: '$focusedSec' },
            },
          },
        ]),
    student
      ? Attendance.findOne(
          { sessionId: doc._id, studentId: viewer.id },
          { status: 1, presenceSec: 1, focusedSec: 1 },
        ).lean()
      : null,
    getSettings('attendance'),
  ]);
  const summary = stats[0];
  return {
    view,
    canManage,
    category: offering.category,
    offeringTitle: offering.title,
    session,
    canStartAt: new Date(doc.scheduledStart.getTime() - START_EARLY_MS),
    join,
    inClass,
    enrolled,
    summary:
      student || !doc.startedAt
        ? null
        : {
            present: summary?.present ?? 0,
            absent: summary?.absent ?? 0,
            manual: summary?.manual ?? 0,
            avgPresenceSec: Math.round(summary?.avgPresenceSec ?? 0),
            avgFocusedSec: Math.round(summary?.avgFocusedSec ?? 0),
          },
    mine: student
      ? { status: mine?.status ?? null, presenceSec: mine?.presenceSec ?? 0, focusedSec: mine?.focusedSec ?? 0 }
      : null,
    thresholdPct: liveThresholdPct,
  };
}

export type SheetRow = {
  studentId: string;
  rollNo: string;
  name: string;
  status: AttendanceStatus | null;
  marked: boolean;
  // The radio checked when the sheet opens (M03 decision 2), or none.
  prefill: AttendanceStatus | null;
  joined: boolean;
  inClass: boolean;
  presenceSec: number;
  focusedSec: number;
};

export type AttendanceSheet = { rows: SheetRow[]; total: number; page: number; pageSize: number; unmarked: number };

// T7: the attendance list, by roll number, a page of 100 at a time (04 §3 S1).
export async function getAttendanceSheet(
  offeringId: string,
  sessionId: string,
  page: number,
): Promise<AttendanceSheet> {
  const viewer = await requireViewer();
  const { view } = await liveAccess(viewer, offeringId);
  if (view === 'student' || !Types.ObjectId.isValid(sessionId)) notFound();
  const doc = await LiveSession.findOne(
    { _id: sessionId, offeringId },
    { startedAt: 1, endedAt: 1, finalizedAt: 1, attendanceMode: 1 },
  ).lean();
  if (!doc) notFound();
  // One offering's active students (up to 400, 02 §11), ordered by roll number for a roll call.
  const studentIds = await Enrollment.distinct('studentId', { offeringId, status: 'active' });
  const [students, manual, { liveThresholdPct }] = await Promise.all([
    User.find({ _id: { $in: studentIds } }, { name: 1, rollNo: 1 })
      .sort({ rollNo: 1, _id: 1 })
      .skip((page - 1) * SHEET_PAGE_SIZE)
      .limit(SHEET_PAGE_SIZE)
      .lean(),
    Attendance.countDocuments({ sessionId: doc._id, source: 'manual' }),
    getSettings('attendance'),
  ]);
  const rows = await Attendance.find(
    { sessionId: doc._id, studentId: { $in: students.map((s) => s._id) } },
    { studentId: 1, status: 1, source: 1, presence: 1, presenceSec: 1, focusedSec: 1 },
  ).lean();
  const rowOf = new Map(rows.map((row) => [String(row.studentId), row]));
  const now = new Date();
  const finalized = Boolean(doc.finalizedAt);
  return {
    rows: students.map((student) => {
      const row = rowOf.get(String(student._id));
      const presence = (row?.presence ?? []).map(({ joinedAt, leftAt }) => ({ joinedAt, leftAt: leftAt ?? null }));
      const status = row?.status ?? null;
      const marked = row?.source === 'manual';
      const joined = presence.length > 0;
      // Until finalization, minutes in class are worked out from the connections so far.
      const presenceSec =
        finalized || !doc.startedAt
          ? (row?.presenceSec ?? 0)
          : deriveAttendance(presence, doc.startedAt, doc.endedAt ?? now, liveThresholdPct).presenceSec;
      return {
        studentId: String(student._id),
        rollNo: student.rollNo ?? '—',
        name: student.name,
        status,
        marked,
        prefill:
          marked || finalized ? status : doc.attendanceMode === 'manual' ? (joined ? 'present' : 'absent') : null,
        joined,
        inClass: presence.some((p) => p.leftAt === null),
        presenceSec,
        focusedSec: row?.focusedSec ?? 0,
      };
    }),
    total: studentIds.length,
    page,
    pageSize: SHEET_PAGE_SIZE,
    unmarked: doc.attendanceMode === 'manual' ? Math.max(0, studentIds.length - manual) : 0,
  };
}

export type TodayClass = {
  id: string;
  offeringId: string;
  offeringTitle: string;
  title: string;
  status: 'scheduled' | 'live';
  scheduledStart: Date;
  scheduledEnd: Date;
};

// T9, A-70: Home's "Today's live classes" for the courses a student is in or a teacher teaches. An admin, who may join
// any class, gets the ten running now across the university, the earliest to end first (index status, scheduledEnd).
export async function listTodaysLiveSessions(): Promise<TodayClass[]> {
  const viewer = await requireViewer();
  await db();
  if (viewer.roles.includes('admin')) {
    const running = await LiveSession.find(
      { status: 'live' },
      { offeringId: 1, title: 1, scheduledStart: 1, scheduledEnd: 1 },
    )
      .sort({ scheduledEnd: 1 })
      .limit(10)
      .lean();
    const titles = await Offering.find({ _id: { $in: running.map((doc) => doc.offeringId) } }, { title: 1 }).lean();
    const titleOf = new Map(titles.map((o) => [String(o._id), o.title]));
    return running.map((doc) => ({
      id: String(doc._id),
      offeringId: String(doc.offeringId),
      offeringTitle: titleOf.get(String(doc.offeringId)) ?? '—',
      title: doc.title,
      status: 'live',
      scheduledStart: doc.scheduledStart,
      scheduledEnd: doc.scheduledEnd,
    }));
  }
  const enrolledIn = viewer.roles.includes('student')
    ? await Enrollment.distinct('offeringId', { studentId: viewer.id, status: 'active' })
    : [];
  const scope = [
    ...(enrolledIn.length > 0 ? [{ _id: { $in: enrolledIn } }] : []),
    ...(viewer.roles.includes('faculty') ? [{ facultyIds: new Types.ObjectId(viewer.id) }] : []),
  ];
  if (scope.length === 0) return [];
  // Students see classes of active courses only (09 §3); nobody schedules on any other.
  const offerings = await Offering.find({ $or: scope, status: 'active' }, { title: 1 }).limit(100).lean();
  if (offerings.length === 0) return [];
  const titleOf = new Map(offerings.map((o) => [String(o._id), o.title]));
  const now = new Date();
  const dayStart = istDateToDate(istDayKey(now));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * MINUTE_MS);
  const docs = await LiveSession.find(
    {
      offeringId: { $in: offerings.map((o) => o._id) },
      $or: [
        { status: 'live' as const },
        { status: 'scheduled' as const, scheduledStart: { $gte: dayStart, $lt: dayEnd }, scheduledEnd: { $gte: now } },
      ],
    },
    { offeringId: 1, title: 1, status: 1, scheduledStart: 1, scheduledEnd: 1 },
  )
    .sort({ scheduledStart: 1 })
    .limit(10)
    .lean();
  return docs.flatMap((doc) =>
    doc.status === 'live' || doc.status === 'scheduled'
      ? [
          {
            id: String(doc._id),
            offeringId: String(doc.offeringId),
            offeringTitle: titleOf.get(String(doc.offeringId)) ?? '—',
            title: doc.title,
            status: doc.status,
            scheduledStart: doc.scheduledStart,
            scheduledEnd: doc.scheduledEnd,
          },
        ]
      : [],
  );
}
