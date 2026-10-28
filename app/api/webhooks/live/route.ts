import { Types } from 'mongoose';
import { recordingEnded } from '@/lib/data/recordings';
import { db, isDuplicateKey } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { parseWebhook, removeFromRoom, setRights, type LiveEvent } from '@/lib/integrations/live';
import { Attendance } from '@/lib/models/attendance';
import { Enrollment } from '@/lib/models/enrollment';
import { LiveSession } from '@/lib/models/live-session';
import { queueLiveControl, queueLiveFinalize } from '@/lib/queue';
import { objectId } from '@/lib/schemas/common';
import { ALL_RIGHTS } from '@/lib/schemas/live';

// The engine retries anything but a 2xx, so every event it should not resend is answered 200, ignored or not.
const ok = () => new Response(null, { status: 200 });

type Connection = { sid: string; joinedAt: Date; leftAt: Date | null };

// M03c T7: a breakout room `<roomName>-b<n>` belongs to its class or meeting, so time there counts as time in the class.
const sessionRoom = (roomName: string) => /^(ls-[a-f\d]{24})-b\d+$/.exec(roomName)?.[1] ?? roomName;
type Room = { _id: Types.ObjectId; offeringId: Types.ObjectId };
const SETTLE_AFTER_MS = 60_000;

// One entry per connection (05 §4.4): a connection already recorded is not added again, so a repeated or late event
// changes nothing. Teachers' and outsiders' identities are ignored.
async function addConnection(room: Room, userId: string, connection: Connection, retried = false): Promise<void> {
  const enrolled = await Enrollment.exists({ offeringId: room.offeringId, studentId: userId, status: 'active' });
  if (!enrolled) return;
  const filter = { sessionId: room._id, studentId: userId, 'presence.sid': { $ne: connection.sid } };
  const update = {
    $push: { presence: { $each: [connection], $slice: -50 } },
    $setOnInsert: { offeringId: room.offeringId, source: 'derived' },
  };
  try {
    await Attendance.updateOne(filter, update, { upsert: !retried });
  } catch (error) {
    // The row was created meanwhile, or it exists and already holds this connection: add to it without inserting.
    if (!isDuplicateKey(error) || retried) throw error;
    await addConnection(room, userId, connection, true);
  }
}

// M03c T2: someone a host removed who comes back with a token they kept is removed again and not counted. A student
// whose token was issued just before a host changed what students may do gets the change now. A meeting (T4) takes no
// attendance: its removed members and guests are put out again, and the others get the current rights.
async function joined({ roomName, userId, sid, host, at }: Extract<LiveEvent, { type: 'joined' }>) {
  const room = await LiveSession.findOne(
    { roomName: sessionRoom(roomName), status: 'live' },
    { kind: 1, offeringId: 1, studentsMay: 1, removed: { $elemMatch: { userId: new Types.ObjectId(userId) } } },
  ).lean();
  if (!room) return;
  if (room.removed?.length) return removeFromRoom(roomName, userId);
  const rights = { ...ALL_RIGHTS, ...room.studentsMay };
  if (!host && Object.values(rights).includes(false)) await setRights(roomName, userId, rights);
  if (room.offeringId)
    await addConnection({ _id: room._id, offeringId: room.offeringId }, userId, { sid, joinedAt: at, leftAt: null });
}

// Leaves arrive after the class has ended too (ending it closes the room), so they apply in any status.
async function left({ roomName, userId, sid, joinedAt, at }: Extract<LiveEvent, { type: 'left' }>) {
  const room = await LiveSession.findOne(
    { roomName: sessionRoom(roomName), status: { $in: ['live', 'ended'] } },
    { offeringId: 1 },
  ).lean();
  if (!room?.offeringId) return;
  const closed = await Attendance.updateOne(
    { sessionId: room._id, studentId: userId, 'presence.sid': sid },
    { $set: { 'presence.$[connection].leftAt': at } },
    { arrayFilters: [{ 'connection.sid': sid }] },
  );
  // Its join never arrived (or comes later): record the connection as one closed interval.
  if (closed.matchedCount === 0) {
    await addConnection({ _id: room._id, offeringId: room.offeringId }, userId, { sid, joinedAt, leftAt: at });
  }
}

// Q-50: the engine closes an empty room after about 20 s. Before the scheduled end that is a dropped connection, not
// the end of the class: the room opens again when someone rejoins.
async function roomFinished({ roomName, at }: Extract<LiveEvent, { type: 'room_finished' }>) {
  const room = await LiveSession.findOne(
    { roomName },
    { status: 1, scheduledEnd: 1, startedAt: 1, recordings: 1 },
  ).lean();
  if (!room) return;
  // M03c T13: the room closing ends its recording; a minute later, any still marked as running is settled with the
  // engine, in case its own event never arrives.
  if (room.recordings?.some((r) => r.status === 'recording')) {
    await queueLiveControl({ op: 'settleRecordings', sessionId: String(room._id) }, SETTLE_AFTER_MS);
  }
  if (room.status === 'live' && room.startedAt && at >= room.scheduledEnd) {
    await LiveSession.updateOne(
      { _id: room._id, status: 'live' },
      { $set: { status: 'ended', endedAt: at > room.startedAt ? at : room.startedAt } },
    );
  }
  if (await LiveSession.exists({ _id: room._id, status: 'ended', finalizedAt: null })) {
    await queueLiveFinalize(String(room._id));
  }
}

// 06 §3, T5: signed presence events from the live engine.
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  let event: LiveEvent;
  try {
    event = await parseWebhook(rawBody, request.headers.get('authorization'));
  } catch (error) {
    if (error instanceof AppError && error.code === 'FORBIDDEN') return new Response(null, { status: 401 });
    throw error;
  }
  if (event.type === 'ignored') return ok();
  await db();
  if (event.type === 'room_finished') await roomFinished(event);
  // M03c T5: a recording's file is saved, or the recording failed; a start event changes nothing.
  else if (event.type === 'recording') await recordingEnded(event.roomName, event, event.at);
  else if (objectId.safeParse(event.userId).success) await (event.type === 'joined' ? joined(event) : left(event));
  return ok();
}
