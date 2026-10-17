import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import type { Types } from 'mongoose';
import {
  allowBack,
  cancelSession,
  deleteSession,
  endSession,
  lowerHands,
  markAttendance,
  muteEveryone,
  muteParticipant,
  raiseHand,
  removeParticipant,
  restoreSession,
  scheduleSession,
  setStudentRight,
  startSession,
  updateSession,
} from '@/app/(app)/courses/[offeringId]/live/actions';
import { POST as beacon } from '@/app/api/beacon/route';
import { POST as webhook } from '@/app/api/webhooks/live/route';
import { getAttendanceSheet, getSession, listSessions, listTodaysLiveSessions } from '@/lib/data/live';
import { listRoster } from '@/lib/data/workspace';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import type { LiveEvent } from '@/lib/integrations/live';
import { Attendance } from '@/lib/models/attendance';
import { AuditLog } from '@/lib/models/audit-log';
import { EngagementDaily } from '@/lib/models/engagement-daily';
import { Enrollment } from '@/lib/models/enrollment';
import { LiveSession, type LiveSessionDoc } from '@/lib/models/live-session';
import { Notification } from '@/lib/models/notification';
import { Offering } from '@/lib/models/offering';
import { Setting } from '@/lib/models/setting';
import { computeQueue, mailQueue, redis } from '@/lib/queue';
import { startComputeWorker } from '@/worker/jobs/compute';
import { enroll, makeOffering, makeUser, newId, signInAs } from '../factories';

// The engine is replaced by events the tests hand in: a request body names one of them.
const {
  events: sent,
  room,
  closeRoom,
  setHand,
  joinToken,
  muteMicrophone,
  setRights,
  removeFromRoom,
  tell,
} = vi.hoisted(() => ({
  events: new Map<string, LiveEvent>(),
  // Who `roomPeople` says is in the room.
  room: { people: [] as { identity: string; host: boolean; microphones: string[] }[] },
  closeRoom: vi.fn(async (roomName: string) => void roomName),
  setHand: vi.fn(
    async (roomName: string, identity: string, raisedAt: Date | null) => void [roomName, identity, raisedAt],
  ),
  joinToken: vi.fn(async (input: { userId: string; role: string; rights: Record<string, boolean> }) => ({
    serverUrl: 'ws://live.test',
    token: `${input.role}-${input.userId}`,
  })),
  muteMicrophone: vi.fn(async (roomName: string, identity: string, trackSids?: string[]) =>
    Boolean([roomName, identity, trackSids]),
  ),
  setRights: vi.fn(
    async (roomName: string, identity: string, rights: Record<string, boolean>) => void [roomName, identity, rights],
  ),
  removeFromRoom: vi.fn(async (roomName: string, identity: string) => void [roomName, identity]),
  tell: vi.fn(
    async (roomName: string, topic: string, text: string, identities?: string[]) =>
      void [roomName, topic, text, identities],
  ),
}));
vi.mock('@/lib/integrations/live', async () => {
  const { AppError } = await import('@/lib/errors');
  return {
    closeRoom,
    setHand,
    joinToken,
    muteMicrophone,
    setRights,
    removeFromRoom,
    tell,
    roomPeople: async (roomName: string) => (roomName ? room.people : []),
    parseWebhook: async (rawBody: string, authorization: string | null) => {
      if (authorization !== 'signed') throw new AppError('FORBIDDEN', 'Invalid webhook signature');
      return sent.get(rawBody) ?? { type: 'ignored' };
    },
  };
});

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const MIN = 60_000;

let worker: ReturnType<typeof startComputeWorker>;
let queueEvents: QueueEvents;

beforeAll(async () => {
  await db();
  await Promise.all(
    [Attendance, AuditLog, EngagementDaily, Enrollment, LiveSession, Notification, Offering, Setting].map(async (m) => {
      await m.createCollection();
      await m.createIndexes();
    }),
  );
  worker = startComputeWorker(env().REDIS_URL);
  queueEvents = new QueueEvents('compute', {
    connection: new Redis(env().REDIS_URL, { maxRetriesPerRequest: null }),
  });
  await queueEvents.waitUntilReady();
});

afterAll(async () => {
  await Promise.all([worker.close(), queueEvents.close(), computeQueue().close(), mailQueue().close()]);
  await redis().quit();
});

const hook = (event: LiveEvent, authorization = 'signed') => {
  const body = crypto.randomUUID();
  sent.set(body, event);
  return webhook(
    new Request('http://localhost:3000/api/webhooks/live', { method: 'POST', body, headers: { authorization } }),
  );
};
const focus = (sessionId: Types.ObjectId, focusedSec: number) =>
  beacon(
    new Request('http://localhost:3000/api/beacon', {
      method: 'POST',
      body: JSON.stringify({ kind: 'live', sessionId: String(sessionId), focusedSec }),
    }),
  );

// The IST date and time of `at`, as the schedule dialog sends them.
function istInputs(at: Date) {
  const local = new Date(at.getTime() + 330 * MIN).toISOString();
  return { date: local.slice(0, 10), startTime: local.slice(11, 16) };
}

async function world(over: { category?: 'ugc' | 'skill' } = {}) {
  const faculty = await makeUser({ roles: ['faculty'] });
  const student = await makeUser({ roles: ['student'] });
  const second = await makeUser({ roles: ['student'] });
  const outsider = await makeUser({ roles: ['student'] });
  const offering = await makeOffering({
    facultyIds: [faculty._id],
    status: 'active',
    category: over.category ?? 'ugc',
  });
  const hod = await makeUser({ roles: ['faculty', 'hod'], departmentId: offering.departmentId });
  const admin = await makeUser({ roles: ['admin'] });
  await enroll(offering._id, student._id);
  await enroll(offering._id, second._id);
  await enroll((await makeOffering())._id, outsider._id);
  return { faculty, student, second, outsider, hod, admin, offering, offeringId: String(offering._id) };
}
type World = Awaited<ReturnType<typeof world>>;

