'use server';

import { refresh } from 'next/cache';
import { Types } from 'mongoose';
import { publicAction } from '@/lib/action';
import { guestIdOf } from '@/lib/auth/guest-link';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { tell } from '@/lib/integrations/live';
import { LiveSession } from '@/lib/models/live-session';
import { clientIp, limit } from '@/lib/rate-limit';
import { AskToJoin, GuestRef } from '@/lib/schemas/live';

// M03c T4 (decision 7): a guest's lobby, signed out. Their personal link is the only key: it names the guest, and a
// host decides who comes in. Asking is limited per address (09 §4).

const MINUTE = 60_000;

async function guestMeeting(token: string) {
  await limit('meeting-lobby', await clientIp(), 30, 15 * MINUTE);
  const guestId = guestIdOf(token);
  if (!guestId) throw new AppError('NOT_FOUND', 'This link is not valid.');
  await db();
  const id = new Types.ObjectId(guestId);
  const doc = await LiveSession.findOne(
    { kind: 'meeting', 'meeting.guests._id': id },
    { status: 1, roomName: 1, meeting: 1, removed: { $elemMatch: { userId: id } } },
  ).lean();
  const guest = doc?.meeting?.guests.find((g) => g._id.equals(id));
  if (!doc || !guest) throw new AppError('NOT_FOUND', 'This link is no longer valid. Ask a host for a new invitation.');
  if (doc.status !== 'live') {
    throw new AppError(
      'CLOSED',
      doc.status === 'scheduled' ? 'The meeting has not started yet.' : 'The meeting is over.',
    );
  }
  if (doc.removed?.length) throw new AppError('FORBIDDEN', 'A host removed you from this meeting.');
  return { doc, guest, id };
}

// Asking again after being turned away is allowed; a guest already let in goes straight in with the name they give.
export const askToJoin = publicAction(AskToJoin, async ({ token, name }) => {
  const { doc, guest, id } = await guestMeeting(token);
  const named = { 'meeting.guests.$[g].name': name };
  if (guest.admittedAt) {
    await LiveSession.updateOne({ _id: doc._id }, { $set: named }, { arrayFilters: [{ 'g._id': id }] });
  } else {
    await LiveSession.updateOne(
      { _id: doc._id, status: 'live', 'waiting.guestId': { $ne: id } },
      {
        $set: named,
        $unset: { 'meeting.guests.$[g].deniedAt': '' },
        $push: { waiting: { guestId: id, name, at: new Date() } },
      },
      { arrayFilters: [{ 'g._id': id }] },
    );
    await tell(doc.roomName, 'controls', 'lobby');
  }
  refresh();
});

export const stopAsking = publicAction(GuestRef, async ({ token }) => {
  const { doc, id } = await guestMeeting(token);
  await LiveSession.updateOne({ _id: doc._id }, { $pull: { waiting: { guestId: id } } });
  await tell(doc.roomName, 'controls', 'lobby');
  refresh();
});
