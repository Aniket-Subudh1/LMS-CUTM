'use server';

import { refresh } from 'next/cache';
import mongoose, { Types } from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { requireTeach } from '@/lib/auth/access';
import { START_EARLY_MS } from '@/lib/data/live';
import { notify } from '@/lib/data/notifications';
import { db } from '@/lib/db';
import { parseIstLocal } from '@/lib/domain/time';
import { AppError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { closeRoom } from '@/lib/integrations/live';
import { Attendance } from '@/lib/models/attendance';
import { Enrollment } from '@/lib/models/enrollment';
import { LiveSession } from '@/lib/models/live-session';
import type { NotificationKind } from '@/lib/models/notification';
import { Offering } from '@/lib/models/offering';
import { queueLiveFinalize } from '@/lib/queue';
import { MarkAttendance, MAX_SESSIONS, ScheduleSession, SessionRef, UpdateSession } from '@/lib/schemas/live';

const TEACH = ['admin', 'faculty'] as const;
const MINUTE_MS = 60_000;

async function getOffering(offeringId: string) {
  const offering = await Offering.findById(offeringId, { status: 1, category: 1, title: 1 }).lean();
  if (!offering) throw new AppError('NOT_FOUND', 'Course offering not found.');
  return offering;
}

async function findSession(offeringId: string, sessionId: string) {
  const session = await LiveSession.findOne(
    { _id: sessionId, offeringId },
    { title: 1, status: 1, scheduledStart: 1, scheduledEnd: 1, startedAt: 1, roomName: 1, attendanceMode: 1 },
  ).lean();
  if (!session) throw new AppError('NOT_FOUND', 'Live class not found.');
  return session;
}

// A-68: the date, start time and length become the class's start and end (IST).
function slot(input: { date: string; startTime: string; lengthMin: number }) {
  const start = parseIstLocal(`${input.date}T${input.startTime}`);
  return { start, end: new Date(start.getTime() + input.lengthMin * MINUTE_MS) };
}

function notInPast(start: Date, now: Date) {
  if (start.getTime() < Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS) {
    throw new AppError('VALIDATION', 'That time has passed. Pick a time from now on.', {
      startTime: ['Pick a time from now on.'],
    });
  }
}

// COM-03: one notification per enrolled student; a long class or course title is cut to fit (05 §7.2).
async function tellStudents(offeringId: string, kind: NotificationKind, title: string, sessionId: string) {
  const students = await Enrollment.distinct('studentId', { offeringId, status: 'active' });
  await notify(students.map(String), {
    kind,
    title: title.length > 160 ? `${title.slice(0, 159)}…` : title,
    href: `/courses/${offeringId}/live/${sessionId}`,
  });
}

// CRS-04, T3.
export const scheduleSession = action({ input: ScheduleSession, roles: TEACH }, async (input, viewer) => {
  await requireTeach(viewer, input.offeringId);
  await db();
  const offering = await getOffering(input.offeringId);
  if (offering.status !== 'active') {
    throw new AppError('CLOSED', 'Live classes can be scheduled once the course is active.');
  }
  const { start, end } = slot(input);
  notInPast(start, new Date());
  if ((await LiveSession.countDocuments({ offeringId: input.offeringId })) >= MAX_SESSIONS) {
    throw new AppError('CONFLICT', `A course holds at most ${MAX_SESSIONS} live classes.`);
  }
  const _id = new Types.ObjectId();
  await LiveSession.create({
    _id,
    offeringId: input.offeringId,
    kind: 'class',
    title: input.title,
    scheduledStart: start,
    scheduledEnd: end,
    roomName: `ls-${_id}`,
    // ATT-03: attendance on a skill course is always derived from time in class.
    attendanceMode: offering.category === 'skill' ? 'derived' : input.attendanceMode,
    createdBy: viewer.id,
  });
  await tellStudents(
    input.offeringId,
    'live.scheduled',
    `Live class on ${formatDateTime(start)}: ${input.title} (${offering.title})`,
    String(_id),
  );
  refresh();
});

// M03 decision 1: a class can be changed until it starts; students are told when its title or time changes.
export const updateSession = action({ input: UpdateSession, roles: TEACH }, async (input, viewer) => {
  await requireTeach(viewer, input.offeringId);
  await db();
  const [offering, current] = await Promise.all([
    getOffering(input.offeringId),
    findSession(input.offeringId, input.sessionId),
  ]);
  const { start, end } = slot(input);
  if (start.getTime() !== current.scheduledStart.getTime()) notInPast(start, new Date());
  const written = await LiveSession.updateOne(
    { _id: input.sessionId, status: 'scheduled' },
    {
      $set: {
        title: input.title,
        scheduledStart: start,
        scheduledEnd: end,
        attendanceMode: offering.category === 'skill' ? 'derived' : input.attendanceMode,
      },
    },
  );
  if (written.matchedCount === 0) {
    throw new AppError('CLOSED', 'This class has already started or been cancelled, so it can no longer be changed.');
  }
  const moved =
    start.getTime() !== current.scheduledStart.getTime() || end.getTime() !== current.scheduledEnd.getTime();
  if (moved || input.title !== current.title) {
    await tellStudents(
      input.offeringId,
      'live.changed',
      `Live class changed: ${input.title}, now ${formatDateTime(start)} (${offering.title})`,
      input.sessionId,
    );
  }
  refresh();
});

export const cancelSession = action({ input: SessionRef, roles: TEACH }, async ({ offeringId, sessionId }, viewer) => {
  await requireTeach(viewer, offeringId);
  await db();
  const [offering, session] = await Promise.all([getOffering(offeringId), findSession(offeringId, sessionId)]);
  const written = await LiveSession.updateOne(
    { _id: sessionId, status: 'scheduled' },
    { $set: { status: 'cancelled' } },
  );
  if (written.matchedCount === 1) {
    await tellStudents(
      offeringId,
      'live.cancelled',
      `Live class cancelled: ${session.title} on ${formatDateTime(session.scheduledStart)} (${offering.title})`,
      sessionId,
    );
  } else if (session.status !== 'cancelled') {
    throw new AppError('CLOSED', 'This class has already started. End it instead.');
  }
  refresh();
});

// T3: from 15 minutes before the start until the scheduled end; a second click finds the class live.
export const startSession = action({ input: SessionRef, roles: TEACH }, async ({ offeringId, sessionId }, viewer) => {
  await requireTeach(viewer, offeringId);
  await db();
  const [offering, session] = await Promise.all([getOffering(offeringId), findSession(offeringId, sessionId)]);
  if (session.status === 'live') return refresh();
  if (session.status !== 'scheduled') throw new AppError('CLOSED', 'This class has already ended or was cancelled.');
  const now = new Date();
  if (now.getTime() < session.scheduledStart.getTime() - START_EARLY_MS) {
    throw new AppError(
      'CLOSED',
      `You can start this class from ${formatDateTime(new Date(session.scheduledStart.getTime() - START_EARLY_MS))}.`,
    );
  }
  if (now > session.scheduledEnd) {
    throw new AppError('CLOSED', 'The time for this class has passed. Schedule it again.');
  }
  const written = await LiveSession.updateOne(
    { _id: sessionId, status: 'scheduled' },
    { $set: { status: 'live', startedAt: now } },
  );
  if (written.matchedCount === 1) {
    await tellStudents(
      offeringId,
      'live.started',
      `${session.title} has started — join now (${offering.title})`,
      sessionId,
    );
  }
  refresh();
});

// T3: the room closes first, so a failure changes nothing and the teacher can try again. The engine's room_finished
// may end the class first; either way it is ended and its attendance is worked out.
export const endSession = action({ input: SessionRef, roles: TEACH }, async ({ offeringId, sessionId }, viewer) => {
  await requireTeach(viewer, offeringId);
  await db();
  const session = await findSession(offeringId, sessionId);
  if (session.status === 'live') {
    await closeRoom(session.roomName);
    await LiveSession.updateOne({ _id: sessionId, status: 'live' }, { $set: { status: 'ended', endedAt: new Date() } });
  } else if (session.status !== 'ended') {
    throw new AppError('CLOSED', 'This class is not running.');
  }
  await queueLiveFinalize(sessionId);
  refresh();
});

// ATT-01, T7: only the students whose mark changes are written, with one audit entry for the save.
export const markAttendance = action(
  { input: MarkAttendance, roles: TEACH },
  async ({ offeringId, sessionId, marks }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    const [offering, session] = await Promise.all([getOffering(offeringId), findSession(offeringId, sessionId)]);
    // AC-M03-06: a skill course's attendance comes from time in class only.
    if (offering.category === 'skill') {
      throw new AppError('VALIDATION', 'Attendance on a skill course is taken automatically from time in class.');
    }
    if (!session.startedAt || session.status === 'cancelled') {
      throw new AppError('CLOSED', 'You can take attendance once the class has started.');
    }
    const ids = marks.map((m) => m.studentId);
    const [enrolled, rows] = await Promise.all([
      Enrollment.distinct('studentId', { offeringId, status: 'active', studentId: { $in: ids } }),
      Attendance.find({ sessionId, studentId: { $in: ids } }, { studentId: 1, status: 1 }).lean(),
    ]);
    if (enrolled.length !== new Set(ids).size) {
      throw new AppError(
        'VALIDATION',
        'The class list has changed since you opened it. Reload the page and try again.',
      );
    }
    const before = new Map(rows.map((row) => [String(row.studentId), row.status ?? null]));
    const changed = marks.filter((m) => before.get(m.studentId) !== m.status);
    if (changed.length === 0) return refresh();
    const now = new Date();
    await mongoose.connection.transaction(async (txn) => {
      await Attendance.bulkWrite(
        changed.map(({ studentId, status }) => ({
          updateOne: {
            filter: { sessionId, studentId },
            update: {
              $set: { status, source: 'manual', markedBy: viewer.id, markedAt: now },
              $setOnInsert: { offeringId, presence: [], presenceSec: 0, focusedSec: 0 },
            },
            upsert: true,
          },
        })),
        { session: txn },
      );
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'attendance.marked',
          entity: 'live_session',
          entityId: sessionId,
          offeringId,
          before: changed.map(({ studentId }) => ({ studentId, status: before.get(studentId) ?? null })),
          after: changed.map(({ studentId, status }) => ({ studentId, status, source: 'manual' })),
        },
        txn,
      );
    });
    refresh();
  },
);
