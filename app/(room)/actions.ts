'use server';

import { refresh } from 'next/cache';
import mongoose, { Types } from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { requireRoomHost, roomAccess } from '@/lib/auth/access';
import { endLiveSession } from '@/lib/data/live';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { buildKey } from '@/lib/domain/uploads';
import {
  muteMicrophone,
  recordingEnabled,
  removeFromRoom,
  setHand,
  startRecording as recordRoom,
  stopRecording as stopRoomRecording,
  tell,
} from '@/lib/integrations/live';
import { Enrollment } from '@/lib/models/enrollment';
import { LiveSession } from '@/lib/models/live-session';
import { queueLiveControl } from '@/lib/queue';
import { ASSIGNABLE_ROLES } from '@/lib/schemas/common';
import { MAX_RECORDINGS, MAX_REMOVED, RoomPeople, RoomPerson, RoomRef, RoomRight } from '@/lib/schemas/live';

// M03c T4: the room's actions, for a class and a meeting alike. Each takes the session; roomAccess works out from it who
// the viewer is there (a class through its course, a meeting through its people). Anyone with an LMS account may be in
// a meeting, so every role but a test candidate reaches these; the access check decides.

async function liveRoom(sessionId: string) {
  await db();
  const session = await LiveSession.findById(sessionId, {
    kind: 1,
    status: 1,
    roomName: 1,
    offeringId: 1,
    meeting: 1,
  }).lean();
  if (session?.status !== 'live') {
    throw new AppError('CLOSED', `The ${session?.kind === 'meeting' ? 'meeting' : 'class'} is not running.`);
  }
  return session;
}

// M03b: someone taking part raises a hand; everyone in the room sees it, in the order raised. Hosts do not.
export const raiseHand = action({ input: RoomRef, roles: ASSIGNABLE_ROLES }, async ({ sessionId }, viewer) => {
  if ((await roomAccess(viewer, sessionId)).role !== 'participant') {
    throw new AppError('FORBIDDEN', 'Only the people taking part raise a hand.');
  }
  await setHand((await liveRoom(sessionId)).roomName, viewer.id, new Date());
});

// Anyone lowers their own hand; a host lowers anyone's, one or all.
export const lowerHands = action(
  { input: RoomPeople, roles: ASSIGNABLE_ROLES },
  async ({ sessionId, 'identity[]': identities }, viewer) => {
    if (identities.length === 1 && identities[0] === viewer.id) await roomAccess(viewer, sessionId);
    else await requireRoomHost(viewer, sessionId);
    const { roomName } = await liveRoom(sessionId);
    await Promise.all([...new Set(identities)].map((identity) => setHand(roomName, identity, null)));
  },
);

// --- Host controls (M03c T2). Every host sees a change at once: the room tells their browsers to reload the controls. ---

// As in Google Meet, a host turns someone's microphone off, not on; they are told who did it.
export const muteParticipant = action(
  { input: RoomPerson, roles: ASSIGNABLE_ROLES },
  async ({ sessionId, identity }, viewer) => {
    await requireRoomHost(viewer, sessionId);
    const { roomName } = await liveRoom(sessionId);
    if (await muteMicrophone(roomName, identity)) {
      await tell(roomName, 'notice', `${viewer.name} muted your microphone`, [identity]);
    }
  },
);

// Everyone's microphone but the host's own; the worker reaches them all (04 §3).
export const muteEveryone = action({ input: RoomRef, roles: ASSIGNABLE_ROLES }, async ({ sessionId }, viewer) => {
  await requireRoomHost(viewer, sessionId);
  await liveRoom(sessionId);
  await queueLiveControl({ op: 'muteAll', sessionId, byId: viewer.id, byName: viewer.name.slice(0, 120) });
});

