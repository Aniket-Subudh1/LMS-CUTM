import 'server-only';
import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { offeringAccess } from '@/lib/auth/access';
import { requireViewer, type Viewer } from '@/lib/auth/session';
import { getSettings } from '@/lib/data/settings';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { attendancePct, deriveAttendance } from '@/lib/domain/attendance';
import { istDateToDate, istDayKey } from '@/lib/domain/time';
import { closeRoom, joinToken, recordingEnabled, type StudentRights } from '@/lib/integrations/live';
import { Attendance } from '@/lib/models/attendance';
import { Enrollment } from '@/lib/models/enrollment';
import { LiveSession, type LiveSessionDoc } from '@/lib/models/live-session';
import { Offering } from '@/lib/models/offering';
import { PollAnswer } from '@/lib/models/poll-answer';
import { User } from '@/lib/models/user';
import { queueLiveFinalize } from '@/lib/queue';
import { pageSize } from '@/lib/schemas/common';
import {
  ALL_RIGHTS,
  breakoutRoomName,
  SHEET_PAGE_SIZE,
  type AttendanceMode,
  type AttendanceStatus,
  type SessionStatus,
} from '@/lib/schemas/live';

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

export function toRow(doc: SessionDoc, now: Date): LiveSessionRow {
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
  // A join token for the faculty (host) and enrolled students while the class is live (T4), but not for a student a
  // host removed (M03c).
  join: { serverUrl: string; token: string } | null;
  removed: boolean;
  // M03c T2: for hosts while the class is live — what students may do, and who was removed, the latest first.
  controls: RoomControls | null;
  // M03c T5: a host may record while it runs (where Egress is set up); its saved recordings, for whoever sees the class.
  canRecord: boolean;
  recordings: RecordingRow[];
  // M03c T6: while it runs, its polls as the viewer may see them.
  polls: RoomPoll[];
  // M03c T7: open breakout rooms as the viewer may see them.
  breakout: RoomBreakout | null;
  // M03c T8: the whiteboard, while one is open.
  board: RoomBoard | null;
  inClass: number;
  enrolled: number;
  // Staff, once the class has started.
  summary: { present: number; absent: number; manual: number; avgPresenceSec: number; avgFocusedSec: number } | null;
  mine: MyAttendance | null;
  thresholdPct: number;
};

// M03c T8: an open whiteboard — whether the others may draw, and who opened it (T16: the presenter the others follow).
export type RoomBoard = { studentsDraw: boolean; by: string };

// M03c T2, T4: what a host sees in People — what the others may do and who was removed (the latest first). Removed
// people are users, or a meeting's guests.
export type RoomControls = {
  rights: StudentRights;
  removed: { id: string; name: string; at: Date }[];
};

type RoomDoc = Pick<LiveSessionDoc, 'studentsMay' | 'removed' | 'meeting'>;

// M03c T5: the saved recordings of a class or meeting, for its page, the earliest first.
export type RecordingRow = { key: string; startedAt: Date; durationSec: number | null; by: string };

export async function savedRecordings(doc: Pick<LiveSessionDoc, 'recordings'>): Promise<RecordingRow[]> {
  const saved = (doc.recordings ?? []).filter((r) => r.status === 'saved');
  if (saved.length === 0) return [];
  const users = await User.find({ _id: { $in: saved.map((r) => r.by) } }, { name: 1 }).lean();
  return saved.map((r) => ({
    key: r.key,
    startedAt: r.startedAt,
    durationSec: r.durationSec ?? null,
    by: users.find((u) => u._id.equals(r.by))?.name ?? 'A host',
  }));
}

export async function roomControls(doc: RoomDoc): Promise<RoomControls> {
  const removed = doc.removed ?? [];
  const guests = doc.meeting?.guests ?? [];
  const users =
    removed.length > 0 ? await User.find({ _id: { $in: removed.map((r) => r.userId) } }, { name: 1 }).lean() : [];
  const nameOf = (id: Types.ObjectId) =>
    users.find((u) => u._id.equals(id))?.name ?? guests.find((g) => g._id.equals(id))?.name ?? 'A guest';
  return {
    rights: { ...ALL_RIGHTS, ...doc.studentsMay },
    removed: removed.map((r) => ({ id: String(r.userId), name: nameOf(r.userId), at: r.at })).reverse(),
  };
}

