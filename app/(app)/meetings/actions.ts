'use server';

import { refresh } from 'next/cache';
import { randomInt } from 'node:crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import { action } from '@/lib/action';
import { requireRoomHost } from '@/lib/auth/access';
import type { Viewer } from '@/lib/auth/session';
import { START_EARLY_MS } from '@/lib/data/live';
import {
  matchPeople as matchKeys,
  findPeople as searchPeople,
  requireInvitable,
  STAFF_ROLES,
} from '@/lib/data/meetings';
import { notify } from '@/lib/data/notify';
import { db } from '@/lib/db';
import { parseIstLocal } from '@/lib/domain/time';
import { AppError } from '@/lib/errors';
import { formatDateTime, formatDay, formatTime } from '@/lib/format';
import { LiveSession } from '@/lib/models/live-session';
import type { NotificationKind } from '@/lib/models/notification';
import { User } from '@/lib/models/user';
import { mailQueue } from '@/lib/queue';
import { limit } from '@/lib/rate-limit';
import { ASSIGNABLE_ROLES } from '@/lib/schemas/common';
import type { MailJob } from '@/lib/schemas/jobs';
import { FindPeople, MatchPeople, MEETING_LIMITS, MeetingRef, ResendInvitation, SaveMeeting } from '@/lib/schemas/live';

// M03c T4: meetings outside classes. Staff schedule them; the scheduler stays a host, with up to four co-hosts (staff);
// members are picked from the LMS and guests are invited by email. Everyone invited gets an email with their own link,
// the passcode (T14, decision 9) and a calendar file (06 §8.7); people from the LMS also get a notification.

const MINUTE_MS = 60_000;
const when = (start: Date) => `${formatDay(start)} at ${formatTime(start)}`;
const href = (id: string) => `/meetings/${id}`;

async function tellMembers(userIds: string[], kind: NotificationKind, title: string, id: string) {
  if (userIds.length === 0) return;
  await notify(userIds, { kind, title: title.length > 160 ? `${title.slice(0, 159)}…` : title, href: href(id) });
}

async function sendInvites(job: Omit<Extract<MailJob, { kind: 'meetingInvites' }>, 'kind'>) {
  if (job.userIds.length + job.guestIds.length + job.cancelTo.length === 0) return;
  await mailQueue().add(
    'fanout',
    { kind: 'meetingInvites', ...job },
    { jobId: `meeting-${job.sessionId}-${job.sequence}-${job.method}-${Date.now()}` },
  );
}

const distinct = (ids: string[], without: string[]) => [...new Set(ids)].filter((id) => !without.includes(id));

export const findPeople = action({ input: FindPeople, roles: STAFF_ROLES }, async ({ q, scope }, viewer) =>
  searchPeople(viewer, q, scope),
);

// A list pasted into the meeting's people field: who among it is in the LMS.
export const matchPeople = action({ input: MatchPeople, roles: STAFF_ROLES }, async ({ keys }, viewer) =>
  matchKeys(viewer, keys),
);

async function hostedMeeting(viewer: Viewer, meetingId: string) {
  await requireRoomHost(viewer, meetingId);
  const doc = await LiveSession.findOne(
    { _id: meetingId, kind: 'meeting' },
    { title: 1, status: 1, scheduledStart: 1, scheduledEnd: 1, meeting: 1 },
  ).lean();
  if (!doc?.meeting) throw new AppError('NOT_FOUND', 'Meeting not found.');
  return { ...doc, meeting: doc.meeting };
}

