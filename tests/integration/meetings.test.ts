import { randomInt } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import {
  cancelMeeting,
  findPeople,
  matchPeople,
  resendInvitation,
  saveMeeting,
  startMeeting,
} from '@/app/(app)/meetings/actions';
import {
  allowBack,
  answerPoll,
  closeBoard,
  closeBreakouts,
  createPoll,
  endPoll,
  endRoom,
  messageBreakouts,
  openBoard,
  openBreakouts,
  removeParticipant,
  roomToken,
  setBoardDrawing,
  showPollResults,
  startRecording,
  stopRecording,
} from '@/app/(room)/actions';
import { joinMeeting } from '@/app/(room)/m/[token]/actions';
import { GET as file } from '@/app/api/files/[...key]/route';
import { POST as webhook } from '@/app/api/webhooks/live/route';
import { linkHolderOf, meetingLinkToken } from '@/lib/auth/meeting-link';
import { getSession } from '@/lib/data/live';
import { getMeeting, getMeetingLink, getMeetingRoom, listMeetings } from '@/lib/data/meetings';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import type { LiveEvent, Recording } from '@/lib/integrations/live';
import { Attendance } from '@/lib/models/attendance';
import { AuditLog } from '@/lib/models/audit-log';
import { Enrollment } from '@/lib/models/enrollment';
import { LiveSession } from '@/lib/models/live-session';
import { Notification } from '@/lib/models/notification';
import { Offering } from '@/lib/models/offering';
import { PollAnswer } from '@/lib/models/poll-answer';
import { computeQueue, mailQueue, queueLiveControl, redis } from '@/lib/queue';
import { startComputeWorker } from '@/worker/jobs/compute';
import { startMailWorker } from '@/worker/jobs/mail';
import { enroll, makeOffering, makeUser, newId, signInAs } from '../factories';
import { switchBrowser } from '../next-request';

type Sent = { to: string; subject: string; text: string; calendar?: { method: string; content: string } };
const {
  events: sentEvents,
  sendMail,
  joinToken,
  tell,
  removeFromRoom,
  closeRoom,
  egress,
} = vi.hoisted(() => ({
  events: new Map<string, LiveEvent>(),
  sendMail: vi.fn(async (message: Sent) => void message),
  joinToken: vi.fn(async (input: { userId: string; role: string }) => ({
    serverUrl: 'ws://live.test',
    token: `${input.role}-${input.userId}`,
  })),
  tell: vi.fn(async (roomName: string, topic: string, text: string) => void [roomName, topic, text]),
  removeFromRoom: vi.fn(async (roomName: string, identity: string) => void [roomName, identity]),
  closeRoom: vi.fn(async (roomName: string) => void roomName),
  // M03c T5: the Egress calls; `open` false is a room nobody has joined yet. T13: the engine keeps what it records
  // (`running`, by room) and what it finished (`ended`); `timeOut` makes the next start begin recording and then fail
  // to answer, as a slow engine does.
  egress: {
    open: true,
    timeOut: false,
    running: new Map<string, Recording & { roomName: string }>(),
    ended: new Map<string, Recording>(),
    start: vi.fn(async (roomName: string, key: string) => void [roomName, key]),
    stop: vi.fn(async (roomName: string, egressId: string) => void [roomName, egressId]),
  },
}));
vi.mock('@/lib/integrations/mail', () => ({ sendMail }));
vi.mock('@/lib/integrations/live', async () => {
  const { AppError } = await import('@/lib/errors');
  return {
    joinToken,
    tell,
    removeFromRoom,
    closeRoom,
    recordingEnabled: () => true,
    startRecording: async (roomName: string, key: string) => {
      await egress.start(roomName, key);
      if (!egress.open) return null;
      const egressId = `EG_${key.slice(-12, -4)}`;
      egress.running.set(egressId, { roomName, egressId, key, status: 'active', durationSec: null });
      if (egress.timeOut) {
        egress.timeOut = false;
        throw new AppError('INTEGRATION', 'The live-class service did not answer. Try again in a moment.');
      }
      return egressId;
    },
    stopRecording: async (roomName: string, egressId: string) => {
      await egress.stop(roomName, egressId);
      const running = egress.running.get(egressId);
      egress.running.delete(egressId);
      if (running) egress.ended.set(egressId, { ...running, status: 'saved', durationSec: 12 });
    },
    activeRecordings: async (roomName: string) => [...egress.running.values()].filter((r) => r.roomName === roomName),
    recordingInfo: async (roomName: string, egressId: string) =>
      egress.ended.get(egressId) ?? egress.running.get(egressId) ?? null,
    setRights: async () => undefined,
    setHand: async () => undefined,
    muteMicrophone: async () => true,
    roomPeople: async () => [],
    parseWebhook: async (rawBody: string, authorization: string | null) => {
      if (authorization !== 'signed') throw new AppError('FORBIDDEN', 'Invalid webhook signature');
      return sentEvents.get(rawBody) ?? { type: 'ignored' };
    },
  };
});

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const MIN = 60_000;

let compute: ReturnType<typeof startComputeWorker>;
let mail: ReturnType<typeof startMailWorker>;
let computeEvents: QueueEvents;

beforeAll(async () => {
  await db();
  await Promise.all(
    [Attendance, AuditLog, Enrollment, LiveSession, Notification, Offering, PollAnswer].map(async (m) => {
      await m.createCollection();
      await m.createIndexes();
    }),
  );
  compute = startComputeWorker(env().REDIS_URL);
  mail = startMailWorker(env().REDIS_URL);
  computeEvents = new QueueEvents('compute', {
    connection: new Redis(env().REDIS_URL, { maxRetriesPerRequest: null }),
  });
  await computeEvents.waitUntilReady();
});

afterAll(async () => {
  await Promise.all([
    compute.close(),
    mail.close(),
    computeEvents.close(),
    computeQueue().close(),
    mailQueue().close(),
  ]);
  await redis().quit();
});