// M03c T6: the polls of a running room as the viewer may see them. Hosts see every poll with its counts as answers
// come in; the others see the open poll and their own answer, and a poll's counts once a host shows them or it ends
// with results for everyone. Who answered what is never shown (01 §4: poll analytics are out of scope).
export type RoomPoll = {
  id: string;
  question: string;
  status: 'open' | 'ended';
  showResults: boolean;
  shared: boolean;
  options: { id: string; text: string; count: number | null }[];
  answered: number | null;
  mine: string | null;
};

// M03c T6, T15: an answer, or a changed one, from someone taking part — signed in, or in a meeting by their link (a
// guest's id, A-225). Only while the poll is open and the option is one of its own.
export async function answerPollAs(sessionId: string, pollId: string, optionId: string, personId: string) {
  const open = await LiveSession.exists({
    _id: sessionId,
    status: 'live',
    polls: { $elemMatch: { _id: pollId, status: 'open', 'options._id': optionId } },
  });
  if (!open) throw new AppError('CLOSED', 'This poll has ended.');
  await PollAnswer.updateOne(
    { pollId, userId: personId },
    { $set: { optionId }, $setOnInsert: { sessionId } },
    { upsert: true },
  );
}

export async function roomPolls(
  doc: Pick<LiveSessionDoc, 'polls'>,
  viewerId: string,
  host: boolean,
): Promise<RoomPoll[]> {
  const visible = (p: NonNullable<LiveSessionDoc['polls']>[number]) =>
    host || Boolean(p.sharedAt) || (p.status === 'ended' && p.showResults);
  const polls = (doc.polls ?? []).filter((p) => host || p.status === 'open' || visible(p));
  if (polls.length === 0) return [];
  const counted = polls.filter(visible).map((p) => p._id);
  const [counts, mine] = await Promise.all([
    counted.length > 0
      ? PollAnswer.aggregate<{ _id: { pollId: Types.ObjectId; optionId: Types.ObjectId }; n: number }>([
          { $match: { pollId: { $in: counted } } },
          { $group: { _id: { pollId: '$pollId', optionId: '$optionId' }, n: { $sum: 1 } } },
        ])
      : [],
    PollAnswer.find({ pollId: { $in: polls.map((p) => p._id) }, userId: viewerId }, { pollId: 1, optionId: 1 }).lean(),
  ]);
  return polls.map((p) => {
    const shown = visible(p);
    const countOf = (optionId: Types.ObjectId) =>
      counts.find((c) => c._id.pollId.equals(p._id) && c._id.optionId.equals(optionId))?.n ?? 0;
    return {
      id: String(p._id),
      question: p.question,
      status: p.status,
      showResults: p.showResults,
      shared: Boolean(p.sharedAt),
      options: p.options.map((o) => ({ id: String(o._id), text: o.text, count: shown ? countOf(o._id) : null })),
      answered: shown ? p.options.reduce((sum, o) => sum + countOf(o._id), 0) : null,
      mine: mine.find((a) => a.pollId.equals(p._id))?.optionId.toString() ?? null,
    };
  });
}

// M03c T7: open breakout rooms as the viewer may see them: hosts every room with who is in it; the others their own
// room and who is with them. Null when none is open.
export type RoomBreakout = {
  rooms: number;
  openedAt: Date;
  closesAt: Date | null;
  assigned: { room: number; people: string[] }[];
  mine: number | null;
};