// T4: schedule a meeting, or change one that has not started. A new time or title is a new version of the invitation
// (`sequence`), sent to everyone; otherwise only the people added are invited. People taken off get a cancellation.
export const saveMeeting = action({ input: SaveMeeting, roles: STAFF_ROLES }, async (input, viewer) => {
  await db();
  const start = parseIstLocal(`${input.date}T${input.startTime}`);
  const end = parseIstLocal(`${input.date}T${input.endTime}`);
  if (end.getTime() - start.getTime() > MEETING_LIMITS.lengthMin * MINUTE_MS) {
    throw new AppError('VALIDATION', 'A meeting lasts at most 6 hours.', { endTime: ['End within 6 hours.'] });
  }
  const existing = input.meetingId ? await hostedMeeting(viewer, input.meetingId) : null;
  const owner = existing ? String(existing.meeting.hostIds[0]) : viewer.id;
  // T14: what was typed in the people box but not yet added is added as Enter adds it — people from the LMS where
  // they match, guests by email — so nobody typed is left uninvited.
  const keys = [...new Set(input.typed.split(/[\s,;]+/).filter(Boolean))].slice(0, 100);
  const matched = keys.length > 0 ? await matchKeys(viewer, keys) : [];
  const rest = keys.filter((k) => !matched.some((m) => m.key === k)).map((k) => k.toLowerCase());
  const unknown = rest.filter((k) => !z.email().safeParse(k).success);
  if (unknown.length > 0) {
    const named = unknown.map((k) => `“${k}”`).join(', ');
    throw new AppError('VALIDATION', 'Someone typed in People was not added.', {
      typed: [`${named} ${unknown.length === 1 ? 'is' : 'are'} nobody you can invite, and not an email address.`],
    });
  }
  const coHostIds = distinct(input['coHost[]'], [owner]);
  const memberIds = distinct([...input['member[]'], ...matched.map((m) => m.person.id)], [owner, ...coHostIds]);
  const guestEmails = [...new Set([...input.guests, ...rest])];
  if (memberIds.length > MEETING_LIMITS.members || guestEmails.length > MEETING_LIMITS.guests) {
    throw new AppError(
      'VALIDATION',
      `A meeting has at most ${MEETING_LIMITS.members} people from the LMS and ${MEETING_LIMITS.guests} guests.`,
      { typed: ['Too many people with what was typed here.'] },
    );
  }
  if ((await requireInvitable(viewer, coHostIds, memberIds)).length !== coHostIds.length + memberIds.length) {
    throw new AppError('VALIDATION', 'Pick people from the list. Co-hosts are members of staff.', {
      'member[]': ['Someone here cannot be invited by you.'],
    });
  }
  const now = new Date();
  const startChanged = !existing || start.getTime() !== existing.scheduledStart.getTime();
  if (startChanged && start.getTime() < Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS) {
    throw new AppError('VALIDATION', 'That time has passed. Pick a time from now on.', {
      startTime: ['Pick a time from now on.'],
    });
  }

  if (!existing) {
    const _id = new Types.ObjectId();
    const guests = guestEmails.map((email) => ({ _id: new Types.ObjectId(), email }));
    await LiveSession.create({
      _id,
      kind: 'meeting',
      title: input.title,
      scheduledStart: start,
      scheduledEnd: end,
      roomName: `ls-${_id}`,
      // Meetings take no attendance; the field is a class's.
      attendanceMode: 'manual',
      meeting: {
        hostIds: [owner, ...coHostIds],
        memberIds,
        guests,
        sequence: 0,
        passcode: String(randomInt(0, 1_000_000)).padStart(6, '0'),
      },
      createdBy: viewer.id,
    });
    const invited = [...coHostIds, ...memberIds];
    await sendInvites({
      sessionId: String(_id),
      sequence: 0,
      method: 'REQUEST',
      userIds: invited,
      guestIds: guests.map((g) => String(g._id)),
      cancelTo: [],
      changed: false,
    });
    await tellMembers(invited, 'meeting.invited', `${input.title} — ${when(start)}`, String(_id));
    refresh();
    return { id: String(_id) };
  }

  if (existing.status !== 'scheduled' || existing.scheduledEnd < now) {
    throw new AppError('CLOSED', 'This meeting has started or ended, so it can no longer be changed.');
  }
  const id = String(existing._id);
  const before = [...existing.meeting.hostIds.slice(1), ...existing.meeting.memberIds].map(String);
  const after = [...coHostIds, ...memberIds];
  const keptGuests = existing.meeting.guests.filter((g) => guestEmails.includes(g.email));
  const newGuests = guestEmails
    .filter((email) => !keptGuests.some((g) => g.email === email))
    .map((email) => ({ _id: new Types.ObjectId(), email }));
  const droppedGuests = existing.meeting.guests.filter((g) => !guestEmails.includes(g.email));
  const droppedUsers = before.filter((uid) => !after.includes(uid));
  const moved = startChanged || end.getTime() !== existing.scheduledEnd.getTime() || input.title !== existing.title;
  const sequence = existing.meeting.sequence + (moved || droppedUsers.length + droppedGuests.length > 0 ? 1 : 0);
  const written = await LiveSession.updateOne(
    { _id: id, status: 'scheduled' },
    {
      $set: {
        title: input.title,
        scheduledStart: start,
        scheduledEnd: end,
        'meeting.hostIds': [owner, ...coHostIds],
        'meeting.memberIds': memberIds,
        'meeting.guests': [...keptGuests, ...newGuests],
        'meeting.sequence': sequence,
      },
    },
  );
  if (written.matchedCount === 0)
    throw new AppError('CLOSED', 'This meeting has started, so it can no longer be changed.');
  const added = after.filter((uid) => !before.includes(uid));
  const removedPeople = await User.find({ _id: { $in: droppedUsers } }, { email: 1, name: 1 }).lean();
  await sendInvites({
    sessionId: id,
    sequence,
    method: 'REQUEST',
    userIds: moved ? after : added,
    guestIds: (moved ? [...keptGuests, ...newGuests] : newGuests).map((g) => String(g._id)),
    cancelTo: [],
    changed: moved,
  });
  await sendInvites({
    sessionId: id,
    sequence,
    method: 'CANCEL',
    userIds: [],
    guestIds: [],
    cancelTo: [
      ...removedPeople.map((u) => ({ email: u.email, name: u.name })),
      ...droppedGuests.map((g) => ({ email: g.email, name: g.name ?? null })),
    ],
    changed: false,
  });
  await tellMembers(added, 'meeting.invited', `${input.title} — ${when(start)}`, id);
  if (moved) {
    await tellMembers(
      after.filter((uid) => !added.includes(uid)),
      'meeting.changed',
      `${input.title} is now ${when(start)}`,
      id,
    );
  }
  refresh();
  return { id };
});

