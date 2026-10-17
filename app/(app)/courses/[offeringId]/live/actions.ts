'use server';

import { refresh } from 'next/cache';
import mongoose, { Types } from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { offeringAccess, requireTeach } from '@/lib/auth/access';
import { START_EARLY_MS } from '@/lib/data/live';
import { notify } from '@/lib/data/notify';
import { db } from '@/lib/db';
import { parseIstLocal } from '@/lib/domain/time';
import { AppError } from '@/lib/errors';
import { formatDateTime, formatDay, formatTime } from '@/lib/format';
import { closeRoom, muteMicrophone, removeFromRoom, setHand, tell } from '@/lib/integrations/live';
import { Attendance } from '@/lib/models/attendance';
import { Enrollment } from '@/lib/models/enrollment';
import { LiveSession } from '@/lib/models/live-session';
import type { NotificationKind } from '@/lib/models/notification';
import { Offering } from '@/lib/models/offering';
import { queueLiveControl, queueLiveFinalize } from '@/lib/queue';
import {
  LowerHands,
  MarkAttendance,
  MAX_REMOVED,
  MAX_SESSIONS,
  PersonRef,
  ScheduleSession,
  SessionRef,
  SetStudentRight,
  UpdateSession,
} from '@/lib/schemas/live';

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

// `Fri, 17 Oct at 4:49 PM`. Notification titles start with the class, as a narrow list cuts them short.
const when = (start: Date) => `${formatDay(start)} at ${formatTime(start)}`;

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
    `${input.title} — ${when(start)} (${offering.title})`,
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
      `${input.title} is now ${when(start)} (${offering.title})`,
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
      `${session.title} on ${when(session.scheduledStart)} is cancelled (${offering.title})`,
      sessionId,
    );
  } else if (session.status !== 'cancelled') {
    throw new AppError('CLOSED', 'This class has already started. End it instead.');
  }
  refresh();
});

// M03b T6: a cancelled class goes back on the timetable while its start is still ahead; students are told.
export const restoreSession = action({ input: SessionRef, roles: TEACH }, async ({ offeringId, sessionId }, viewer) => {
  await requireTeach(viewer, offeringId);
  await db();
  const [offering, session] = await Promise.all([getOffering(offeringId), findSession(offeringId, sessionId)]);
  if (session.status === 'scheduled') return refresh();
  const written = await LiveSession.updateOne(
    { _id: sessionId, status: 'cancelled', scheduledStart: { $gt: new Date() } },
    { $set: { status: 'scheduled' } },
  );
  if (written.matchedCount === 0) {
    throw new AppError(
      'CLOSED',
      'Only a cancelled class whose time is still ahead can be restored. Schedule a new one.',
    );
  }
  await tellStudents(
    offeringId,
    'live.changed',
    `${session.title} is back on — ${when(session.scheduledStart)} (${offering.title})`,
    sessionId,
  );
  refresh();
});