// What the others may do: saved on the session, so people who join later get it too, and applied by the worker to
// those already in the room.
export const setStudentRight = action(
  { input: RoomRight, roles: ASSIGNABLE_ROLES },
  async ({ sessionId, right, allowed }, viewer) => {
    await requireRoomHost(viewer, sessionId);
    const { roomName } = await liveRoom(sessionId);
    await LiveSession.updateOne({ _id: sessionId, status: 'live' }, { $set: { [`studentsMay.${right}`]: allowed } });
    await queueLiveControl({ op: 'rights', sessionId });
    await tell(roomName, 'controls', right);
    refresh();
  },
);

// M03c decision 3: a removed person is disconnected and stays out until a host lets them back; in a class their time
// in the room so far still counts. Saved before the disconnect, so a quick rejoin is refused too. Audited. A class's
// hosts remove its students; a meeting's hosts remove its members and guests.
export const removeParticipant = action(
  { input: RoomPerson, roles: ASSIGNABLE_ROLES },
  async ({ sessionId, identity }, viewer) => {
    const { offeringId } = await requireRoomHost(viewer, sessionId);
    const session = await liveRoom(sessionId);
    const meeting = session.meeting;
    const removable = meeting
      ? meeting.memberIds.some((id) => id.equals(identity)) || meeting.guests.some((g) => g._id.equals(identity))
      : Boolean(await Enrollment.exists({ offeringId, studentId: identity, status: 'active' }));
    if (!removable) {
      throw new AppError(
        'VALIDATION',
        meeting
          ? 'Only the people invited to this meeting can be removed; hosts cannot.'
          : 'Only students of this course can be removed from the class.',
      );
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
          current?.status === 'live' ? `At most ${MAX_REMOVED} people can be removed at once.` : 'It is not running.',
        );
      }
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'live.removed',
          entity: 'live_session',
          entityId: sessionId,
          ...(offeringId ? { offeringId } : {}),
          after: meeting ? { identity } : { studentId: identity },
        },
        txn,
      );
    });
    await removeFromRoom(session.roomName, identity);
    await tell(session.roomName, 'controls', 'removed');
    refresh();
  },
);

export const allowBack = action(
  { input: RoomPerson, roles: ASSIGNABLE_ROLES },
  async ({ sessionId, identity }, viewer) => {
    const { offeringId, kind } = await requireRoomHost(viewer, sessionId);
    const session = await LiveSession.findById(sessionId, { status: 1, roomName: 1 }).lean();
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
          ...(offeringId ? { offeringId } : {}),
          before: kind === 'meeting' ? { identity } : { studentId: identity },
        },
        txn,
      );
    });
    if (session?.status === 'live') await tell(session.roomName, 'controls', 'allowed');
    refresh();
  },
);

// The room's "End … for everyone": the class or the meeting ends for everyone and is finalized.
export const endRoom = action({ input: RoomRef, roles: ASSIGNABLE_ROLES }, async ({ sessionId }, viewer) => {
  await requireRoomHost(viewer, sessionId);
  await db();
  const session = await LiveSession.findById(sessionId, { status: 1, roomName: 1 }).lean();
  if (!session) throw new AppError('NOT_FOUND', 'Not found.');
  await endLiveSession(session);
  refresh();
});

// --- The lobby (M03c T4, decision 7): guests a host lets in come straight back while the meeting runs; a guest turned
// away may ask again. Not audited: letting someone into a call changes no record (A-97). ---

export const admitGuests = action(
  { input: RoomPeople, roles: ASSIGNABLE_ROLES },
  async ({ sessionId, 'identity[]': identities }, viewer) => {
    await requireRoomHost(viewer, sessionId);
    const { roomName } = await liveRoom(sessionId);
    const ids = identities.map((id) => new Types.ObjectId(id));
    await LiveSession.updateOne(
      { _id: sessionId, status: 'live' },
      {
        $set: { 'meeting.guests.$[g].admittedAt': new Date() },
        $unset: { 'meeting.guests.$[g].deniedAt': '' },
        $pull: { waiting: { guestId: { $in: ids } } },
      },
      { arrayFilters: [{ 'g._id': { $in: ids } }] },
    );
    await tell(roomName, 'controls', 'lobby');
    refresh();
  },
);

