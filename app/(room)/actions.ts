'use server';

import { refresh } from 'next/cache';
import mongoose, { Types } from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { requireRoomHost, roomAccess } from '@/lib/auth/access';
import { endLiveSession } from '@/lib/data/live';
import { settleRecordings } from '@/lib/data/recordings';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { buildKey } from '@/lib/domain/uploads';
import {
  activeRecordings,
  joinToken,
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
import { PollAnswer } from '@/lib/models/poll-answer';
import { queueLiveControl } from '@/lib/queue';
import { ASSIGNABLE_ROLES } from '@/lib/schemas/common';
import {
  ALL_RIGHTS,
  AnswerPoll,
  BoardDrawing,
  BREAKOUT_CLOSING_MS,
  BreakoutMessage,
  breakoutRoomName,
  CreatePoll,
  MAX_RECORDINGS,
  MAX_REMOVED,
  OpenBoard,
  OpenBreakouts,
  POLL_LIMITS,
  PollRef,
  RoomPeople,
  RoomPerson,
  RoomRef,
  RoomRight,
  RoomTokenRef,
} from '@/lib/schemas/live';

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
  const session = await LiveSession.findById(sessionId, { status: 1, roomName: 1, breakout: 1 }).lean();
  if (!session) throw new AppError('NOT_FOUND', 'Not found.');
  await endLiveSession(session);
  refresh();
});

// --- Recording (M03c T5, decision 5): a host records the room, one recording at a time, straight to the bucket.
// Everyone in the room is told; the recording appears on the class's or meeting's page once it is saved. Audited. ---

const SETTLE_AFTER_STOP_MS = 2 * 60_000;