// M03b T6, 09 §6: a class that never ran — cancelled, or not held by its end — and has no attendance row can be
// removed for good, audited. A class that is still ahead is cancelled first, so its students are told.
export const deleteSession = action({ input: SessionRef, roles: TEACH }, async ({ offeringId, sessionId }, viewer) => {
  await requireTeach(viewer, offeringId);
  await db();
  const session = await findSession(offeringId, sessionId);
  const now = new Date();
  const neverRan =
    !session.startedAt &&
    (session.status === 'cancelled' || (session.status === 'scheduled' && session.scheduledEnd < now));
  if (!neverRan) {
    throw new AppError(
      'CLOSED',
      session.status === 'scheduled'
        ? 'Cancel the class first, so its students are told.'
        : 'A class that ran is kept with its attendance.',
    );
  }
  if (await Attendance.exists({ sessionId })) {
    throw new AppError('CLOSED', 'This class has attendance, so it is kept.');
  }
  await mongoose.connection.transaction(async (txn) => {
    const removed = await LiveSession.deleteOne(
      {
        _id: sessionId,
        startedAt: null,
        $or: [{ status: 'cancelled' }, { status: 'scheduled', scheduledEnd: { $lt: now } }],
      },
      { session: txn },
    );
    if (removed.deletedCount === 0) throw new AppError('CONFLICT', 'The class changed meanwhile. Reload the page.');
    await writeAudit(
      {
        actorId: viewer.id,
        action: 'live.deleted',
        entity: 'live_session',
        entityId: sessionId,
        offeringId,
        before: { title: session.title, status: session.status, scheduledStart: session.scheduledStart },
      },
      txn,
    );
  });
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

async function liveRoom(offeringId: string, sessionId: string) {
  await db();
  const session = await findSession(offeringId, sessionId);
  if (session.status !== 'live') throw new AppError('CLOSED', 'The class is not running.');
  return session.roomName;
}

// M03b (Aniket, 17 Oct 2026): a student in the class raises a hand; everyone in the room sees it, in the order raised.
export const raiseHand = action(
  { input: SessionRef, roles: ['student'] },
  async ({ offeringId, sessionId }, viewer) => {
    if ((await offeringAccess(viewer, offeringId)) !== 'learn')
      throw new AppError('FORBIDDEN', 'Only students raise a hand.');
    await setHand(await liveRoom(offeringId, sessionId), viewer.id, new Date());
  },
);

// A student lowers their own hand; a host (the class's teachers, admins) lowers anyone's, one or all.
export const lowerHands = action(
  { input: LowerHands, roles: ['student', 'faculty', 'admin'] },
  async ({ offeringId, sessionId, 'identity[]': identities }, viewer) => {
    if (identities.length === 1 && identities[0] === viewer.id) await offeringAccess(viewer, offeringId);
    else await requireTeach(viewer, offeringId);
    const roomName = await liveRoom(offeringId, sessionId);
    await Promise.all([...new Set(identities)].map((identity) => setHand(roomName, identity, null)));
  },
);

// --- Host controls (M03c T2). Every host sees a change at once: the room tells their browsers to reload the controls. ---

// As in Google Meet, a host turns someone's microphone off, not on; they are told who did it.
export const muteParticipant = action(
  { input: PersonRef, roles: TEACH },
  async ({ offeringId, sessionId, identity }, viewer) => {
    await requireTeach(viewer, offeringId);
    const roomName = await liveRoom(offeringId, sessionId);
    if (await muteMicrophone(roomName, identity)) {
      await tell(roomName, 'notice', `${viewer.name} muted your microphone`, [identity]);
    }
  },
);

// Everyone's microphone but the host's own; the worker reaches them all (04 §3).
export const muteEveryone = action({ input: SessionRef, roles: TEACH }, async ({ offeringId, sessionId }, viewer) => {
  await requireTeach(viewer, offeringId);
  await liveRoom(offeringId, sessionId);
  await queueLiveControl({ op: 'muteAll', sessionId, byId: viewer.id, byName: viewer.name.slice(0, 120) });
});

// What students may do: saved on the class, so students who join later get it too, and applied by the worker to the
// students already in the room.
export const setStudentRight = action(
  { input: SetStudentRight, roles: TEACH },
  async ({ offeringId, sessionId, right, allowed }, viewer) => {
    await requireTeach(viewer, offeringId);
    const roomName = await liveRoom(offeringId, sessionId);
    await LiveSession.updateOne({ _id: sessionId, status: 'live' }, { $set: { [`studentsMay.${right}`]: allowed } });
    await queueLiveControl({ op: 'rights', sessionId });
    await tell(roomName, 'controls', right);
    refresh();
  },
);

// M03c decision 3: a removed student is disconnected and stays out of the class until a host lets them back; their
// time in the room so far still counts. Saved before the disconnect, so a quick rejoin is refused too. Audited.
export const removeParticipant = action(
  { input: PersonRef, roles: TEACH },
  async ({ offeringId, sessionId, identity }, viewer) => {
    await requireTeach(viewer, offeringId);
    const roomName = await liveRoom(offeringId, sessionId);
    if (!(await Enrollment.exists({ offeringId, studentId: identity, status: 'active' }))) {
      throw new AppError('VALIDATION', 'Only students of this course can be removed from the class.');
    }
    await mongoose.connection.transaction(async (txn) => {
      const written = await LiveSession.updateOne(
        {
          _id: sessionId,
          status: 'live',
          'removed.userId': { $ne: identity },
          [`removed.${MAX_REMOVED - 1}`]: { $exists: false },
        },
        { $push: { removed: { userId: identity, at: new Date(), by: viewer.id } } },
        { session: txn },
      );
      if (written.matchedCount === 0) {
        const current = await LiveSession.findById(sessionId, {
          status: 1,
          removed: { $elemMatch: { userId: new Types.ObjectId(identity) } },
        })
          .session(txn)
          .lean();
        if (current?.removed?.length) return;
        throw new AppError(
          'CONFLICT',
          current?.status === 'live'
            ? `At most ${MAX_REMOVED} people can be removed from one class.`
            : 'The class is not running.',
        );
      }
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'live.removed',
          entity: 'live_session',
          entityId: sessionId,
          offeringId,
          after: { studentId: identity },
        },
        txn,
      );
    });
    await removeFromRoom(roomName, identity);
    await tell(roomName, 'controls', 'removed');
    refresh();
  },
);

export const allowBack = action(
  { input: PersonRef, roles: TEACH },
  async ({ offeringId, sessionId, identity }, viewer) => {
    await requireTeach(viewer, offeringId);
    await db();
    const session = await findSession(offeringId, sessionId);
    await mongoose.connection.transaction(async (txn) => {
      const written = await LiveSession.updateOne(
        { _id: sessionId, 'removed.userId': identity },
        { $pull: { removed: { userId: identity } } },
        { session: txn },
      );
      if (written.modifiedCount === 0) return;
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'live.allowed_back',
          entity: 'live_session',
          entityId: sessionId,
          offeringId,
          before: { studentId: identity },
        },
        txn,
      );
    });
    if (session.status === 'live') await tell(session.roomName, 'controls', 'allowed');
    refresh();
  },
);