const hook = (event: LiveEvent) => {
  const body = crypto.randomUUID();
  sentEvents.set(body, event);
  return webhook(
    new Request('http://localhost:3000/api/webhooks/live', {
      method: 'POST',
      body,
      headers: { authorization: 'signed' },
    }),
  );
};

// The IST day and times the dialog sends for a meeting from `start` lasting `minutes`.
function slot(start: Date, minutes = 60) {
  const local = (at: Date) => new Date(at.getTime() + 330 * MIN).toISOString();
  const end = new Date(start.getTime() + minutes * MIN);
  return { date: local(start).slice(0, 10), startTime: local(start).slice(11, 16), endTime: local(end).slice(11, 16) };
}
// Tomorrow at 10:00 IST, so a test never crosses midnight.
function tomorrow(hourIst = 10) {
  const day = new Date(Date.now() + 330 * MIN + 24 * 60 * MIN).toISOString().slice(0, 10);
  return new Date(`${day}T${String(hourIst).padStart(2, '0')}:00:00+05:30`);
}

async function world() {
  const faculty = await makeUser({ roles: ['faculty'] });
  const colleague = await makeUser({ roles: ['faculty'] });
  const taught = await makeUser({ roles: ['student'] });
  const untaught = await makeUser({ roles: ['student'] });
  const admin = await makeUser({ roles: ['admin'] });
  const offering = await makeOffering({ facultyIds: [faculty._id], status: 'active' });
  await enroll(offering._id, taught._id);
  return { faculty, colleague, taught, untaught, admin };
}
type World = Awaited<ReturnType<typeof world>>;

async function schedule(w: World, over: Partial<Parameters<typeof saveMeeting>[0]> = {}) {
  await signInAs(w.faculty);
  const result = await saveMeeting({
    title: 'Project review with an industry mentor',
    ...slot(tomorrow()),
    'coHost[]': [String(w.colleague._id)],
    'member[]': [String(w.taught._id)],
    guests: 'rao.kumar@example.com\nRAO.KUMAR@example.com, sita@example.com',
    ...over,
  });
  if (!result.ok) throw new Error(result.message);
  return result.data.id;
}

const mailsTo = (id: string) =>
  sendMail.mock.calls.map(([m]) => m).filter((m) => m.calendar?.content.includes(`meeting-${id}@`));
const linkIn = (text = '') => /\/m\/([^\s]+)/.exec(text)?.[1] ?? '';
const guestLink = (guestId: unknown) => meetingLinkToken({ kind: 'guest', guestId: String(guestId) });
// A signed-out browser of its own, on an address of its own, so passcode limits never carry between tests or runs.
function signedOut(): Map<string, string> {
  const cookies = new Map<string, string>();
  switchBrowser(cookies, `10.${randomInt(256)}.${randomInt(256)}.${randomInt(256)}`);
  return cookies;
}

