import 'server-only';
import { notFound } from 'next/navigation';
import { isValidObjectId, Types } from 'mongoose';
import { roomAccess, type RoomRole } from '@/lib/auth/access';
import { guestIdOf } from '@/lib/auth/guest-link';
import { requireViewer, type Viewer } from '@/lib/auth/session';
import {
  roomBreakout,
  roomControls,
  roomPolls,
  savedRecordings,
  START_EARLY_MS,
  toRow,
  type LiveSessionRow,
  type RecordingRow,
  type RoomBreakout,
  type RoomControls,
  type RoomPoll,
} from '@/lib/data/live';
import { db } from '@/lib/db';
import { joinToken, recordingEnabled } from '@/lib/integrations/live';
import { Enrollment } from '@/lib/models/enrollment';
import { LiveSession, type LiveSessionDoc } from '@/lib/models/live-session';
import { Offering } from '@/lib/models/offering';
import { User } from '@/lib/models/user';
import { pageSize } from '@/lib/schemas/common';
import { ALL_RIGHTS, type PEOPLE_SCOPES } from '@/lib/schemas/live';

// M03c T4 (05 §4.3): a meeting is a live session without a course; the Meetings page lists the ones the viewer hosts
// or is invited to, and its own page and room follow its people (roomAccess).

export const STAFF_ROLES = ['faculty', 'hod', 'admin'] as const;
const isStaff = (roles: readonly string[]) => roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r));

type PeopleScope = (typeof PEOPLE_SCOPES)[number];
// `staff`: the people who may be made co-hosts (faculty, heads of department, admins).
export type Person = { id: string; name: string; detail: string; staff: boolean };

type Candidate = {
  _id: Types.ObjectId;
  name: string;
  email: string;
  rollNo?: string | null;
  roles: string[];
  departmentId?: Types.ObjectId | null;
};

// 09 §3: whom a member of staff may invite — staff, and the students they can already see: an admin every student, a
// head of department their department's, a teacher those enrolled in the classes they teach.
async function invitable(viewer: Viewer, people: Candidate[]): Promise<Candidate[]> {
  if (viewer.roles.includes('admin')) return people;
  const students = people.filter((p) => !isStaff(p.roles));
  const teaches = viewer.roles.includes('faculty')
    ? await Offering.find({ facultyIds: new Types.ObjectId(viewer.id) }, { _id: 1 }).lean()
    : [];
  const taught = new Set(
    teaches.length > 0 && students.length > 0
      ? (
          await Enrollment.distinct('studentId', {
            offeringId: { $in: teaches.map((o) => o._id) },
            studentId: { $in: students.map((p) => p._id) },
            status: 'active',
          })
        ).map(String)
      : [],
  );
  return people.filter(
    (p) =>
      isStaff(p.roles) ||
      taught.has(String(p._id)) ||
      (viewer.roles.includes('hod') && viewer.departmentId !== null && p.departmentId?.equals(viewer.departmentId)),
  );
}

const CANDIDATE_FIELDS = { name: 1, email: 1, rollNo: 1, roles: 1, departmentId: 1 } as const;
const personOf = (p: Candidate): Person => ({
  id: String(p._id),
  name: p.name,
  detail: p.rollNo ?? p.email,
  staff: isStaff(p.roles),
});
const SCOPE_ROLES = {
  all: [...STAFF_ROLES, 'student'],
  staff: STAFF_ROLES,
  faculty: ['faculty'],
} as const;

// The people picker (T4): an email or roll number finds that person; words find names (the users' text index). Ten
// at most; co-hosts are staff only, an offering's faculty faculty only. The viewer is left out, except as faculty.
export async function findPeople(viewer: Viewer, q: string, scope: PeopleScope): Promise<Person[]> {
  await db();
  const match = q.includes('@')
    ? { email: q.toLowerCase() }
    : /\d/.test(q)
      ? { $or: [{ rollNo: q.toUpperCase() }, { $text: { $search: q } }] }
      : { $text: { $search: q } };
  const found = await User.find(
    {
      ...match,
      status: { $ne: 'disabled' },
      roles: { $in: [...SCOPE_ROLES[scope]] },
      ...(scope === 'faculty' ? {} : { _id: { $ne: new Types.ObjectId(viewer.id) } }),
    },
    CANDIDATE_FIELDS,
  )
    .limit(30)
    .lean<Candidate[]>();
  return (await invitable(viewer, found)).slice(0, 10).map(personOf);
}