export async function roomBreakout(
  doc: Pick<LiveSessionDoc, 'breakout'>,
  viewerId: string,
  host: boolean,
  now: Date,
): Promise<RoomBreakout | null> {
  const breakout = doc.breakout;
  if (!breakout || breakout.closedAt || (breakout.closesAt && breakout.closesAt <= now)) return null;
  const mine = breakout.assignments.find((a) => a.userId.equals(viewerId))?.room ?? null;
  const shown = breakout.assignments.filter((a) => host || (mine !== null && a.room === mine));
  const users = await User.find({ _id: { $in: shown.map((a) => a.userId) } }, { name: 1 }).lean();
  const rooms = host ? Array.from({ length: breakout.rooms }, (_, i) => i + 1) : mine === null ? [] : [mine];
  return {
    rooms: breakout.rooms,
    openedAt: breakout.openedAt,
    closesAt: breakout.closesAt ?? null,
    assigned: rooms.map((room) => ({
      room,
      people: shown
        .filter((a) => a.room === room)
        .map((a) => users.find((u) => u._id.equals(a.userId))?.name ?? 'Someone')
        .sort((a, b) => a.localeCompare(b)),
    })),
    mine,
  };
}

// T3, M03c T4: ending a class or a meeting for everyone. The room closes first, so a failure changes nothing and the host
// can try again; the engine's room_finished may end it first. Either way it is ended and finalized (a meeting without
// attendance).
export async function endLiveSession(session: {
  _id: Types.ObjectId;
  status: SessionStatus;
  roomName: string;
  breakout?: LiveSessionDoc['breakout'];
}) {
  if (session.status === 'live') {
    // M03c T7: breakout rooms still open close with it.
    if (session.breakout && !session.breakout.closedAt) {
      for (let room = 1; room <= session.breakout.rooms; room++) {
        await closeRoom(breakoutRoomName(session.roomName, room));
      }
    }
    await closeRoom(session.roomName);
    await LiveSession.updateOne(
      { _id: session._id, status: 'live' },
      { $set: { status: 'ended', endedAt: new Date() } },
    );
  } else if (session.status !== 'ended') {
    throw new AppError('CLOSED', 'It is not running.');
  }
  await queueLiveFinalize(String(session._id));
}

// T4, T9: one class, for whoever may see it; a student sees only their own attendance (09 §3).
export async function getSession(offeringId: string, sessionId: string): Promise<SessionDetail> {
  const viewer = await requireViewer();
  const { offering, view, canManage, hosts } = await liveAccess(viewer, offeringId);
  if (!Types.ObjectId.isValid(sessionId)) notFound();
  const doc = await LiveSession.findOne(
    { _id: sessionId, offeringId },
    {
      ...SESSION_FIELDS,
      roomName: 1,
      studentsMay: 1,
      removed: 1,
      recordings: 1,
      polls: 1,
      breakout: 1,
      board: 1,
    },
  ).lean();
  if (!doc) notFound();
  const now = new Date();
  const session = toRow(doc, now);
  const student = view === 'student';
  const removedList = doc.removed ?? [];
  const removed = student && removedList.some((r) => r.userId.equals(viewer.id));
  const live = doc.status === 'live';
  const rights = { ...ALL_RIGHTS, ...doc.studentsMay };
  const [join, controls, recordings, polls, breakout, inClass, enrolled, stats, mine, { liveThresholdPct }] =
    await Promise.all([
      live && !removed && (student || hosts)
        ? joinToken({
            roomName: doc.roomName,
            userId: viewer.id,
            name: viewer.name,
            role: student ? 'participant' : 'host',
            rights,
          })
        : null,
      live && hosts && !student ? roomControls(doc) : null,
      savedRecordings(doc),
      live && !removed && (student || hosts) ? roomPolls(doc, viewer.id, !student) : [],
      live && !removed && (student || hosts) ? roomBreakout(doc, viewer.id, !student, now) : null,
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
    removed,
    controls,
    canRecord: live && hosts && !student && recordingEnabled(),
    recordings,
    polls,
    breakout,
    board: live && doc.board ? { studentsDraw: doc.board.studentsDraw, by: String(doc.board.by) } : null,
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
      { status: 'live', kind: { $ne: 'meeting' } },
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