describe('scheduling a meeting (M03c T4)', () => {
  it('lets staff invite co-hosts, people they may invite and guests, and sends each an invitation of their own', async () => {
    const w = await world();
    sendMail.mockClear();
    const id = await schedule(w);
    const doc = await LiveSession.findById(id).lean();
    expect(doc).toMatchObject({ kind: 'meeting', status: 'scheduled', roomName: `ls-${id}` });
    expect(doc?.offeringId).toBeUndefined();
    expect(doc?.meeting?.hostIds.map(String)).toEqual([String(w.faculty._id), String(w.colleague._id)]);
    expect(doc?.meeting?.memberIds.map(String)).toEqual([String(w.taught._id)]);
    expect(doc?.meeting?.guests.map((g) => g.email)).toEqual(['rao.kumar@example.com', 'sita@example.com']);
    expect(await Notification.countDocuments({ kind: 'meeting.invited', href: `/meetings/${id}` })).toBe(2);
    await vi.waitFor(() => expect(mailsTo(id)).toHaveLength(4), { timeout: 10_000 });
    for (const m of mailsTo(id)) {
      expect(m.calendar?.method).toBe('REQUEST');
      // Each calendar file names only its own recipient.
      expect(m.calendar?.content.replace(/\r\n /g, '')).toContain(`RSVP=FALSE:mailto:${m.to}`);
      expect(m.calendar?.content.match(/ATTENDEE/g)).toHaveLength(1);
    }
    // T14 (decision 9): everyone's own link, and the passcode in every invitation and calendar file.
    const passcode = doc?.meeting?.passcode ?? '';
    expect(passcode).toMatch(/^\d{6}$/);
    const rao = mailsTo(id).find((m) => m.to === 'rao.kumar@example.com');
    expect(linkHolderOf(linkIn(rao?.text))).toEqual({ kind: 'guest', guestId: String(doc?.meeting?.guests[0]._id) });
    const taught = mailsTo(id).find((m) => m.to === w.taught.email);
    expect(linkHolderOf(linkIn(taught?.text))).toEqual({ kind: 'member', sessionId: id, userId: String(w.taught._id) });
    for (const m of mailsTo(id)) {
      expect(m.text).toContain(`Passcode: ${passcode}`);
      expect(m.calendar?.content.replace(/\r\n /g, '')).toContain(`Passcode: ${passcode}`);
      expect(m.subject).toMatch(/^Invitation: /);
    }
  });

  it('invites what was still typed in the people box, and says who it could not add (T14)', async () => {
    const w = await world();
    const id = await schedule(w, { 'member[]': [], guests: '', typed: `${w.taught.email}, new.guest@example.com` });
    const doc = await LiveSession.findById(id).lean();
    expect(doc?.meeting?.memberIds.map(String)).toEqual([String(w.taught._id)]);
    expect(doc?.meeting?.guests.map((g) => g.email)).toEqual(['new.guest@example.com']);
    expect(await saveMeeting({ title: 'Review', ...slot(tomorrow()), guests: '', typed: 'Asha' })).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { typed: ['“asha” is nobody you can invite, and not an email address.'] },
    });
  });

  it('refuses a student scheduling, people the scheduler may not invite, a student co-host and a time that passed', async () => {
    const w = await world();
    await signInAs(w.taught);
    expect(await saveMeeting({ title: 'x', ...slot(tomorrow()), guests: '' })).toMatchObject({ code: 'FORBIDDEN' });
    await signInAs(w.faculty);
    const base = { title: 'Review', ...slot(tomorrow()), guests: '' };
    expect(await saveMeeting({ ...base, 'member[]': [String(w.untaught._id)] })).toMatchObject({ code: 'VALIDATION' });
    expect(await saveMeeting({ ...base, 'coHost[]': [String(w.taught._id)] })).toMatchObject({ code: 'VALIDATION' });
    expect(await saveMeeting({ ...base, ...slot(new Date(Date.now() - 120 * MIN)) })).toMatchObject({
      code: 'VALIDATION',
    });
    expect(await saveMeeting({ ...base, ...slot(tomorrow(), 400) })).toMatchObject({ code: 'VALIDATION' });
    // The picker finds staff and the students the teacher teaches, never anyone else.
    expect(await findPeople({ q: w.taught.email })).toMatchObject({
      ok: true,
      data: [{ id: String(w.taught._id), staff: false }],
    });
    expect(await findPeople({ q: w.untaught.email })).toMatchObject({ ok: true, data: [] });
    expect(await findPeople({ q: w.taught.email, scope: 'staff' })).toMatchObject({ ok: true, data: [] });
    expect(await findPeople({ q: w.colleague.email, scope: 'staff' })).toMatchObject({
      ok: true,
      data: [{ id: String(w.colleague._id), staff: true }],
    });
    // A pasted list: the same people, matched by email or roll number; anyone else is left for the field to report.
    const pasted = await matchPeople({
      keys: [w.colleague.email.toUpperCase(), w.untaught.email, 'nobody@example.com'],
    });
    expect(pasted).toMatchObject({
      ok: true,
      data: [{ key: w.colleague.email.toUpperCase(), person: { id: String(w.colleague._id), staff: true } }],
    });
    expect(pasted.ok && pasted.data).toHaveLength(1);
  });

  it('sends a new time to everyone, invites only the people added, and cancels for those taken off', async () => {
    const w = await world();
    const id = await schedule(w);
    await vi.waitFor(() => expect(mailsTo(id)).toHaveLength(4));
    const meeting = {
      meetingId: id,
      title: 'Project review with an industry mentor',
      'coHost[]': [String(w.colleague._id)],
    };
    sendMail.mockClear();
    // Someone added at the same time: only they are invited, at the same version.
    const other = await makeUser({ roles: ['faculty'] });
    expect(
      await saveMeeting({
        ...meeting,
        ...slot(tomorrow()),
        'member[]': [String(w.taught._id), String(other._id)],
        guests: 'rao.kumar@example.com\nsita@example.com',
      }),
    ).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(mailsTo(id)).toHaveLength(1));
    expect(mailsTo(id)[0]).toMatchObject({ to: other.email });
    expect(mailsTo(id)[0].calendar?.content).toContain('SEQUENCE:0');
    expect(mailsTo(id)[0].subject).toMatch(/^Invitation: /);
    // A new time, and Sita taken off: version 1 to everyone left, a cancellation to Sita.
    sendMail.mockClear();
    expect(
      await saveMeeting({
        ...meeting,
        ...slot(tomorrow(11)),
        'member[]': [String(w.taught._id), String(other._id)],
        guests: 'rao.kumar@example.com',
      }),
    ).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(mailsTo(id)).toHaveLength(5));
    const sita = mailsTo(id).find((m) => m.to === 'sita@example.com');
    expect(sita?.calendar).toMatchObject({ method: 'CANCEL' });
    expect(
      mailsTo(id)
        .filter((m) => m.calendar?.method === 'REQUEST')
        .map((m) => m.to)
        .sort(),
    ).toEqual([w.colleague.email, w.taught.email, other.email, 'rao.kumar@example.com'].sort());
    expect(mailsTo(id).every((m) => m.calendar?.content.includes('SEQUENCE:1'))).toBe(true);
    expect(mailsTo(id).filter((m) => m.subject.startsWith('Updated invitation: '))).toHaveLength(4);
    expect(await Notification.countDocuments({ kind: 'meeting.changed', href: `/meetings/${id}` })).toBe(3);
    // Rao's link survives the new version.
    const guest = (await LiveSession.findById(id).lean())?.meeting?.guests[0];
    expect((await getMeetingLink(guestLink(guest?._id))).person.email).toBe('rao.kumar@example.com');
  });

  it('cancels for everyone, once; a co-host cannot change a meeting that has started', async () => {
    const w = await world();
    const id = await schedule(w);
    await vi.waitFor(() => expect(mailsTo(id)).toHaveLength(4));
    sendMail.mockClear();
    await signInAs(w.colleague);
    expect(await cancelMeeting({ meetingId: id })).toMatchObject({ ok: true });
    expect(await cancelMeeting({ meetingId: id })).toMatchObject({ ok: true });
    expect(await LiveSession.findById(id).lean()).toMatchObject({ status: 'cancelled', meeting: { sequence: 1 } });
    await vi.waitFor(() => expect(mailsTo(id)).toHaveLength(4));
    expect(mailsTo(id).every((m) => m.calendar?.method === 'CANCEL')).toBe(true);
    const live = await schedule(w);
    await LiveSession.updateOne({ _id: live }, { $set: { status: 'live', startedAt: new Date() } });
    await signInAs(w.colleague);
    expect(await saveMeeting({ meetingId: live, title: 'Changed', ...slot(tomorrow()), guests: '' })).toMatchObject({
      code: 'CLOSED',
    });
  });
});