// A pasted list (the meeting's people field): each email or roll number that is someone the viewer may invite, with
// that person; the keys that match nobody are left out, for the field to treat as guests or report.
export async function matchPeople(viewer: Viewer, keys: string[]): Promise<{ key: string; person: Person }[]> {
  await db();
  const emails = keys.filter((k) => k.includes('@')).map((k) => k.toLowerCase());
  const rollNos = keys.filter((k) => !k.includes('@')).map((k) => k.toUpperCase());
  const found = await User.find(
    {
      $or: [{ email: { $in: emails } }, { rollNo: { $in: rollNos } }],
      status: { $ne: 'disabled' },
      roles: { $in: [...SCOPE_ROLES.all] },
      _id: { $ne: new Types.ObjectId(viewer.id) },
    },
    CANDIDATE_FIELDS,
  )
    .limit(keys.length)
    .lean<Candidate[]>();
  const allowed = await invitable(viewer, found);
  return keys.flatMap((key) => {
    const person = allowed.find((p) => p.email === key.toLowerCase() || p.rollNo === key.toUpperCase());
    return person ? [{ key, person: personOf(person) }] : [];
  });
}

// The people a save names must all be ones the viewer may invite (co-hosts staff); returns them for the emails.
export async function requireInvitable(viewer: Viewer, coHostIds: string[], memberIds: string[]): Promise<Person[]> {
  const ids = [...coHostIds, ...memberIds];
  if (ids.length === 0) return [];
  const found = await User.find({ _id: { $in: ids }, status: { $ne: 'disabled' } }, CANDIDATE_FIELDS).lean<
    Candidate[]
  >();
  const allowed = await invitable(viewer, found);
  const ok = new Set(allowed.map((p) => String(p._id)));
  const staffOk = coHostIds.every((id) => found.some((p) => String(p._id) === id && isStaff(p.roles)));
  return ids.every((id) => ok.has(id)) && staffOk ? allowed.map(personOf) : [];
}

export type MeetingRow = LiveSessionRow & { hosts: string; hosting: boolean; people: number; guests: number };

export type MeetingList = {
  canSchedule: boolean;
  upcoming: MeetingRow[];
  upcomingTotal: number;
  past: MeetingRow[];
  pastTotal: number;
};

type MeetingDoc = Pick<
  LiveSessionDoc,
  | 'title'
  | 'status'
  | 'attendanceMode'
  | 'scheduledStart'
  | 'scheduledEnd'
  | 'startedAt'
  | 'endedAt'
  | 'finalizedAt'
  | 'meeting'
> & { _id: Types.ObjectId };

const MEETING_FIELDS = {
  title: 1,
  status: 1,
  attendanceMode: 1,
  scheduledStart: 1,
  scheduledEnd: 1,
  startedAt: 1,
  endedAt: 1,
  finalizedAt: 1,
  meeting: 1,
} as const;

async function rows(docs: MeetingDoc[], viewer: Viewer, now: Date): Promise<MeetingRow[]> {
  const hostIds = docs.flatMap((d) => d.meeting?.hostIds ?? []);
  const hosts = await User.find({ _id: { $in: hostIds } }, { name: 1 }).lean();
  const nameOf = (id: Types.ObjectId) => hosts.find((u) => u._id.equals(id))?.name ?? 'Someone';
  return docs.map((doc) => ({
    ...toRow(doc, now),
    hosts: (doc.meeting?.hostIds ?? []).map(nameOf).join(', '),
    hosting: doc.meeting?.hostIds.some((id) => id.equals(viewer.id)) === true,
    people: doc.meeting?.memberIds.length ?? 0,
    guests: doc.meeting?.guests.length ?? 0,
  }));
}