// Cancelling tells everyone invited, with a cancellation their calendar understands. A meeting that has started is
// ended from its room instead.
export const cancelMeeting = action({ input: MeetingRef, roles: STAFF_ROLES }, async ({ meetingId }, viewer) => {
  const doc = await hostedMeeting(viewer, meetingId);
  const sequence = doc.meeting.sequence + 1;
  const written = await LiveSession.updateOne(
    { _id: meetingId, status: 'scheduled' },
    { $set: { status: 'cancelled', 'meeting.sequence': sequence } },
  );
  if (written.matchedCount === 0) {
    if (doc.status === 'cancelled') return refresh();
    throw new AppError('CLOSED', 'This meeting has already started. End it from its room.');
  }
  const people = [...doc.meeting.hostIds, ...doc.meeting.memberIds].map(String).filter((uid) => uid !== viewer.id);
  const users = await User.find({ _id: { $in: people } }, { email: 1, name: 1 }).lean();
  await sendInvites({
    sessionId: meetingId,
    sequence,
    method: 'CANCEL',
    userIds: [],
    guestIds: [],
    cancelTo: [
      ...users.map((u) => ({ email: u.email, name: u.name })),
      ...doc.meeting.guests.map((g) => ({ email: g.email, name: g.name ?? null })),
    ],
    changed: false,
  });
  await tellMembers(people, 'meeting.cancelled', `${doc.title} on ${when(doc.scheduledStart)} is cancelled`, meetingId);
  refresh();
});

// T14: a host sends one person their invitation again (the same link and passcode), for one that went astray. A few
// times an hour per person, as each is an email.
export const resendInvitation = action(
  { input: ResendInvitation, roles: ASSIGNABLE_ROLES },
  async ({ meetingId, personId }, viewer) => {
    const doc = await hostedMeeting(viewer, meetingId);
    if (doc.status === 'cancelled' || doc.status === 'ended') throw new AppError('CLOSED', 'This meeting is over.');
    const member = [...doc.meeting.hostIds, ...doc.meeting.memberIds].some((id) => id.equals(personId));
    const guest = doc.meeting.guests.some((g) => g._id.equals(personId));
    if (!member && !guest) throw new AppError('NOT_FOUND', 'They are not invited to this meeting.');
    await limit('meeting-resend', `${meetingId}:${personId}`, 3, 60 * MINUTE_MS);
    await sendInvites({
      sessionId: meetingId,
      sequence: doc.meeting.sequence,
      method: 'REQUEST',
      userIds: member ? [personId] : [],
      guestIds: guest ? [personId] : [],
      cancelTo: [],
      changed: false,
      resentAt: Date.now(),
    });
  },
);

// As a class (T3): from 15 minutes before the start until the scheduled end; the people from the LMS are told. Guests
// waiting on their page see it open.
export const startMeeting = action({ input: MeetingRef, roles: ASSIGNABLE_ROLES }, async ({ meetingId }, viewer) => {
  const doc = await hostedMeeting(viewer, meetingId);
  if (doc.status === 'live') return refresh();
  if (doc.status !== 'scheduled') throw new AppError('CLOSED', 'This meeting has ended or was cancelled.');
  const now = new Date();
  if (now.getTime() < doc.scheduledStart.getTime() - START_EARLY_MS) {
    throw new AppError(
      'CLOSED',
      `You can start this meeting from ${formatDateTime(new Date(doc.scheduledStart.getTime() - START_EARLY_MS))}.`,
    );
  }
  if (now > doc.scheduledEnd) throw new AppError('CLOSED', 'The time for this meeting has passed. Schedule it again.');
  const written = await LiveSession.updateOne(
    { _id: meetingId, status: 'scheduled' },
    { $set: { status: 'live', startedAt: now } },
  );
  if (written.matchedCount === 1) {
    await tellMembers(
      [...doc.meeting.hostIds, ...doc.meeting.memberIds].map(String).filter((uid) => uid !== viewer.id),
      'meeting.started',
      `${doc.title} has started — join now`,
      meetingId,
    );
  }
  refresh();
});