describe('who reaches a meeting (09 §3)', () => {
  it('lists it for its hosts and members only; its page and room are not found for anyone else, admins included', async () => {
    const w = await world();
    const id = await schedule(w);
    for (const user of [w.faculty, w.colleague, w.taught]) {
      await signInAs(user);
      expect((await listMeetings(1, 1)).upcoming.map((m) => m.id)).toContain(id);
      expect((await getMeeting(id)).role).toBe(user === w.taught ? 'participant' : 'host');
    }
    await signInAs(w.taught);
    expect((await getMeeting(id)).guests).toBeNull();
    for (const user of [w.untaught, w.admin]) {
      await signInAs(user);
      expect((await listMeetings(1, 1)).upcoming.map((m) => m.id)).not.toContain(id);
      await expect(getMeeting(id)).rejects.toThrow(NOT_FOUND);
      await expect(getMeetingRoom(id)).rejects.toThrow(NOT_FOUND);
    }
  });

  it('starts from 15 minutes before for a host, tells the people from the LMS, and gives each a token in their role', async () => {
    const w = await world();
    const id = await schedule(w, slot(new Date(Date.now() + 10 * MIN)));
    await signInAs(w.taught);
    await expect(startMeeting({ meetingId: id })).rejects.toThrow(NOT_FOUND);
    expect((await getMeetingRoom(id)).join).toBeNull();
    await signInAs(w.colleague);
    expect(await startMeeting({ meetingId: id })).toMatchObject({ ok: true });
    expect(await Notification.countDocuments({ kind: 'meeting.started', href: `/meetings/${id}` })).toBe(2);
    expect((await getMeetingRoom(id)).join?.token).toBe(`host-${w.colleague._id}`);
    await signInAs(w.taught);
    expect(await getMeetingRoom(id)).toMatchObject({
      host: false,
      controls: null,
      join: { token: `participant-${w.taught._id}` },
    });
    const later = await schedule(w);
    await signInAs(w.faculty);
    expect(await startMeeting({ meetingId: later })).toMatchObject({ code: 'CLOSED' });
  });
});