export const denyGuest = action(
  { input: RoomPerson, roles: ASSIGNABLE_ROLES },
  async ({ sessionId, identity }, viewer) => {
    await requireRoomHost(viewer, sessionId);
    const { roomName } = await liveRoom(sessionId);
    await LiveSession.updateOne(
      { _id: sessionId, status: 'live' },
      {
        $set: { 'meeting.guests.$[g].deniedAt': new Date() },
        $pull: { waiting: { guestId: new Types.ObjectId(identity) } },
      },
      { arrayFilters: [{ 'g._id': new Types.ObjectId(identity) }] },
    );
    await tell(roomName, 'controls', 'lobby');
    refresh();
  },
);

// --- Recording (M03c T5, decision 5): a host records the room, one recording at a time, straight to the bucket.
// Everyone in the room is told; the recording appears on the class's or meeting's page once it is saved. Audited. ---

export const startRecording = action({ input: RoomRef, roles: ASSIGNABLE_ROLES }, async ({ sessionId }, viewer) => {
  const { offeringId, kind } = await requireRoomHost(viewer, sessionId);
  if (!recordingEnabled()) throw new AppError('CONFLICT', 'Recording is not set up on this server.');
  const { roomName } = await liveRoom(sessionId);
  const key = buildKey('live-recording', sessionId, viewer.id, crypto.randomUUID(), 'video/mp4');
  // Claimed first, so two hosts pressing at once start one recording.
  const claimed = await LiveSession.updateOne(
    {
      _id: sessionId,
      status: 'live',
      'recordings.status': { $ne: 'recording' },
      [`recordings.${MAX_RECORDINGS - 1}`]: { $exists: false },
    },
    { $push: { recordings: { key, by: viewer.id, startedAt: new Date(), status: 'recording' } } },
  );
  if (claimed.matchedCount === 0) {
    throw new AppError('CONFLICT', `It is already being recorded, or has its ${MAX_RECORDINGS} recordings.`);
  }
  let egressId: string | null = null;
  try {
    egressId = await recordRoom(roomName, key);
  } finally {
    if (!egressId) await LiveSession.updateOne({ _id: sessionId }, { $pull: { recordings: { key } } });
  }
  if (!egressId) throw new AppError('CLOSED', 'Nobody is in the room yet.');
  await LiveSession.updateOne(
    { _id: sessionId, 'recordings.key': key },
    { $set: { 'recordings.$.egressId': egressId } },
  );
  await writeAudit({
    actorId: viewer.id,
    action: 'live.recording_started',
    entity: 'live_session',
    entityId: sessionId,
    ...(offeringId ? { offeringId } : {}),
    after: { key },
  });
  const noun = kind === 'meeting' ? 'meeting' : 'class';
  await tell(roomName, 'notice', `${viewer.name} started recording this ${noun}. It goes on the ${noun} page.`);
  refresh();
});

export const stopRecording = action({ input: RoomRef, roles: ASSIGNABLE_ROLES }, async ({ sessionId }, viewer) => {
  const { offeringId } = await requireRoomHost(viewer, sessionId);
  await db();
  const session = await LiveSession.findById(sessionId, { roomName: 1, recordings: 1 }).lean();
  const running = session?.recordings?.find((r) => r.status === 'recording');
  if (!session || !running) return refresh();
  if (running.egressId) await stopRoomRecording(session.roomName, running.egressId);
  await writeAudit({
    actorId: viewer.id,
    action: 'live.recording_stopped',
    entity: 'live_session',
    entityId: sessionId,
    ...(offeringId ? { offeringId } : {}),
    after: { key: running.key },
  });
  await tell(session.roomName, 'notice', `${viewer.name} stopped recording`);
  refresh();
});