// A class that ran 10:00–11:00 an hour ago unless the test says otherwise.
async function liveClass(w: World, over: Partial<LiveSessionDoc> = {}) {
  const _id = newId();
  const start = new Date(Date.now() - 120 * MIN);
  return LiveSession.create({
    _id,
    offeringId: w.offering._id,
    title: 'Pointers',
    scheduledStart: start,
    scheduledEnd: new Date(start.getTime() + 60 * MIN),
    status: 'live',
    startedAt: start,
    roomName: `ls-${_id}`,
    attendanceMode: 'derived',
    createdBy: w.faculty._id,
    ...over,
  });
}

async function finalize(sessionId: Types.ObjectId) {
  const job = await computeQueue().add(
    'finalizeLiveSession',
    { sessionId: String(sessionId) },
    { jobId: `test-${crypto.randomUUID()}` },
  );
  await job.waitUntilFinished(queueEvents);
}

const rowOf = (sessionId: Types.ObjectId, studentId: Types.ObjectId) =>
  Attendance.findOne({ sessionId, studentId }).lean();
const at = (session: { scheduledStart: Date }, minutes: number) =>
  new Date(session.scheduledStart.getTime() + minutes * MIN);

describe('scheduling a class', () => {
  it('creates the class from a date, a time and a length, and tells the students', async () => {
    const w = await world();
    await signInAs(w.faculty);
    const start = new Date(Date.now() + 3 * 60 * MIN);
    const result = await scheduleSession({
      offeringId: w.offeringId,
      title: 'Pointers',
      ...istInputs(start),
      lengthMin: 90,
      attendanceMode: 'manual',
    });
    expect(result).toEqual({ ok: true, data: undefined });
    const created = await LiveSession.findOne({ offeringId: w.offering._id }).lean();
    expect(created).toMatchObject({ status: 'scheduled', attendanceMode: 'manual', roomName: `ls-${created?._id}` });
    expect((created?.scheduledEnd.getTime() ?? 0) - (created?.scheduledStart.getTime() ?? 0)).toBe(90 * MIN);
    const told = await Notification.find({
      kind: 'live.scheduled',
      href: `/courses/${w.offeringId}/live/${created?._id}`,
    }).lean();
    expect(told.map((n) => String(n.userId)).sort()).toEqual([String(w.student._id), String(w.second._id)].sort());
  });

  it('refuses a time that has passed, a student and a teacher of another course', async () => {
    const w = await world();
    const input = {
      offeringId: w.offeringId,
      title: 'Pointers',
      ...istInputs(new Date(Date.now() - 2 * 60 * MIN)),
      lengthMin: 60,
      attendanceMode: 'derived' as const,
    };
    await signInAs(w.faculty);
    expect(await scheduleSession(input)).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { startTime: ['Pick a time from now on.'] },
    });
    await signInAs(w.student);
    expect(await scheduleSession(input)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    const stranger = await makeUser({ roles: ['faculty'] });
    await signInAs(stranger);
    await expect(scheduleSession(input)).rejects.toThrow(NOT_FOUND);
    await signInAs(w.hod);
    await expect(scheduleSession(input)).rejects.toThrow(NOT_FOUND);
  });

  it('takes attendance automatically on a skill course', async () => {
    const w = await world({ category: 'skill' });
    await signInAs(w.faculty);
    await scheduleSession({
      offeringId: w.offeringId,
      title: 'Formulas',
      ...istInputs(new Date(Date.now() + 60 * MIN)),
      lengthMin: 60,
      attendanceMode: 'manual',
    });
    expect(await LiveSession.findOne({ offeringId: w.offering._id }, { attendanceMode: 1 }).lean()).toMatchObject({
      attendanceMode: 'derived',
    });
  });

  it('needs an active course', async () => {
    const w = await world();
    await Offering.updateOne({ _id: w.offering._id }, { $set: { status: 'draft' } });
    await signInAs(w.faculty);
    expect(
      await scheduleSession({
        offeringId: w.offeringId,
        title: 'Pointers',
        ...istInputs(new Date(Date.now() + 60 * MIN)),
        lengthMin: 60,
        attendanceMode: 'manual',
      }),
    ).toMatchObject({ ok: false, code: 'CLOSED' });
  });
});