export const startRecording = action({ input: RoomRef, roles: ASSIGNABLE_ROLES }, async ({ sessionId }, viewer) => {
  const { offeringId, kind } = await requireRoomHost(viewer, sessionId);
  if (!recordingEnabled()) throw new AppError('CONFLICT', 'Recording is not set up on this server.');
  const { roomName } = await liveRoom(sessionId);
  // M03c T13: the engine says what is recording. A row it no longer runs (its webhook lost) is settled, not a block.
  if (await LiveSession.exists({ _id: sessionId, 'recordings.status': 'recording' })) {
    if ((await activeRecordings(roomName)).length > 0) throw new AppError('CONFLICT', 'It is already being recorded.');
    await settleRecordings(sessionId, new Date());
  }
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
    // A start that timed out may have started all the same: the engine is asked for a recording writing this file.
    egressId = await recordRoom(roomName, key).catch(async (error: unknown) => {
      const started = (await activeRecordings(roomName)).find((r) => r.key === key);
      if (!started) throw error;
      return started.egressId;
    });
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

// M03c T13: every recording the engine runs for the room stops, whether or not the LMS stored its id. The engine saves
// the file and says so (the webhook); the worker settles the row in two minutes in case that never arrives.
export const stopRecording = action({ input: RoomRef, roles: ASSIGNABLE_ROLES }, async ({ sessionId }, viewer) => {
  const { offeringId } = await requireRoomHost(viewer, sessionId);
  const { roomName } = await liveRoom(sessionId);
  const running = await activeRecordings(roomName);
  if (running.length === 0) {
    await settleRecordings(sessionId, new Date());
    throw new AppError('CONFLICT', 'Nothing is being recorded.');
  }
  await Promise.all(running.map((r) => stopRoomRecording(roomName, r.egressId)));
  await queueLiveControl({ op: 'settleRecordings', sessionId }, SETTLE_AFTER_STOP_MS);
  await writeAudit({
    actorId: viewer.id,
    action: 'live.recording_stopped',
    entity: 'live_session',
    entityId: sessionId,
    ...(offeringId ? { offeringId } : {}),
    after: { keys: running.map((r) => r.key) },
  });
  await tell(roomName, 'notice', `${viewer.name} stopped recording. It goes on the page in a minute or two.`);
  refresh();
});

// --- Polls (M03c T6, mock-ups R3-B A and R3-C): one open at a time. Starting, ending and showing results tell everyone
// in the room (`poll`), whose pages read the polls again; answers are counted for hosts as they come in. Not audited:
// a poll is no record (01 §4). ---

export const createPoll = action(
  { input: CreatePoll, roles: ASSIGNABLE_ROLES },
  async ({ sessionId, question, 'option[]': options, showResults }, viewer) => {
    await requireRoomHost(viewer, sessionId);
    const { roomName } = await liveRoom(sessionId);
    const written = await LiveSession.updateOne(
      {
        _id: sessionId,
        status: 'live',
        'polls.status': { $ne: 'open' },
        [`polls.${POLL_LIMITS.polls - 1}`]: { $exists: false },
      },
      {
        $push: {
          polls: {
            question,
            options: options.map((text) => ({ text })),
            showResults,
            status: 'open',
            by: viewer.id,
            startedAt: new Date(),
          },
        },
      },
    );
    if (written.matchedCount === 0) {
      throw new AppError('CONFLICT', `End the open poll first. A class or meeting holds at most ${POLL_LIMITS.polls}.`);
    }
    await tell(roomName, 'poll', 'started');
    await tell(roomName, 'notice', `${viewer.name} started a poll`);
    refresh();
  },
);

// The people taking part answer, and may change their answer while the poll is open; hosts do not.
export const answerPoll = action(
  { input: AnswerPoll, roles: ASSIGNABLE_ROLES },
  async ({ sessionId, pollId, optionId }, viewer) => {
    if ((await roomAccess(viewer, sessionId)).role !== 'participant') {
      throw new AppError('FORBIDDEN', 'Only the people taking part answer a poll.');
    }
    await liveRoom(sessionId);
    const open = await LiveSession.exists({
      _id: sessionId,
      polls: { $elemMatch: { _id: pollId, status: 'open', 'options._id': optionId } },
    });
    if (!open) throw new AppError('CLOSED', 'This poll has ended.');
    await PollAnswer.updateOne(
      { pollId, userId: viewer.id },
      { $set: { optionId }, $setOnInsert: { sessionId } },
      { upsert: true },
    );
    refresh();
  },
);

export const endPoll = action({ input: PollRef, roles: ASSIGNABLE_ROLES }, async ({ sessionId, pollId }, viewer) => {
  await requireRoomHost(viewer, sessionId);
  const { roomName } = await liveRoom(sessionId);
  await LiveSession.updateOne(
    { _id: sessionId },
    { $set: { 'polls.$[p].status': 'ended', 'polls.$[p].endedAt': new Date() } },
    { arrayFilters: [{ 'p._id': new Types.ObjectId(pollId), 'p.status': 'open' }] },
  );
  await tell(roomName, 'poll', 'ended');
  refresh();
});

export const showPollResults = action(
  { input: PollRef, roles: ASSIGNABLE_ROLES },
  async ({ sessionId, pollId }, viewer) => {
    await requireRoomHost(viewer, sessionId);
    const { roomName } = await liveRoom(sessionId);
    await LiveSession.updateOne(
      { _id: sessionId },
      { $set: { 'polls.$[p].sharedAt': new Date() } },
      { arrayFilters: [{ 'p._id': new Types.ObjectId(pollId) }] },
    );
    await tell(roomName, 'poll', 'shared');
    refresh();
  },
);

// --- Breakout rooms (M03c T7, mock-up R3-D): a host sends the people taking part to 2–20 rooms, each its own LiveKit
// room named after the class (time there counts as time in the class: the webhook maps it back). People move with a
// token for their room; hosts may visit any. Everyone returns when the rooms close: at the time limit, or a minute
// after a host closes them; the worker then closes the LiveKit rooms. Guests stay in the main room (A-201). ---

export const openBreakouts = action(
  { input: OpenBreakouts, roles: ASSIGNABLE_ROLES },
  async ({ sessionId, rooms, limitMin, 'assign[]': assign }, viewer) => {
    const { kind, offeringId } = await requireRoomHost(viewer, sessionId);
    const session = await liveRoom(sessionId);
    const assignments = assign.map((entry) => {
      const [userId, room] = entry.split(':');
      return { userId, room: Number(room) };
    });
    const ids = new Set(assignments.map((a) => a.userId));
    if (ids.size !== assignments.length || assignments.some((a) => a.room < 1 || a.room > rooms)) {
      throw new AppError('VALIDATION', 'Put each person in exactly one of the rooms.');
    }
    const taking =
      kind === 'meeting'
        ? (session.meeting?.memberIds ?? []).map(String).filter((id) => ids.has(id))
        : (await Enrollment.distinct('studentId', { offeringId, status: 'active', studentId: { $in: [...ids] } })).map(
            String,
          );
    if (taking.length !== ids.size) {
      throw new AppError('VALIDATION', 'Only the people taking part go to breakout rooms.');
    }
    const now = new Date();
    const closesAt = limitMin > 0 ? new Date(now.getTime() + limitMin * 60_000) : undefined;
    const written = await LiveSession.updateOne(
      {
        _id: sessionId,
        status: 'live',
        $or: [{ breakout: null }, { 'breakout.closedAt': { $ne: null } }, { 'breakout.closesAt': { $lte: now } }],
      },
      { $set: { breakout: { rooms, assignments, openedAt: now, closesAt, by: viewer.id } } },
    );
    if (written.matchedCount === 0)
      throw new AppError('CONFLICT', 'Breakout rooms are already open. Close them first.');
    if (closesAt)
      await queueLiveControl({ op: 'closeBreakouts', sessionId }, closesAt.getTime() - now.getTime() + 15_000);
    await tell(session.roomName, 'breakout', 'opened');
    await tell(session.roomName, 'notice', `${viewer.name} opened ${rooms} breakout rooms`);
    refresh();
  },
);

// Everyone returns a minute from now (or sooner, if the time limit ends first).
export const closeBreakouts = action({ input: RoomRef, roles: ASSIGNABLE_ROLES }, async ({ sessionId }, viewer) => {
  await requireRoomHost(viewer, sessionId);
  const session = await liveRoom(sessionId);
  const breakout = (await LiveSession.findById(sessionId, { breakout: 1 }).lean())?.breakout;
  const now = new Date();
  if (!breakout || breakout.closedAt || (breakout.closesAt && breakout.closesAt <= now)) return refresh();
  const closesAt = new Date(Math.min(breakout.closesAt?.getTime() ?? Infinity, now.getTime() + BREAKOUT_CLOSING_MS));
  await LiveSession.updateOne(
    { _id: sessionId, 'breakout.closedAt': null },
    { $set: { 'breakout.closesAt': closesAt } },
  );
  await queueLiveControl({ op: 'closeBreakouts', sessionId }, closesAt.getTime() - now.getTime() + 15_000);
  for (let room = 0; room <= breakout.rooms; room++) {
    await tell(breakoutRoomName(session.roomName, room), 'breakout', 'closing');
  }
  refresh();
});

export const messageBreakouts = action(
  { input: BreakoutMessage, roles: ASSIGNABLE_ROLES },
  async ({ sessionId, text }, viewer) => {
    await requireRoomHost(viewer, sessionId);
    const session = await liveRoom(sessionId);
    const rooms = (await LiveSession.findById(sessionId, { breakout: 1 }).lean())?.breakout?.rooms ?? 0;
    for (let room = 1; room <= rooms; room++) {
      await tell(breakoutRoomName(session.roomName, room), 'notice', `${viewer.name} to every room: ${text}`);
    }
  },
);

// A token for the class or meeting itself (room 0) or a breakout room: one's own, or any for a host.
export const roomToken = action(
  { input: RoomTokenRef, roles: ASSIGNABLE_ROLES },
  async ({ sessionId, room }, viewer) => {
    const { role } = await roomAccess(viewer, sessionId);
    if (role === 'watch') throw new AppError('FORBIDDEN', 'You follow this class from its page.');
    const session = await LiveSession.findById(sessionId, {
      status: 1,
      roomName: 1,
      studentsMay: 1,
      breakout: 1,
      removed: { $elemMatch: { userId: new Types.ObjectId(viewer.id) } },
    }).lean();
    if (session?.status !== 'live') throw new AppError('CLOSED', 'It is not running.');
    if (session.removed?.length) throw new AppError('FORBIDDEN', 'A host removed you.');
    if (room > 0) {
      const breakout = session.breakout;
      const now = new Date();
      if (!breakout || breakout.closedAt || (breakout.closesAt && breakout.closesAt <= now) || room > breakout.rooms) {
        throw new AppError('CLOSED', 'The breakout rooms are closed.');
      }
      if (role !== 'host' && !breakout.assignments.some((a) => a.userId.equals(viewer.id) && a.room === room)) {
        throw new AppError('FORBIDDEN', 'This is not your breakout room.');
      }
    }
    return joinToken({
      roomName: breakoutRoomName(session.roomName, room),
      userId: viewer.id,
      name: viewer.name,
      role: role === 'host' ? 'host' : 'participant',
      rights: { ...ALL_RIGHTS, ...session.studentsMay },
    });
  },
);

// --- The whiteboard (M03c T8, mock-up R3-E): a host opens it on the stage for everyone and decides whether the others
// may draw; closing it ends it for everyone. Its drawing goes from browser to browser and is not stored. ---

export const openBoard = action(
  { input: OpenBoard, roles: ASSIGNABLE_ROLES },
  async ({ sessionId, studentsDraw }, viewer) => {
    await requireRoomHost(viewer, sessionId);
    const { roomName } = await liveRoom(sessionId);
    await LiveSession.updateOne(
      { _id: sessionId, status: 'live', board: null },
      { $set: { board: { by: viewer.id, openedAt: new Date(), studentsDraw } } },
    );
    await tell(roomName, 'board', 'opened');
    refresh();
  },
);

export const setBoardDrawing = action(
  { input: BoardDrawing, roles: ASSIGNABLE_ROLES },
  async ({ sessionId, allowed }, viewer) => {
    await requireRoomHost(viewer, sessionId);
    const { roomName } = await liveRoom(sessionId);
    await LiveSession.updateOne({ _id: sessionId, board: { $ne: null } }, { $set: { 'board.studentsDraw': allowed } });
    await tell(roomName, 'board', 'drawing');
    refresh();
  },
);

export const closeBoard = action({ input: RoomRef, roles: ASSIGNABLE_ROLES }, async ({ sessionId }, viewer) => {
  await requireRoomHost(viewer, sessionId);
  const { roomName } = await liveRoom(sessionId);
  await LiveSession.updateOne({ _id: sessionId }, { $unset: { board: '' } });
  await tell(roomName, 'board', 'closed');
  refresh();
});
