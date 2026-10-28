'use server';

import { refresh } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';
import { publicAction } from '@/lib/action';
import { grantMeetingPass, meetingPassHolder } from '@/lib/auth/meeting-pass';
import { answerPollAs } from '@/lib/data/live';
import { findLinkedMeeting } from '@/lib/data/meetings';
import { AppError } from '@/lib/errors';
import { setHand } from '@/lib/integrations/live';
import { LiveSession } from '@/lib/models/live-session';
import { clientIp, limit } from '@/lib/rate-limit';
import { AnswerPoll, JoinMeeting, RoomRef } from '@/lib/schemas/live';

// M03c T14 (decision 9): joining by a personal link without signing in. The link names the person; the passcode in
// their invitation lets this browser in as them (a sealed cookie, A-223). Wrong passcodes are limited per link and per
// address (A-222, 09 §4); a right one gives its tries back.

const MINUTE = 60_000;

const same = (given: string, passcode: string) =>
  given.length === passcode.length && timingSafeEqual(Buffer.from(given), Buffer.from(passcode));

export const joinMeeting = publicAction(JoinMeeting, async ({ token, name, passcode }) => {
  const byAddress = await limit('meeting-passcode-ip', await clientIp(), 30, 15 * MINUTE);
  const byLink = await limit('meeting-passcode', token, 10, 15 * MINUTE);
  const linked = await findLinkedMeeting(token);
  if (!linked) throw new AppError('NOT_FOUND', 'This link is no longer valid. Ask a host for a new invitation.');
  const { doc, person } = linked;
  if (doc.status !== 'live') {
    throw new AppError(
      'CLOSED',
      doc.status === 'scheduled' ? 'The meeting has not started yet.' : 'The meeting is over.',
    );
  }
  if (doc.removed?.some((r) => r.userId.equals(person.id))) {
    throw new AppError('FORBIDDEN', 'A host removed you from this meeting.');
  }
  if (person.kind === 'guest' && name.length < 2) {
    throw new AppError('VALIDATION', 'Enter your name.', {
      name: ['Enter your name. Everyone in the meeting sees it.'],
    });
  }
  if (doc.meeting.passcode && !same(passcode, doc.meeting.passcode)) {
    throw new AppError('VALIDATION', 'That passcode is not right.', {
      passcode: ['Not right. It is the six digits in your invitation email.'],
    });
  }
  await Promise.all([byAddress.refund(), byLink.refund()]);
  if (person.kind === 'guest') {
    await LiveSession.updateOne(
      { _id: doc._id, 'meeting.guests._id': person.id },
      { $set: { 'meeting.guests.$.name': name } },
    );
  }
  await grantMeetingPass(String(doc._id), person.id);
  refresh();
});

// T15 (A-225): someone in by their link raises or lowers their own hand and answers polls, as the person their pass
// names, while they are still invited and not removed.
async function passHolder(sessionId: string) {
  const personId = await meetingPassHolder(sessionId);
  if (!personId) throw new AppError('UNAUTHENTICATED', 'Open your link again to carry on.');
  const doc = await LiveSession.findOne(
    { _id: sessionId, kind: 'meeting' },
    { status: 1, roomName: 1, meeting: 1, removed: 1 },
  ).lean();
  const invited =
    doc?.meeting?.guests.some((g) => g._id.equals(personId)) ||
    [...(doc?.meeting?.hostIds ?? []), ...(doc?.meeting?.memberIds ?? [])].some((id) => id.equals(personId));
  if (!doc || !invited) throw new AppError('NOT_FOUND', 'This link is no longer valid.');
  if (doc.status !== 'live') throw new AppError('CLOSED', 'The meeting is not running.');
  if (doc.removed?.some((r) => r.userId.equals(personId))) {
    throw new AppError('FORBIDDEN', 'A host removed you from this meeting.');
  }
  return { roomName: doc.roomName, personId };
}

export const raiseHandByLink = publicAction(RoomRef, async ({ sessionId }) => {
  const { roomName, personId } = await passHolder(sessionId);
  await setHand(roomName, personId, new Date());
});

export const lowerHandByLink = publicAction(RoomRef, async ({ sessionId }) => {
  const { roomName, personId } = await passHolder(sessionId);
  await setHand(roomName, personId, null);
});

export const answerPollByLink = publicAction(AnswerPoll, async ({ sessionId, pollId, optionId }) => {
  const { personId } = await passHolder(sessionId);
  await answerPollAs(sessionId, pollId, optionId, personId);
  refresh();
});