describe('changing, cancelling and starting a class', () => {
  it('changes a class until it starts, and tells the students', async () => {
    const w = await world();
    const session = await liveClass(w, {
      status: 'scheduled',
      startedAt: undefined,
      scheduledStart: new Date(Date.now() + 60 * MIN),
      scheduledEnd: new Date(Date.now() + 120 * MIN),
    });
    await signInAs(w.faculty);
    const later = new Date(Date.now() + 24 * 60 * MIN);
    const input = {
      offeringId: w.offeringId,
      sessionId: String(session._id),
      title: 'Pointers and arrays',
      ...istInputs(later),
      lengthMin: 45,
      attendanceMode: 'manual' as const,
    };
    expect(await updateSession(input)).toMatchObject({ ok: true });
    expect(await LiveSession.findById(session._id, { title: 1, attendanceMode: 1 }).lean()).toMatchObject({
      title: 'Pointers and arrays',
      attendanceMode: 'manual',
    });
    expect(await Notification.countDocuments({ kind: 'live.changed', userId: w.student._id })).toBe(1);
    await LiveSession.updateOne({ _id: session._id }, { $set: { status: 'live', startedAt: new Date() } });
    expect(await updateSession(input)).toMatchObject({ ok: false, code: 'CLOSED' });
  });

  it('cancels a scheduled class once and tells the students', async () => {
    const w = await world();
    const session = await liveClass(w, { status: 'scheduled', startedAt: undefined });
    await signInAs(w.faculty);
    const ref = { offeringId: w.offeringId, sessionId: String(session._id) };
    expect(await cancelSession(ref)).toMatchObject({ ok: true });
    expect(await cancelSession(ref)).toMatchObject({ ok: true });
    expect(await Notification.countDocuments({ kind: 'live.cancelled', userId: w.second._id })).toBe(1);
    const running = await liveClass(w);
    expect(await cancelSession({ ...ref, sessionId: String(running._id) })).toMatchObject({
      ok: false,
      code: 'CLOSED',
    });
  });

  it('restores a cancelled class while its time is ahead, and tells the students (M03b T6)', async () => {
    const w = await world();
    const ahead = await liveClass(w, {
      status: 'cancelled',
      startedAt: undefined,
      scheduledStart: new Date(Date.now() + 60 * MIN),
      scheduledEnd: new Date(Date.now() + 120 * MIN),
    });
    const gone = await liveClass(w, { status: 'cancelled', startedAt: undefined });
    await signInAs(w.student);
    expect(await restoreSession({ offeringId: w.offeringId, sessionId: String(ahead._id) })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    await signInAs(w.faculty);
    expect(await restoreSession({ offeringId: w.offeringId, sessionId: String(ahead._id) })).toMatchObject({
      ok: true,
    });
    expect((await LiveSession.findById(ahead._id).lean())?.status).toBe('scheduled');
    expect(await Notification.countDocuments({ kind: 'live.changed', userId: w.student._id })).toBe(1);
    expect(await restoreSession({ offeringId: w.offeringId, sessionId: String(gone._id) })).toMatchObject({
      ok: false,
      code: 'CLOSED',
    });
  });

  it('deletes only a class that never ran and has no attendance, and audits it (M03b T6)', async () => {
    const w = await world();
    const ahead = {
      status: 'scheduled' as const,
      startedAt: undefined,
      scheduledStart: new Date(Date.now() + 60 * MIN),
      scheduledEnd: new Date(Date.now() + 120 * MIN),
    };
    const scheduled = await liveClass(w, ahead);
    const cancelled = await liveClass(w, { ...ahead, status: 'cancelled' });
    const notHeld = await liveClass(w, { status: 'scheduled', startedAt: undefined });
    const ran = await liveClass(w, { status: 'ended', endedAt: new Date() });
    const marked = await liveClass(w, { status: 'cancelled', startedAt: undefined });
    await Attendance.create({
      sessionId: marked._id,
      offeringId: w.offering._id,
      studentId: w.student._id,
      source: 'manual',
      status: 'absent',
    });
    const del = (session: { _id: Types.ObjectId }) =>
      deleteSession({ offeringId: w.offeringId, sessionId: String(session._id) });

    // The HoD follows the course's classes and changes none of them (requireTeach answers 404).
    await signInAs(w.hod);
    await expect(del(cancelled)).rejects.toThrow(NOT_FOUND);
    await signInAs(w.faculty);
    expect(await del(scheduled)).toMatchObject({
      ok: false,
      code: 'CLOSED',
      message: 'Cancel the class first, so its students are told.',
    });
    expect(await del(ran)).toMatchObject({ ok: false, code: 'CLOSED' });
    expect(await del(marked)).toMatchObject({ ok: false, code: 'CLOSED' });
    expect(await del(cancelled)).toMatchObject({ ok: true });
    expect(await del(notHeld)).toMatchObject({ ok: true });
    expect(await LiveSession.countDocuments({ _id: { $in: [cancelled._id, notHeld._id] } })).toBe(0);
    expect(await LiveSession.countDocuments({ _id: { $in: [scheduled._id, ran._id, marked._id] } })).toBe(3);
    const audit = await AuditLog.find({ action: 'live.deleted', entityId: String(cancelled._id) }).lean();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ offeringId: w.offering._id, before: { status: 'cancelled' } });
  });

  it('keeps a cancelled class that is still ahead among the upcoming ones, a page at a time', async () => {
    const w = await world();
    const at = (hours: number) => ({
      status: 'scheduled' as const,
      startedAt: undefined,
      scheduledStart: new Date(Date.now() + hours * 60 * MIN),
      scheduledEnd: new Date(Date.now() + (hours + 1) * 60 * MIN),
    });
    const cancelled = await liveClass(w, { ...at(2), status: 'cancelled' });
    for (let h = 3; h < 14; h++) await liveClass(w, at(h));
    await signInAs(w.faculty);
    const first = await listSessions(w.offeringId, 1);
    expect(first.upcomingTotal).toBe(12);
    expect(first.upcoming).toHaveLength(10);
    expect(first.upcoming[0]).toMatchObject({ id: String(cancelled._id), state: 'cancelled' });
    expect(first.past.some((s) => s.id === String(cancelled._id))).toBe(false);
    expect((await listSessions(w.offeringId, 1, 2)).upcoming).toHaveLength(2);
  });

  it('starts from 15 minutes early, once, and tells the students', async () => {
    const w = await world();
    const early = await liveClass(w, {
      status: 'scheduled',
      startedAt: undefined,
      scheduledStart: new Date(Date.now() + 30 * MIN),
      scheduledEnd: new Date(Date.now() + 90 * MIN),
    });
    await signInAs(w.faculty);
    expect(await startSession({ offeringId: w.offeringId, sessionId: String(early._id) })).toMatchObject({
      ok: false,
      code: 'CLOSED',
    });
    const soon = await liveClass(w, {
      status: 'scheduled',
      startedAt: undefined,
      scheduledStart: new Date(Date.now() + 10 * MIN),
      scheduledEnd: new Date(Date.now() + 70 * MIN),
    });
    const ref = { offeringId: w.offeringId, sessionId: String(soon._id) };
    expect(await startSession(ref)).toMatchObject({ ok: true });
    expect(await startSession(ref)).toMatchObject({ ok: true });
    expect(await LiveSession.findById(soon._id, { status: 1, startedAt: 1 }).lean()).toMatchObject({ status: 'live' });
    expect(await Notification.countDocuments({ kind: 'live.started', userId: w.student._id })).toBe(1);
    await signInAs(w.student);
    expect(await startSession(ref)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('presence webhooks (T5)', () => {
  it('AC-M03-04: a bad signature is refused and changes nothing', async () => {
    const w = await world();
    const session = await liveClass(w);
    const response = await hook(
      {
        type: 'joined',
        host: false,
        roomName: session.roomName,
        userId: String(w.student._id),
        sid: 'PA_1',
        at: new Date(),
      },
      'forged',
    );
    expect(response.status).toBe(401);
    expect(await Attendance.countDocuments({ sessionId: session._id })).toBe(0);
  });

  it('records each connection of an enrolled student once and closes it by its id', async () => {
    const w = await world();
    const session = await liveClass(w);
    const join = (sid: string, minutes: number) =>
      hook({
        type: 'joined',
        host: false,
        roomName: session.roomName,
        userId: String(w.student._id),
        sid,
        at: at(session, minutes),
      });
    const leave = (sid: string, joined: number, minutes: number) =>
      hook({
        type: 'left',
        roomName: session.roomName,
        userId: String(w.student._id),
        sid,
        joinedAt: at(session, joined),
        at: at(session, minutes),
      });
    expect((await join('PA_1', 0)).status).toBe(200);
    await join('PA_1', 0);
    // A second tab replaces the first: the new connection's join arrives before the old one's leave.
    await join('PA_2', 20);
    await leave('PA_1', 0, 20);
    const row = await rowOf(session._id, w.student._id);
    expect(row).toMatchObject({ source: 'derived', presenceSec: 0 });
    expect(row?.status).toBeUndefined();
    expect(row?.presence.map((p) => [p.sid, p.leftAt])).toEqual([
      ['PA_1', at(session, 20)],
      ['PA_2', null],
    ]);
    // A leave whose join never arrived still gives its interval, and the late join changes nothing.
    await leave('PA_3', 40, 50);
    await join('PA_3', 40);
    expect((await rowOf(session._id, w.student._id))?.presence).toHaveLength(3);
  });

  it('ignores teachers, outsiders, unknown identities and classes that are not live', async () => {
    const w = await world();
    const session = await liveClass(w);
    for (const userId of [String(w.faculty._id), String(w.outsider._id), 'not-a-user']) {
      expect(
        (await hook({ type: 'joined', host: false, roomName: session.roomName, userId, sid: 'PA_x', at: new Date() }))
          .status,
      ).toBe(200);
    }
    const later = await liveClass(w, { status: 'scheduled', startedAt: undefined });
    await hook({
      type: 'joined',
      host: false,
      roomName: later.roomName,
      userId: String(w.student._id),
      sid: 'PA_y',
      at: new Date(),
    });
    await hook({
      type: 'joined',
      host: false,
      roomName: 'ls-unknown',
      userId: String(w.student._id),
      sid: 'PA_z',
      at: new Date(),
    });
    expect(await Attendance.countDocuments({ sessionId: { $in: [session._id, later._id] } })).toBe(0);
  });

  it('Q-50: the room closing before the scheduled end leaves the class live; after it, ends it', async () => {
    const w = await world();
    const running = await liveClass(w, {
      scheduledStart: new Date(Date.now() - 10 * MIN),
      scheduledEnd: new Date(Date.now() + 50 * MIN),
      startedAt: new Date(Date.now() - 10 * MIN),
    });
    await hook({ type: 'room_finished', roomName: running.roomName, at: new Date() });
    expect(await LiveSession.findById(running._id, { status: 1 }).lean()).toMatchObject({ status: 'live' });
    const over = await liveClass(w);
    const closedAt = at(over, 62);
    await hook({ type: 'room_finished', roomName: over.roomName, at: closedAt });
    await vi.waitFor(async () =>
      expect(await LiveSession.findById(over._id, { status: 1, endedAt: 1, finalizedAt: 1 }).lean()).toMatchObject({
        status: 'ended',
        endedAt: closedAt,
        finalizedAt: expect.any(Date),
      }),
    );
  });
});

describe('finalizing a class (T6, 07 §10)', () => {
  it('derives attendance from time in class, keeps a teacher mark and counts live time once', async () => {
    const w = await world();
    const session = await liveClass(w, { status: 'ended', endedAt: undefined });
    await LiveSession.updateOne({ _id: session._id }, { $set: { endedAt: at(session, 60) } });
    // 50 of 60 minutes: present (AC-M03-02). The second student was marked absent by hand, though in class.
    await Attendance.create([
      {
        sessionId: session._id,
        offeringId: w.offering._id,
        studentId: w.student._id,
        presence: [{ sid: 'PA_1', joinedAt: at(session, 0), leftAt: at(session, 50) }],
      },
      {
        sessionId: session._id,
        offeringId: w.offering._id,
        studentId: w.second._id,
        status: 'absent',
        source: 'manual',
        presence: [{ sid: 'PA_2', joinedAt: at(session, 0), leftAt: null }],
      },
    ]);
    await finalize(session._id);
    await finalize(session._id);
    expect(await rowOf(session._id, w.student._id)).toMatchObject({ status: 'present', presenceSec: 3000 });
    expect(await rowOf(session._id, w.second._id)).toMatchObject({
      status: 'absent',
      source: 'manual',
      presenceSec: 3600,
    });
    const live = await EngagementDaily.find({ offeringId: w.offering._id }, { studentId: 1, liveSec: 1 }).lean();
    expect(live.map((d) => [String(d.studentId), d.liveSec]).sort()).toEqual(
      [
        [String(w.student._id), 3000],
        [String(w.second._id), 3600],
      ].sort(),
    );
  });

  it('marks unmarked students absent in a class whose attendance the teacher takes', async () => {
    const w = await world();
    const session = await liveClass(w, { status: 'ended', attendanceMode: 'manual' });
    await LiveSession.updateOne({ _id: session._id }, { $set: { endedAt: at(session, 60) } });
    await Attendance.create({
      sessionId: session._id,
      offeringId: w.offering._id,
      studentId: w.student._id,
      status: 'present',
      source: 'manual',
      presence: [{ sid: 'PA_1', joinedAt: at(session, 30), leftAt: at(session, 40) }],
    });
    await finalize(session._id);
    expect(await rowOf(session._id, w.student._id)).toMatchObject({ status: 'present', presenceSec: 600 });
    expect(await rowOf(session._id, w.second._id)).toMatchObject({ status: 'absent', source: 'derived' });
  });

  it('writes nothing for a class that never started', async () => {
    const w = await world();
    const session = await liveClass(w, { status: 'ended', startedAt: undefined, endedAt: new Date() });
    await finalize(session._id);
    expect(await Attendance.countDocuments({ sessionId: session._id })).toBe(0);
  });

  it('AC-M03-05: the hourly sweep ends a class nobody ended, at its scheduled end, and finalizes it', async () => {
    const w = await world();
    const session = await liveClass(w);
    await hook({
      type: 'joined',
      host: false,
      roomName: session.roomName,
      userId: String(w.student._id),
      sid: 'PA_1',
      at: at(session, 0),
    });
    const job = await computeQueue().add('liveSweep', {}, { jobId: `test-sweep-${crypto.randomUUID()}` });
    await job.waitUntilFinished(queueEvents);
    expect(closeRoom).toHaveBeenCalledWith(session.roomName);
    await vi.waitFor(async () =>
      expect(await LiveSession.findById(session._id).lean()).toMatchObject({
        status: 'ended',
        endedAt: session.scheduledEnd,
        finalizedAt: expect.any(Date),
      }),
    );
    expect(await rowOf(session._id, w.student._id)).toMatchObject({ status: 'present', presenceSec: 3600 });
    expect(await rowOf(session._id, w.second._id)).toMatchObject({ status: 'absent', presenceSec: 0 });
  });
});

describe('ending a class', () => {
  it('closes the room, ends the class and works out its attendance', async () => {
    const w = await world();
    const session = await liveClass(w, {
      scheduledStart: new Date(Date.now() - 30 * MIN),
      scheduledEnd: new Date(Date.now() + 30 * MIN),
      startedAt: new Date(Date.now() - 30 * MIN),
    });
    await signInAs(w.faculty);
    const ref = { offeringId: w.offeringId, sessionId: String(session._id) };
    expect(await endSession(ref)).toMatchObject({ ok: true });
    expect(closeRoom).toHaveBeenCalledWith(session.roomName);
    expect(await endSession(ref)).toMatchObject({ ok: true });
    await vi.waitFor(async () =>
      expect(await LiveSession.findById(session._id, { finalizedAt: 1 }).lean()).toMatchObject({
        finalizedAt: expect.any(Date),
      }),
    );
    expect(await Attendance.countDocuments({ sessionId: session._id, status: 'absent' })).toBe(2);
  });
});

describe('taking attendance (T7)', () => {
  it('waits for the class to start and refuses a skill course', async () => {
    const w = await world();
    const later = await liveClass(w, { status: 'scheduled', startedAt: undefined });
    await signInAs(w.faculty);
    const marks = { [`status_${w.student._id}`]: 'present' };
    expect(await markAttendance({ offeringId: w.offeringId, sessionId: String(later._id), ...marks })).toMatchObject({
      ok: false,
      code: 'CLOSED',
    });
    const skill = await world({ category: 'skill' });
    const session = await liveClass(skill);
    await signInAs(skill.faculty);
    expect(
      await markAttendance({
        offeringId: skill.offeringId,
        sessionId: String(session._id),
        [`status_${skill.student._id}`]: 'present',
      }),
    ).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('AC-M03-03: writes only the marks that change, with their before and after in the audit log', async () => {
    const w = await world();
    const session = await liveClass(w, { attendanceMode: 'manual' });
    await signInAs(w.faculty);
    const ref = { offeringId: w.offeringId, sessionId: String(session._id) };
    await markAttendance({ ...ref, [`status_${w.student._id}`]: 'present', [`status_${w.second._id}`]: 'absent' });
    await markAttendance({ ...ref, [`status_${w.student._id}`]: 'present', [`status_${w.second._id}`]: 'present' });
    expect(await rowOf(session._id, w.second._id)).toMatchObject({
      status: 'present',
      source: 'manual',
      markedBy: w.faculty._id,
    });
    const entries = await AuditLog.find({ action: 'attendance.marked', entityId: session._id }).sort({ at: 1 }).lean();
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      before: [{ studentId: String(w.second._id), status: 'absent' }],
      after: [{ studentId: String(w.second._id), status: 'present', source: 'manual' }],
    });
    await markAttendance({ ...ref, [`status_${w.student._id}`]: 'present' });
    expect(await AuditLog.countDocuments({ action: 'attendance.marked', entityId: session._id })).toBe(2);
    expect(await markAttendance({ ...ref, [`status_${w.outsider._id}`]: 'present' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
  });
});

describe('focus beacons (T8, 07 §9)', () => {
  it('counts focused time only for a student connected to a live class', async () => {
    const w = await world();
    const session = await liveClass(w);
    await signInAs(w.student);
    expect((await focus(session._id, 60)).status).toBe(404);
    await hook({
      type: 'joined',
      host: false,
      roomName: session.roomName,
      userId: String(w.student._id),
      sid: 'PA_1',
      at: new Date(),
    });
    expect((await focus(session._id, 60)).status).toBe(204);
    // Only a few seconds have passed since the last one: this claim is too large and is ignored.
    expect((await focus(session._id, 60)).status).toBe(204);
    expect(await rowOf(session._id, w.student._id)).toMatchObject({ focusedSec: 60 });
    expect(await EngagementDaily.findOne({ studentId: w.student._id }, { focusedSec: 1 }).lean()).toMatchObject({
      focusedSec: 60,
    });
    await signInAs(w.outsider);
    expect((await focus(session._id, 30)).status).toBe(404);
  });

  it('ignores a student who has left', async () => {
    const w = await world();
    const session = await liveClass(w);
    await hook({
      type: 'joined',
      host: false,
      roomName: session.roomName,
      userId: String(w.student._id),
      sid: 'PA_1',
      at: new Date(),
    });
    await hook({
      type: 'left',
      roomName: session.roomName,
      userId: String(w.student._id),
      sid: 'PA_1',
      joinedAt: new Date(),
      at: new Date(),
    });
    await signInAs(w.student);
    expect((await focus(session._id, 30)).status).toBe(204);
    expect(await rowOf(session._id, w.student._id)).toMatchObject({ focusedSec: 0 });
  });
});

describe('raised hands (M03b)', () => {
  it('lets a student of the class raise a hand while the class runs, and nobody else', async () => {
    const w = await world();
    const session = await liveClass(w, { scheduledEnd: new Date(Date.now() + 30 * MIN) });
    const ref = { offeringId: w.offeringId, sessionId: String(session._id) };
    await signInAs(w.student);
    setHand.mockClear();
    expect(await raiseHand(ref)).toMatchObject({ ok: true });
    expect(setHand).toHaveBeenCalledWith(session.roomName, String(w.student._id), expect.any(Date));
    await signInAs(w.faculty);
    expect(await raiseHand(ref)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    await signInAs(w.outsider);
    await expect(raiseHand(ref)).rejects.toThrow(NOT_FOUND);
    await LiveSession.updateOne({ _id: session._id }, { $set: { status: 'ended', endedAt: new Date() } });
    await signInAs(w.student);
    expect(await raiseHand(ref)).toMatchObject({ ok: false, code: 'CLOSED' });
  });

  it('lets a student lower only their own hand, and a host lower anyone’s', async () => {
    const w = await world();
    const session = await liveClass(w, { scheduledEnd: new Date(Date.now() + 30 * MIN) });
    const lower = (...ids: { _id: unknown }[]) =>
      lowerHands({
        offeringId: w.offeringId,
        sessionId: String(session._id),
        'identity[]': ids.map((u) => String(u._id)),
      });
    setHand.mockClear();
    await signInAs(w.student);
    expect(await lower(w.student)).toMatchObject({ ok: true });
    expect(setHand).toHaveBeenLastCalledWith(session.roomName, String(w.student._id), null);
    await expect(lower(w.second)).rejects.toThrow(NOT_FOUND);
    await signInAs(w.hod);
    await expect(lower(w.student)).rejects.toThrow(NOT_FOUND);
    for (const host of [w.faculty, w.admin]) {
      await signInAs(host);
      setHand.mockClear();
      expect(await lower(w.student, w.second, w.student)).toMatchObject({ ok: true });
      expect(setHand.mock.calls.map(([, identity]) => identity)).toEqual([String(w.student._id), String(w.second._id)]);
    }
  });
});

describe('host controls (M03c T2)', () => {
  async function running() {
    const w = await world();
    const session = await liveClass(w, { scheduledEnd: new Date(Date.now() + 30 * MIN) });
    return { w, session, ref: { offeringId: w.offeringId, sessionId: String(session._id) } };
  }

  it('lets a host mute one person, who is told who did it, and nobody else mute anyone', async () => {
    const { w, session, ref } = await running();
    const identity = String(w.second._id);
    await signInAs(w.student);
    expect(await muteParticipant({ ...ref, identity })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    await signInAs(w.hod);
    await expect(muteParticipant({ ...ref, identity })).rejects.toThrow(NOT_FOUND);
    await signInAs(w.faculty);
    muteMicrophone.mockClear();
    tell.mockClear();
    expect(await muteParticipant({ ...ref, identity })).toMatchObject({ ok: true });
    expect(muteMicrophone).toHaveBeenCalledWith(session.roomName, identity);
    expect(tell).toHaveBeenCalledWith(session.roomName, 'notice', `${w.faculty.name} muted your microphone`, [
      identity,
    ]);
  });

  it('mutes everyone but the host who asked, from the worker', async () => {
    const { w, session, ref } = await running();
    room.people = [
      { identity: String(w.faculty._id), host: true, microphones: ['TR_f'] },
      { identity: String(w.student._id), host: false, microphones: ['TR_s'] },
      { identity: String(w.second._id), host: false, microphones: [] },
    ];
    await signInAs(w.faculty);
    muteMicrophone.mockClear();
    tell.mockClear();
    expect(await muteEveryone(ref)).toMatchObject({ ok: true });
    const others = [String(w.student._id), String(w.second._id)];
    await vi.waitFor(() =>
      expect(tell).toHaveBeenCalledWith(session.roomName, 'notice', `${w.faculty.name} muted everyone`, others),
    );
    expect(muteMicrophone.mock.calls).toEqual([
      [session.roomName, others[0], ['TR_s']],
      [session.roomName, others[1], []],
    ]);
  });

  it('saves what students may do and applies it to those in the room and to those who join', async () => {
    const { w, session, ref } = await running();
    room.people = [
      { identity: String(w.faculty._id), host: true, microphones: [] },
      { identity: String(w.student._id), host: false, microphones: [] },
    ];
    await signInAs(w.student);
    expect(await setStudentRight({ ...ref, right: 'unmute', allowed: false })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    await signInAs(w.faculty);
    setRights.mockClear();
    tell.mockClear();
    expect(await setStudentRight({ ...ref, right: 'unmute', allowed: false })).toMatchObject({ ok: true });
    const rights = { share: true, unmute: false, chat: true };
    expect((await LiveSession.findById(session._id).lean())?.studentsMay).toEqual(rights);
    expect(tell).toHaveBeenCalledWith(session.roomName, 'controls', 'unmute');
    await vi.waitFor(() => expect(setRights).toHaveBeenCalledWith(session.roomName, String(w.student._id), rights));
    expect(setRights).toHaveBeenCalledTimes(1);
    expect((await getSession(w.offeringId, String(session._id))).controls).toEqual({ rights, removed: [] });
    // A student joining now gets a token without the microphone, and the engine is told again on their join in case
    // their token was issued just before the change. A host's join changes nothing.
    await signInAs(w.second);
    joinToken.mockClear();
    await getSession(w.offeringId, String(session._id));
    expect(joinToken).toHaveBeenCalledWith(expect.objectContaining({ role: 'participant', rights }));
    expect((await getSession(w.offeringId, String(session._id))).controls).toBeNull();
    setRights.mockClear();
    const join = (userId: unknown, host: boolean) =>
      hook({ type: 'joined', host, roomName: session.roomName, userId: String(userId), sid: 'PA_j', at: new Date() });
    await join(w.second._id, false);
    await join(w.faculty._id, true);
    expect(setRights.mock.calls).toEqual([[session.roomName, String(w.second._id), rights]]);
  });

  it('keeps a removed student out until a host lets them back, audited both ways', async () => {
    const { w, session, ref } = await running();
    const identity = String(w.student._id);
    const detail = () => getSession(w.offeringId, String(session._id));
    await signInAs(w.faculty);
    for (const other of [w.faculty, w.outsider]) {
      expect(await removeParticipant({ ...ref, identity: String(other._id) })).toMatchObject({
        ok: false,
        code: 'VALIDATION',
      });
    }
    removeFromRoom.mockClear();
    expect(await removeParticipant({ ...ref, identity })).toMatchObject({ ok: true });
    expect(await removeParticipant({ ...ref, identity })).toMatchObject({ ok: true });
    expect(removeFromRoom).toHaveBeenCalledWith(session.roomName, identity);
    expect(await AuditLog.countDocuments({ action: 'live.removed', entityId: String(session._id) })).toBe(1);
    expect((await detail()).controls?.removed).toEqual([{ id: identity, name: w.student.name, at: expect.any(Date) }]);
    // No token; one they kept is removed again on their join, which is not counted.
    await signInAs(w.student);
    expect(await detail()).toMatchObject({ join: null, removed: true });
    removeFromRoom.mockClear();
    await hook({
      type: 'joined',
      host: false,
      roomName: session.roomName,
      userId: identity,
      sid: 'PA_r',
      at: new Date(),
    });
    expect(removeFromRoom).toHaveBeenCalledWith(session.roomName, identity);
    expect(await rowOf(session._id, w.student._id)).toBeNull();
    await signInAs(w.admin);
    expect(await allowBack({ ...ref, identity })).toMatchObject({ ok: true });
    expect(await AuditLog.countDocuments({ action: 'live.allowed_back', entityId: String(session._id) })).toBe(1);
    await signInAs(w.student);
    expect(await detail()).toMatchObject({ join: { token: `participant-${identity}` }, removed: false });
  });

  it('removes at most a hundred people from one class', async () => {
    const { w, session, ref } = await running();
    const full = Array.from({ length: 100 }, () => ({ userId: newId(), at: new Date(), by: w.faculty._id }));
    await LiveSession.updateOne({ _id: session._id }, { $set: { removed: full } });
    await signInAs(w.faculty);
    expect(await removeParticipant({ ...ref, identity: String(w.student._id) })).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
  });
});

describe('who sees what (09 §2–3)', () => {
  it('gives join tokens to the teacher, enrolled students and admins only while the class is live', async () => {
    const w = await world();
    const session = await liveClass(w, {
      scheduledStart: new Date(Date.now() - 10 * MIN),
      scheduledEnd: new Date(Date.now() + 50 * MIN),
    });
    await signInAs(w.faculty);
    expect((await getSession(w.offeringId, String(session._id))).join?.token).toBe(`host-${w.faculty._id}`);
    await signInAs(w.student);
    expect((await getSession(w.offeringId, String(session._id))).join?.token).toBe(`participant-${w.student._id}`);
    // An admin joins any class as host (Aniket, 17 Oct 2026); the HoD follows it without a token.
    await signInAs(w.admin);
    expect(await getSession(w.offeringId, String(session._id))).toMatchObject({
      view: 'oversee',
      canManage: true,
      join: { token: `host-${w.admin._id}` },
    });
    await signInAs(w.hod);
    expect(await getSession(w.offeringId, String(session._id))).toMatchObject({
      view: 'oversee',
      canManage: false,
      join: null,
    });
    await LiveSession.updateOne({ _id: session._id }, { $set: { status: 'ended', endedAt: new Date() } });
    await signInAs(w.admin);
    expect((await getSession(w.offeringId, String(session._id))).join).toBeNull();
    await signInAs(w.outsider);
    await expect(getSession(w.offeringId, String(session._id))).rejects.toThrow(NOT_FOUND);
  });

  it("shows a student their own attendance and nobody else's", async () => {
    const w = await world();
    const session = await liveClass(w);
    await hook({
      type: 'joined',
      host: false,
      roomName: session.roomName,
      userId: String(w.student._id),
      sid: 'PA_1',
      at: at(session, 0),
    });
    await LiveSession.updateOne({ _id: session._id }, { $set: { status: 'ended', endedAt: at(session, 60) } });
    await finalize(session._id);
    await signInAs(w.student);
    const list = await listSessions(w.offeringId, 1);
    expect(list.mine).toEqual({ attended: 1, held: 1, pct: 100 });
    expect(list.past[0]).toMatchObject({ state: 'ended', mine: { status: 'present' }, present: 0, recorded: 0 });
    await expect(getAttendanceSheet(w.offeringId, String(session._id), 1)).rejects.toThrow(NOT_FOUND);
    await signInAs(w.second);
    expect((await listSessions(w.offeringId, 1)).mine).toEqual({ attended: 0, held: 1, pct: 0 });
  });

  it('gives the teacher the class list in roll-number order with the stored marks', async () => {
    const w = await world();
    await Promise.all([
      w.student.updateOne({ rollNo: `B${w.student._id}` }),
      w.second.updateOne({ rollNo: `A${w.second._id}` }),
    ]);
    const session = await liveClass(w, { attendanceMode: 'manual' });
    await hook({
      type: 'joined',
      host: false,
      roomName: session.roomName,
      userId: String(w.student._id),
      sid: 'PA_1',
      at: new Date(),
    });
    await signInAs(w.faculty);
    const sheet = await getAttendanceSheet(w.offeringId, String(session._id), 1);
    expect(sheet).toMatchObject({ total: 2, unmarked: 2 });
    // M03 decision 2: in a class the teacher marks, those who joined start ticked present.
    expect(sheet.rows.map((r) => [r.studentId, r.prefill, r.inClass])).toEqual([
      [String(w.second._id), 'absent', false],
      [String(w.student._id), 'present', true],
    ]);
    await signInAs(w.hod);
    expect((await getAttendanceSheet(w.offeringId, String(session._id), 1)).total).toBe(2);
  });

  it("puts finished classes in the roster's attendance and today's classes on Home", async () => {
    const w = await world();
    const done = await liveClass(w);
    await hook({
      type: 'joined',
      host: false,
      roomName: done.roomName,
      userId: String(w.student._id),
      sid: 'PA_1',
      at: at(done, 0),
    });
    await LiveSession.updateOne({ _id: done._id }, { $set: { status: 'ended', endedAt: at(done, 60) } });
    await finalize(done._id);
    // A class in progress has no status yet, so it counts for nobody.
    const running = await liveClass(w, { scheduledStart: new Date(), scheduledEnd: new Date(Date.now() + 60 * MIN) });
    await hook({
      type: 'joined',
      host: false,
      roomName: running.roomName,
      userId: String(w.second._id),
      sid: 'PA_2',
      at: new Date(),
    });
    await signInAs(w.faculty);
    const { rows } = await listRoster(w.offeringId, 1);
    const byStudent = new Map(rows.map((r) => [r.name, r.live]));
    expect(byStudent.get(w.student.name)).toEqual({ attended: 1, held: 1, pct: 100 });
    expect(byStudent.get(w.second.name)).toEqual({ attended: 0, held: 1, pct: 0 });
    await signInAs(w.student);
    expect((await listTodaysLiveSessions()).map((c) => [c.id, c.status])).toContainEqual([String(running._id), 'live']);
    await signInAs(w.outsider);
    expect((await listTodaysLiveSessions()).some((c) => c.id === String(running._id))).toBe(false);
    // An admin teaches none of these courses but sees the class running now, to join it. The list holds ten, earliest
    // end first, and earlier tests in this file leave classes live: end those first.
    await LiveSession.updateMany({ _id: { $ne: running._id }, status: 'live' }, { $set: { status: 'ended' } });
    await signInAs(w.admin);
    expect((await listTodaysLiveSessions()).map((c) => [c.id, c.status])).toContainEqual([String(running._id), 'live']);
  });
});