// The Meetings page: still ahead (or running), soonest first; then past and cancelled ones, latest first. Both page
// (indexes meeting.hostIds and meeting.memberIds with scheduledStart).
export async function listMeetings(upcomingPage: number, pastPage: number): Promise<MeetingList> {
  const viewer = await requireViewer();
  await db();
  const now = new Date();
  const me = new Types.ObjectId(viewer.id);
  const mine = { kind: 'meeting' as const, $or: [{ 'meeting.hostIds': me }, { 'meeting.memberIds': me }] };
  const ahead = { $or: [{ status: 'live' as const }, { status: 'scheduled' as const, scheduledEnd: { $gte: now } }] };
  const over = {
    $or: [
      { status: { $in: ['ended' as const, 'cancelled' as const] } },
      { status: 'scheduled' as const, scheduledEnd: { $lt: now } },
    ],
  };
  const [upcoming, upcomingTotal, past, pastTotal] = await Promise.all([
    LiveSession.find({ $and: [mine, ahead] }, MEETING_FIELDS)
      .sort({ scheduledStart: 1 })
      .skip((upcomingPage - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    LiveSession.countDocuments({ $and: [mine, ahead] }),
    LiveSession.find({ $and: [mine, over] }, MEETING_FIELDS)
      .sort({ scheduledStart: -1 })
      .skip((pastPage - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    LiveSession.countDocuments({ $and: [mine, over] }),
  ]);
  return {
    canSchedule: isStaff(viewer.roles),
    upcoming: await rows(upcoming, viewer, now),
    upcomingTotal,
    past: await rows(past, viewer, now),
    pastTotal,
  };
}

export type GuestState = 'invited' | 'waiting' | 'denied' | 'admitted' | 'removed';

export type MeetingDetail = {
  id: string;
  session: LiveSessionRow;
  role: Exclude<RoomRole, 'watch'>;
  // The scheduler, who stays a host; then the co-hosts.
  owner: Person;
  coHosts: Person[];
  members: Person[];
  // Hosts only: who was invited by email and where they are.
  guests: { id: string; email: string; name: string | null; state: GuestState }[] | null;
  canStartAt: Date;
  canEdit: boolean;
  recordings: RecordingRow[];
};

function guestState(
  doc: Pick<LiveSessionDoc, 'removed' | 'waiting'>,
  guest: { _id: Types.ObjectId; admittedAt?: Date | null; deniedAt?: Date | null },
): GuestState {
  if (doc.removed?.some((r) => r.userId.equals(guest._id))) return 'removed';
  if (doc.waiting?.some((w) => w.guestId.equals(guest._id))) return 'waiting';
  if (guest.admittedAt) return 'admitted';
  return guest.deniedAt ? 'denied' : 'invited';
}

async function findMeeting(viewer: Viewer, meetingId: string) {
  if (!isValidObjectId(meetingId)) notFound();
  const access = await roomAccess(viewer, meetingId);
  if (access.kind !== 'meeting' || access.role === 'watch') notFound();
  const doc = await LiveSession.findById(meetingId, {
    ...MEETING_FIELDS,
    roomName: 1,
    studentsMay: 1,
    removed: 1,
    waiting: 1,
    recordings: 1,
    polls: 1,
    breakout: 1,
    board: 1,
  }).lean();
  if (!doc?.meeting) notFound();
  return { doc: { ...doc, meeting: doc.meeting }, role: access.role };
}

// The meeting's own page (and the edit dialog): when, who, and for hosts the guests.
export async function getMeeting(meetingId: string): Promise<MeetingDetail> {
  const viewer = await requireViewer();
  const { doc, role } = await findMeeting(viewer, meetingId);
  const now = new Date();
  const session = toRow(doc, now);
  const users = await User.find(
    { _id: { $in: [...doc.meeting.hostIds, ...doc.meeting.memberIds] } },
    { name: 1, email: 1, rollNo: 1, roles: 1 },
  ).lean();
  const person = (id: Types.ObjectId): Person => {
    const u = users.find((x) => x._id.equals(id));
    return {
      id: String(id),
      name: u?.name ?? 'Someone',
      detail: u ? (u.rollNo ?? u.email) : '',
      staff: u ? isStaff(u.roles) : false,
    };
  };
  const [owner, ...coHosts] = doc.meeting.hostIds.map(person);
  return {
    id: meetingId,
    session,
    role,
    owner,
    coHosts,
    members: doc.meeting.memberIds.map(person),
    guests:
      role === 'host'
        ? doc.meeting.guests.map((g) => ({
            id: String(g._id),
            email: g.email,
            name: g.name ?? null,
            state: guestState(doc, g),
          }))
        : null,
    canStartAt: new Date(doc.scheduledStart.getTime() - START_EARLY_MS),
    canEdit: role === 'host' && session.state === 'upcoming',
    recordings: await savedRecordings(doc),
  };
}

export type MeetingRoom = {
  session: LiveSessionRow;
  host: boolean;
  join: { serverUrl: string; token: string } | null;
  removed: boolean;
  controls: RoomControls | null;
  canRecord: boolean;
  polls: RoomPoll[];
  breakout: RoomBreakout | null;
  board: { studentsDraw: boolean } | null;
  invited: number;
  canStartAt: Date;
};

// The meeting's room, for its hosts and members: a token while it runs (not for someone a host removed), and the host
// controls with the waiting guests.
export async function getMeetingRoom(meetingId: string): Promise<MeetingRoom> {
  const viewer = await requireViewer();
  const { doc, role } = await findMeeting(viewer, meetingId);
  const session = toRow(doc, new Date());
  const host = role === 'host';
  const removed = !host && (doc.removed ?? []).some((r) => r.userId.equals(viewer.id));
  const live = doc.status === 'live';
  const [join, controls, polls, breakout] = await Promise.all([
    live && !removed
      ? joinToken({
          roomName: doc.roomName,
          userId: viewer.id,
          name: viewer.name,
          role: host ? 'host' : 'participant',
          rights: { ...ALL_RIGHTS, ...doc.studentsMay },
        })
      : null,
    live && host ? roomControls(doc) : null,
    live && !removed ? roomPolls(doc, viewer.id, host) : [],
    live && !removed ? roomBreakout(doc, viewer.id, host, new Date()) : null,
  ]);
  return {
    session,
    host,
    join,
    removed,
    controls,
    canRecord: live && host && recordingEnabled(),
    polls,
    breakout,
    board: live && doc.board ? { studentsDraw: doc.board.studentsDraw } : null,
    invited: doc.meeting.hostIds.length + doc.meeting.memberIds.length + doc.meeting.guests.length,
    canStartAt: new Date(doc.scheduledStart.getTime() - START_EARLY_MS),
  };
}

export type GuestLobby = {
  sessionId: string;
  session: LiveSessionRow;
  hosts: string;
  guest: { email: string; name: string | null; state: GuestState };
  join: { serverUrl: string; token: string } | null;
  board: { studentsDraw: boolean } | null;
  invited: number;
};

// The guest's page (decision 7): their personal link names them. Signed out; a link whose signature does not match,
// or whose guest was taken off the meeting, is not found.
export async function getGuestLobby(token: string): Promise<GuestLobby> {
  const guestId = guestIdOf(token);
  if (!guestId || !isValidObjectId(guestId)) notFound();
  await db();
  const doc = await LiveSession.findOne(
    { kind: 'meeting', 'meeting.guests._id': new Types.ObjectId(guestId) },
    { ...MEETING_FIELDS, roomName: 1, studentsMay: 1, removed: 1, waiting: 1, board: 1 },
  ).lean();
  const guest = doc?.meeting?.guests.find((g) => g._id.equals(guestId));
  if (!doc?.meeting || !guest) notFound();
  const state = guestState(doc, guest);
  const hosts = await User.find({ _id: { $in: doc.meeting.hostIds } }, { name: 1 }).lean();
  return {
    sessionId: String(doc._id),
    session: toRow(doc, new Date()),
    hosts: doc.meeting.hostIds.map((id) => hosts.find((u) => u._id.equals(id))?.name ?? 'Someone').join(', '),
    guest: { email: guest.email, name: guest.name ?? null, state },
    join:
      doc.status === 'live' && state === 'admitted'
        ? await joinToken({
            roomName: doc.roomName,
            userId: guestId,
            name: guest.name ?? guest.email,
            role: 'guest',
            rights: { ...ALL_RIGHTS, ...doc.studentsMay },
          })
        : null,
    board: doc.status === 'live' && doc.board ? { studentsDraw: doc.board.studentsDraw } : null,
    invited: doc.meeting.hostIds.length + doc.meeting.memberIds.length + doc.meeting.guests.length,
  };
}