describe('joining by a personal link and the passcode (T14, decision 9)', () => {
  async function running() {
    const w = await world();
    const id = await schedule(w);
    await LiveSession.updateOne({ _id: id }, { $set: { status: 'live', startedAt: new Date() } });
    const doc = await LiveSession.findById(id).lean();
    const guests = doc?.meeting?.guests ?? [];
    const passcode = doc?.meeting?.passcode ?? '';
    const wrong = passcode === '111111' ? '222222' : '111111';
    return { w, id, ref: { sessionId: id }, rao: guests[0], passcode, wrong };
  }

  it('lets a guest in with the passcode under their name, and keeps a removed guest out until a host lets them back', async () => {
    const { w, id, ref, rao, passcode, wrong } = await running();
    const token = guestLink(rao._id);
    const raoId = String(rao._id);
    const raos = signedOut();
    expect(await getMeetingLink(token)).toMatchObject({
      person: { kind: 'guest', email: 'rao.kumar@example.com' },
      signedIn: false,
      asksPasscode: true,
      join: null,
    });
    expect(await joinMeeting({ token, name: 'Rao Kumar', passcode: wrong })).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { passcode: ['Not right. It is the six digits in your invitation email.'] },
    });
    expect(await joinMeeting({ token, name: 'R', passcode })).toMatchObject({ code: 'VALIDATION' });
    expect(await joinMeeting({ token, name: 'Rao Kumar', passcode })).toMatchObject({ ok: true });
    // A guest's own role keeps them out of the breakout setup (A-201).
    expect((await getMeetingLink(token)).join?.token).toBe(`guest-${raoId}`);
    // Another browser with the same link asks for the passcode again (A-223).
    signedOut();
    expect((await getMeetingLink(token)).join).toBeNull();
    await signInAs(w.faculty);
    expect((await getMeeting(id)).guests?.find((g) => g.id === raoId)).toMatchObject({
      name: 'Rao Kumar',
      state: 'joined',
    });
    // Removed: no token, put out again if they come back with one they kept, and no attendance in a meeting.
    removeFromRoom.mockClear();
    expect(await removeParticipant({ ...ref, identity: raoId })).toMatchObject({ ok: true });
    expect(removeFromRoom).toHaveBeenCalledWith(`ls-${id}`, raoId);
    switchBrowser(raos);
    expect(await getMeetingLink(token)).toMatchObject({ removed: true, join: null });
    expect(await joinMeeting({ token, name: 'Rao', passcode })).toMatchObject({ code: 'FORBIDDEN' });
    removeFromRoom.mockClear();
    await hook({ type: 'joined', host: false, roomName: `ls-${id}`, userId: raoId, sid: 'PA_g', at: new Date() });
    await hook({
      type: 'joined',
      host: false,
      roomName: `ls-${id}`,
      userId: String(w.taught._id),
      sid: 'PA_t',
      at: new Date(),
    });
    expect(removeFromRoom).toHaveBeenCalledExactlyOnceWith(`ls-${id}`, raoId);
    expect(await Attendance.countDocuments({ sessionId: id })).toBe(0);
    await signInAs(w.faculty);
    expect(await allowBack({ ...ref, identity: raoId })).toMatchObject({ ok: true });
    switchBrowser(raos);
    expect((await getMeetingLink(token)).join?.token).toBe(`guest-${raoId}`);
    expect(
      await AuditLog.countDocuments({ entityId: id, action: { $in: ['live.removed', 'live.allowed_back'] } }),
    ).toBe(2);
  });

  it('opens a member’s own room when they are signed in, and lets members and co-hosts join without signing in', async () => {
    const { w, id, passcode } = await running();
    const token = meetingLinkToken({ kind: 'member', sessionId: id, userId: String(w.taught._id) });
    await signInAs(w.taught);
    expect(await getMeetingLink(token)).toMatchObject({
      signedIn: true,
      person: { kind: 'member', name: w.taught.name },
    });
    await signInAs(w.untaught);
    expect((await getMeetingLink(token)).signedIn).toBe(false);
    signedOut();
    expect(await joinMeeting({ token, passcode })).toMatchObject({ ok: true });
    expect((await getMeetingLink(token)).join?.token).toBe(`participant-${w.taught._id}`);
    // A co-host who did not sign in takes part; hosting needs signing in (A-221).
    const cohost = meetingLinkToken({ kind: 'member', sessionId: id, userId: String(w.colleague._id) });
    expect(await joinMeeting({ token: cohost, passcode })).toMatchObject({ ok: true });
    expect((await getMeetingLink(cohost)).join?.token).toBe(`participant-${w.colleague._id}`);
    // Taken off the meeting, their link no longer opens it; nor does it open another meeting.
    await LiveSession.updateOne({ _id: id }, { $pull: { 'meeting.memberIds': w.taught._id } });
    await expect(getMeetingLink(token)).rejects.toThrow(NOT_FOUND);
    expect(await joinMeeting({ token, passcode })).toMatchObject({ code: 'NOT_FOUND' });
    const other = await schedule(w);
    const borrowed = token.replace(id, other);
    await expect(getMeetingLink(borrowed)).rejects.toThrow(NOT_FOUND);
  });

  it('limits wrong passcodes per link, and refuses an altered link and joining before the start', async () => {
    const w = await world();
    const id = await schedule(w);
    const doc = await LiveSession.findById(id).lean();
    const token = guestLink(doc?.meeting?.guests[0]._id);
    const passcode = doc?.meeting?.passcode ?? '';
    signedOut();
    await expect(getMeetingLink(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`)).rejects.toThrow(NOT_FOUND);
    expect(await joinMeeting({ token, name: 'Rao Kumar', passcode })).toMatchObject({ code: 'CLOSED' });
    await LiveSession.updateOne({ _id: id }, { $set: { status: 'live', startedAt: new Date() } });
    const wrong = passcode === '111111' ? '222222' : '111111';
    for (let i = 0; i < 9; i++) {
      expect(await joinMeeting({ token, name: 'Rao Kumar', passcode: wrong })).toMatchObject({ code: 'VALIDATION' });
    }
    // The CLOSED try above counted too: ten in all, and then even the right passcode waits.
    expect(await joinMeeting({ token, name: 'Rao Kumar', passcode })).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('lets a host copy anyone’s link and send one person’s invitation again, a few times an hour', async () => {
    const w = await world();
    const id = await schedule(w);
    await vi.waitFor(() => expect(mailsTo(id)).toHaveLength(4));
    const doc = await LiveSession.findById(id).lean();
    const raoId = String(doc?.meeting?.guests[0]._id);
    await signInAs(w.taught);
    expect((await getMeeting(id)).invitation).toBeNull();
    await expect(resendInvitation({ meetingId: id, personId: raoId })).rejects.toThrow(NOT_FOUND);
    await signInAs(w.colleague);
    const { invitation } = await getMeeting(id);
    expect(invitation?.passcode).toBe(doc?.meeting?.passcode);
    expect(linkHolderOf(linkIn(invitation?.links[raoId]))).toEqual({ kind: 'guest', guestId: raoId });
    expect(linkHolderOf(linkIn(invitation?.links[String(w.taught._id)]))).toMatchObject({ kind: 'member' });
    sendMail.mockClear();
    expect(await resendInvitation({ meetingId: id, personId: raoId })).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(mailsTo(id)).toHaveLength(1));
    expect(mailsTo(id)[0]).toMatchObject({
      to: 'rao.kumar@example.com',
      subject: expect.stringMatching(/^Invitation: /),
    });
    expect(await resendInvitation({ meetingId: id, personId: raoId })).toMatchObject({ ok: true });
    expect(await resendInvitation({ meetingId: id, personId: raoId })).toMatchObject({ ok: true });
    expect(await resendInvitation({ meetingId: id, personId: raoId })).toMatchObject({ code: 'RATE_LIMITED' });
    await vi.waitFor(() => expect(mailsTo(id)).toHaveLength(3));
    expect(await resendInvitation({ meetingId: id, personId: String(w.untaught._id) })).toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('ending a meeting', () => {
  it('ends it for everyone from its room and finalizes it without attendance', async () => {
    const w = await world();
    const id = await schedule(w);
    await LiveSession.updateOne({ _id: id }, { $set: { status: 'live', startedAt: new Date(Date.now() - 30 * MIN) } });
    await signInAs(w.taught);
    await expect(endRoom({ sessionId: id })).rejects.toThrow(NOT_FOUND);
    await signInAs(w.colleague);
    closeRoom.mockClear();
    expect(await endRoom({ sessionId: id })).toMatchObject({ ok: true });
    expect(closeRoom).toHaveBeenCalledWith(`ls-${id}`);
    await vi.waitFor(async () => expect((await LiveSession.findById(id).lean())?.finalizedAt).toBeInstanceOf(Date));
    expect(await LiveSession.findById(id).lean()).toMatchObject({ status: 'ended' });
    expect(await Attendance.countDocuments({ sessionId: id })).toBe(0);
  });
});

describe('recording (M03c T5)', () => {
  const get = (key: string) =>
    file(new Request(`http://localhost:3000/api/files/${key}`), { params: Promise.resolve({ key: key.split('/') }) });
  const saved = (roomName: string, egressId: string, key = '') =>
    hook({ type: 'recording', roomName, egressId, key, status: 'saved', durationSec: 3120, at: new Date() });
  const recordingsOf = async (id: string) => (await LiveSession.findById(id).lean())?.recordings ?? [];

  it('lets a host record a meeting once at a time, tells the room, and plays it to its people only', async () => {
    const w = await world();
    const id = await schedule(w);
    await LiveSession.updateOne({ _id: id }, { $set: { status: 'live', startedAt: new Date() } });
    const ref = { sessionId: id };
    await signInAs(w.taught);
    await expect(startRecording(ref)).rejects.toThrow(NOT_FOUND);
    await signInAs(w.faculty);
    tell.mockClear();
    expect(await startRecording(ref)).toMatchObject({ ok: true });
    expect(await startRecording(ref)).toMatchObject({ code: 'CONFLICT' });
    const [recording] = (await LiveSession.findById(id).lean())?.recordings ?? [];
    expect(recording).toMatchObject({ status: 'recording', egressId: expect.stringMatching(/^EG_/) });
    expect(recording.key).toMatch(new RegExp(`^live-recording/${id}/${w.faculty._id}/[\\w-]+\\.mp4$`));
    expect(tell).toHaveBeenCalledWith(
      `ls-${id}`,
      'notice',
      `${w.faculty.name} started recording this meeting. It goes on the meeting page.`,
    );
    egress.stop.mockClear();
    expect(await stopRecording(ref)).toMatchObject({ ok: true });
    expect(egress.stop).toHaveBeenCalledWith(`ls-${id}`, recording.egressId);
    // Not playable until Egress says the file is saved.
    await signInAs(w.taught);
    expect((await get(recording.key)).status).toBe(404);
    await saved(`ls-${id}`, recording.egressId);
    expect((await getMeeting(id)).recordings).toEqual([
      { key: recording.key, startedAt: expect.any(Date), durationSec: 3120, by: w.faculty.name },
    ]);
    expect((await get(recording.key)).status).toBe(302);
    await signInAs(w.untaught);
    expect((await get(recording.key)).status).toBe(404);
    expect(
      await AuditLog.countDocuments({
        entityId: id,
        action: { $in: ['live.recording_started', 'live.recording_stopped'] },
      }),
    ).toBe(2);
  });

  it('records a class for its students to watch, and starts nothing in a room nobody has joined', async () => {
    const w = await world();
    const offering = await makeOffering({ facultyIds: [w.faculty._id], status: 'active' });
    await enroll(offering._id, w.taught._id);
    const _id = newId();
    await LiveSession.create({
      _id,
      offeringId: offering._id,
      title: 'Pointers',
      scheduledStart: new Date(Date.now() - 10 * MIN),
      scheduledEnd: new Date(Date.now() + 50 * MIN),
      status: 'live',
      startedAt: new Date(),
      roomName: `ls-${_id}`,
      attendanceMode: 'derived',
      createdBy: w.faculty._id,
    });
    const ref = { sessionId: String(_id) };
    await signInAs(w.faculty);
    expect((await getSession(String(offering._id), String(_id))).canRecord).toBe(true);
    egress.open = false;
    expect(await startRecording(ref)).toMatchObject({ code: 'CLOSED' });
    expect((await LiveSession.findById(_id).lean())?.recordings).toEqual([]);
    egress.open = true;
    expect(await startRecording(ref)).toMatchObject({ ok: true });
    const [recording] = (await LiveSession.findById(_id).lean())?.recordings ?? [];
    await saved(`ls-${_id}`, recording.egressId);
    await signInAs(w.taught);
    expect((await getSession(String(offering._id), String(_id))).recordings).toHaveLength(1);
    expect((await getSession(String(offering._id), String(_id))).canRecord).toBe(false);
    expect((await get(recording.key)).status).toBe(302);
    await signInAs(w.untaught);
    expect((await get(recording.key)).status).toBe(404);
  });

  it('takes the engine’s word: a start that timed out, a lost id, a lost webhook and the room closing (T13)', async () => {
    const w = await world();
    const id = await schedule(w);
    await LiveSession.updateOne({ _id: id }, { $set: { status: 'live', startedAt: new Date() } });
    const ref = { sessionId: id };
    const roomName = `ls-${id}`;
    await signInAs(w.faculty);

    // The engine started recording but did not answer in time: the row keeps the recording it found.
    egress.timeOut = true;
    expect(await startRecording(ref)).toMatchObject({ ok: true });
    const [first] = await recordingsOf(id);
    expect(first).toMatchObject({ status: 'recording', egressId: expect.stringMatching(/^EG_/) });

    // Its id is lost: Stop still stops what the engine records, and the webhook finds the row by its file.
    await LiveSession.updateOne({ _id: id }, { $set: { 'recordings.0.egressId': '' } });
    egress.stop.mockClear();
    expect(await stopRecording(ref)).toMatchObject({ ok: true });
    expect(egress.stop).toHaveBeenCalledWith(roomName, first.egressId);
    await saved(roomName, first.egressId, first.key);
    expect((await recordingsOf(id))[0]).toMatchObject({ status: 'saved', egressId: first.egressId, durationSec: 3120 });
    expect(await stopRecording(ref)).toMatchObject({ code: 'CONFLICT', message: 'Nothing is being recorded.' });

    // The engine finished one whose webhook never came: the next start settles it from the engine and records.
    expect(await startRecording(ref)).toMatchObject({ ok: true });
    const second = (await recordingsOf(id))[1];
    egress.running.delete(second.egressId);
    egress.ended.set(second.egressId, { egressId: second.egressId, key: second.key, status: 'saved', durationSec: 40 });
    expect(await startRecording(ref)).toMatchObject({ ok: true });
    expect((await recordingsOf(id)).map((r) => [r.status, r.durationSec ?? null])).toEqual([
      ['saved', 3120],
      ['saved', 40],
      ['recording', null],
    ]);

    // The room closes with it recording and no word from the engine: the worker settles it.
    const third = (await recordingsOf(id))[2];
    egress.running.delete(third.egressId);
    await queueLiveControl({ op: 'settleRecordings', sessionId: id });
    await vi.waitFor(async () => expect((await recordingsOf(id))[2]?.status).toBe('failed'));
  });
});

describe('polls (M03c T6)', () => {
  async function running() {
    const w = await world();
    const id = await schedule(w);
    await LiveSession.updateOne({ _id: id }, { $set: { status: 'live', startedAt: new Date() } });
    return { w, id, ref: { sessionId: id } };
  }
  const options = async (id: string) => (await LiveSession.findById(id).lean())?.polls?.at(-1);

  it('lets a host ask one poll at a time, its people answer and change their answer, and counts them for hosts', async () => {
    const { w, id, ref } = await running();
    const ask = {
      ...ref,
      question: 'Which line declares a pointer?',
      'option[]': [' int *p; ', 'int p;', 'int *p;', ''],
    };
    await signInAs(w.taught);
    await expect(createPoll({ ...ask, showResults: true })).rejects.toThrow(NOT_FOUND);
    await signInAs(w.faculty);
    tell.mockClear();
    expect(await createPoll({ ...ask, showResults: true })).toMatchObject({ ok: true });
    expect(tell).toHaveBeenCalledWith(`ls-${id}`, 'poll', 'started');
    expect(await createPoll({ ...ask, showResults: true })).toMatchObject({ code: 'CONFLICT' });
    expect(
      await createPoll({ ...ref, question: 'One option', 'option[]': ['a', 'a'], showResults: true }),
    ).toMatchObject({
      code: 'VALIDATION',
    });
    const poll = await options(id);
    expect(poll?.options.map((o) => o.text)).toEqual(['int *p;', 'int p;']);
    const [right, wrong] = (poll?.options ?? []).map((o) => String(o._id));
    const pollId = String(poll?._id);
    expect(await answerPoll({ ...ref, pollId, optionId: right })).toMatchObject({ code: 'FORBIDDEN' });
    await signInAs(w.taught);
    expect(await answerPoll({ ...ref, pollId, optionId: wrong })).toMatchObject({ ok: true });
    expect(await answerPoll({ ...ref, pollId, optionId: right })).toMatchObject({ ok: true });
    expect(await PollAnswer.countDocuments({ pollId })).toBe(1);
    // The member sees their own answer but no counts; a host sees the counts as they come in.
    expect((await getMeetingRoom(id)).polls).toEqual([
      expect.objectContaining({
        status: 'open',
        mine: right,
        answered: null,
        options: [expect.objectContaining({ count: null }), expect.objectContaining({ count: null })],
      }),
    ]);
    await signInAs(w.colleague);
    expect((await getMeetingRoom(id)).polls[0]).toMatchObject({ answered: 1, options: [{ count: 1 }, { count: 0 }] });
    expect(await showPollResults({ ...ref, pollId })).toMatchObject({ ok: true });
    await signInAs(w.taught);
    expect((await getMeetingRoom(id)).polls[0]).toMatchObject({ shared: true, answered: 1 });
    await signInAs(w.faculty);
    expect(await endPoll({ ...ref, pollId })).toMatchObject({ ok: true });
    await signInAs(w.taught);
    expect(await answerPoll({ ...ref, pollId, optionId: wrong })).toMatchObject({ code: 'CLOSED' });
    await signInAs(w.untaught);
    await expect(answerPoll({ ...ref, pollId, optionId: wrong })).rejects.toThrow(NOT_FOUND);
  });

  it('keeps an ended poll’s results with the hosts unless they show them', async () => {
    const { w, id, ref } = await running();
    await signInAs(w.faculty);
    await createPoll({ ...ref, question: 'Ready?', 'option[]': ['Yes', 'No'], showResults: false });
    const pollId = String((await options(id))?._id);
    await endPoll({ ...ref, pollId });
    await signInAs(w.taught);
    expect((await getMeetingRoom(id)).polls).toEqual([]);
    await signInAs(w.faculty);
    expect((await getMeetingRoom(id)).polls[0]).toMatchObject({ status: 'ended', answered: 0 });
    // A new poll can start once the last has ended.
    expect(
      await createPoll({ ...ref, question: 'Again?', 'option[]': ['Yes', 'No'], showResults: true }),
    ).toMatchObject({
      ok: true,
    });
  });
});

describe('breakout rooms (M03c T7)', () => {
  it('sends the people taking part to rooms, gives each a token for their own, and lets hosts visit any', async () => {
    const w = await world();
    const other = await makeUser({ roles: ['student'] });
    const offering = await makeOffering({ facultyIds: [w.faculty._id], status: 'active' });
    await enroll(offering._id, other._id);
    const id = await schedule(w, { 'member[]': [String(w.taught._id), String(other._id)] });
    await LiveSession.updateOne({ _id: id }, { $set: { status: 'live', startedAt: new Date() } });
    const ref = { sessionId: id };
    const assign = (...pairs: [{ _id: unknown }, number][]) => pairs.map(([u, room]) => `${String(u._id)}:${room}`);
    await signInAs(w.faculty);
    expect(await openBreakouts({ ...ref, rooms: 2, limitMin: 0, 'assign[]': assign([w.untaught, 1]) })).toMatchObject({
      code: 'VALIDATION',
    });
    expect(await openBreakouts({ ...ref, rooms: 2, limitMin: 0, 'assign[]': assign([w.taught, 3]) })).toMatchObject({
      code: 'VALIDATION',
    });
    tell.mockClear();
    expect(
      await openBreakouts({ ...ref, rooms: 2, limitMin: 15, 'assign[]': assign([w.taught, 1], [other, 2]) }),
    ).toMatchObject({ ok: true });
    expect(tell).toHaveBeenCalledWith(`ls-${id}`, 'breakout', 'opened');
    expect(await openBreakouts({ ...ref, rooms: 2, limitMin: 0, 'assign[]': assign([w.taught, 1]) })).toMatchObject({
      code: 'CONFLICT',
    });
    const host = (await getMeetingRoom(id)).breakout;
    expect(host).toMatchObject({
      rooms: 2,
      mine: null,
      assigned: [
        { room: 1, people: [w.taught.name] },
        { room: 2, people: [other.name] },
      ],
    });
    expect(host?.closesAt?.getTime()).toBeGreaterThan(Date.now() + 14 * MIN);
    // A token for one's own room; a host's for any.
    await signInAs(w.taught);
    expect((await getMeetingRoom(id)).breakout).toMatchObject({
      mine: 1,
      assigned: [{ room: 1, people: [w.taught.name] }],
    });
    joinToken.mockClear();
    expect(await roomToken({ ...ref, room: 1 })).toMatchObject({
      ok: true,
      data: { token: `participant-${w.taught._id}` },
    });
    expect(joinToken).toHaveBeenCalledWith(expect.objectContaining({ roomName: `ls-${id}-b1`, role: 'participant' }));
    expect(await roomToken({ ...ref, room: 2 })).toMatchObject({ code: 'FORBIDDEN' });
    expect(await roomToken({ ...ref, room: 0 })).toMatchObject({ ok: true });
    await signInAs(w.colleague);
    expect(await roomToken({ ...ref, room: 2 })).toMatchObject({
      ok: true,
      data: { token: `host-${w.colleague._id}` },
    });
    // A message reaches every room; closing brings everyone back within a minute, then the worker closes the rooms.
    tell.mockClear();
    expect(await messageBreakouts({ ...ref, text: 'Five minutes left' })).toMatchObject({ ok: true });
    expect(tell.mock.calls.map(([room, topic]) => [room, topic])).toEqual([
      [`ls-${id}-b1`, 'notice'],
      [`ls-${id}-b2`, 'notice'],
    ]);
    tell.mockClear();
    expect(await closeBreakouts(ref)).toMatchObject({ ok: true });
    const closesAt = (await LiveSession.findById(id).lean())?.breakout?.closesAt?.getTime() ?? 0;
    expect(closesAt).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(tell).toHaveBeenCalledWith(`ls-${id}-b2`, 'breakout', 'closing');
    await LiveSession.updateOne({ _id: id }, { $set: { 'breakout.closesAt': new Date(Date.now() - 1000) } });
    closeRoom.mockClear();
    await queueLiveControl({ op: 'closeBreakouts', sessionId: id });
    await vi.waitFor(async () =>
      expect((await LiveSession.findById(id).lean())?.breakout?.closedAt).toBeInstanceOf(Date),
    );
    expect(closeRoom.mock.calls).toEqual([[`ls-${id}-b1`], [`ls-${id}-b2`]]);
    await signInAs(w.taught);
    expect((await getMeetingRoom(id)).breakout).toBeNull();
    expect(await roomToken({ ...ref, room: 1 })).toMatchObject({ code: 'CLOSED' });
  });

  it('counts a student’s time in a breakout room as time in the class, and closes the rooms when the class ends', async () => {
    const w = await world();
    const offering = await makeOffering({ facultyIds: [w.faculty._id], status: 'active' });
    await enroll(offering._id, w.taught._id);
    const _id = newId();
    await LiveSession.create({
      _id,
      offeringId: offering._id,
      title: 'Pointers',
      scheduledStart: new Date(Date.now() - 10 * MIN),
      scheduledEnd: new Date(Date.now() + 50 * MIN),
      status: 'live',
      startedAt: new Date(Date.now() - 10 * MIN),
      roomName: `ls-${_id}`,
      attendanceMode: 'derived',
      createdBy: w.faculty._id,
    });
    await signInAs(w.faculty);
    expect(
      await openBreakouts({ sessionId: String(_id), rooms: 2, limitMin: 0, 'assign[]': [`${w.taught._id}:2`] }),
    ).toMatchObject({ ok: true });
    await hook({
      type: 'joined',
      host: false,
      roomName: `ls-${_id}-b2`,
      userId: String(w.taught._id),
      sid: 'PA_b',
      at: new Date(),
    });
    expect((await Attendance.findOne({ sessionId: _id, studentId: w.taught._id }).lean())?.presence).toEqual([
      expect.objectContaining({ sid: 'PA_b', leftAt: null }),
    ]);
    // A breakout room closing does not end the class.
    await hook({ type: 'room_finished', roomName: `ls-${_id}-b2`, at: new Date() });
    expect((await LiveSession.findById(_id).lean())?.status).toBe('live');
    closeRoom.mockClear();
    expect(await endRoom({ sessionId: String(_id) })).toMatchObject({ ok: true });
    expect(closeRoom.mock.calls).toEqual([[`ls-${_id}-b1`], [`ls-${_id}-b2`], [`ls-${_id}`]]);
  });
});

describe('the whiteboard (M03c T8)', () => {
  it('lets a host open it for everyone, guests included, decide who draws, and close it', async () => {
    const w = await world();
    const id = await schedule(w);
    await LiveSession.updateOne({ _id: id }, { $set: { status: 'live', startedAt: new Date() } });
    const ref = { sessionId: id };
    const rao = (await LiveSession.findById(id).lean())?.meeting?.guests[0];
    const token = guestLink(rao?._id);
    await signInAs(w.taught);
    await expect(openBoard({ ...ref, studentsDraw: true })).rejects.toThrow(NOT_FOUND);
    expect((await getMeetingRoom(id)).board).toBeNull();
    await signInAs(w.faculty);
    tell.mockClear();
    expect(await openBoard({ ...ref, studentsDraw: false })).toMatchObject({ ok: true });
    expect(tell).toHaveBeenCalledWith(`ls-${id}`, 'board', 'opened');
    await signInAs(w.taught);
    expect((await getMeetingRoom(id)).board).toEqual({ studentsDraw: false });
    expect((await getMeetingLink(token)).board).toEqual({ studentsDraw: false });
    await signInAs(w.colleague);
    expect(await setBoardDrawing({ ...ref, allowed: true })).toMatchObject({ ok: true });
    expect((await getMeetingRoom(id)).board).toEqual({ studentsDraw: true });
    expect(await closeBoard(ref)).toMatchObject({ ok: true });
    expect((await getMeetingRoom(id)).board).toBeNull();
    expect(tell).toHaveBeenCalledWith(`ls-${id}`, 'board', 'closed');
  });
});
