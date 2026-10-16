import { beforeAll, describe, expect, it } from 'vitest';
import { fillCalendarFromCourse } from '@/app/(app)/courses/[offeringId]/plan/actions';
import { getOfferingCourse } from '@/lib/data/courses';
import { db } from '@/lib/db';
import { istDateToDate, istDayKey } from '@/lib/domain/time';
import { getHomeSummary, getWorkspace, listMyOfferings, listRoster } from '@/lib/data/workspace';
import { AuditLog } from '@/lib/models/audit-log';
import { Course } from '@/lib/models/course';
import { Department } from '@/lib/models/department';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Term } from '@/lib/models/term';
import { enroll, form, makeCourse, makeOffering, makeProgram, makeUser, newId, signInAs } from '../factories';
import { switchBrowser } from '../next-request';

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const redirectsTo = (path: string) => ({ digest: expect.stringMatching(new RegExp(`;${path};`)) });

beforeAll(async () => {
  await db();
  await Promise.all([Course, Department, Enrollment, Offering, Program, Term].map((m) => m.createCollection()));
});

let seq = 0;

// Two departments, each with a faculty member, a head of department and one active offering; plus a draft in dept A.
async function world() {
  const n = ++seq;
  const [deptA, deptB] = await Department.create([
    { code: `WA${n}`, name: 'Dept A' },
    { code: `WB${n}`, name: 'Dept B' },
  ]);
  const term = await Term.create({
    code: `WT${n}`,
    name: 'Odd 2026',
    academicYear: '2026-27',
    startsOn: new Date(),
    endsOn: new Date(),
    status: 'current',
  });
  const facultyA = await makeUser({ roles: ['faculty'], departmentId: deptA._id });
  const facultyB = await makeUser({ roles: ['faculty'], departmentId: deptB._id });
  const hodA = await makeUser({ roles: ['hod'], departmentId: deptA._id });
  const base = { termId: term._id, status: 'active' as const };
  const offA = await makeOffering({ ...base, departmentId: deptA._id, facultyIds: [facultyA._id], title: `A ${n}` });
  const offB = await makeOffering({ ...base, departmentId: deptB._id, facultyIds: [facultyB._id], title: `B ${n}` });
  const draftA = await makeOffering({
    ...base,
    status: 'draft',
    departmentId: deptA._id,
    facultyIds: [facultyA._id],
    title: `Draft ${n}`,
  });
  return { deptA, deptB, term, facultyA, facultyB, hodA, offA, offB, draftA };
}

const ids = async (page = 1, filters = {}) => (await listMyOfferings(page, filters)).rows.map((r) => r.id);

describe('listMyOfferings', () => {
  it('shows faculty their own offerings, drafts included', async () => {
    const w = await world();
    await signInAs(w.facultyA);
    const mine = await ids();
    expect(mine).toContain(String(w.offA._id));
    expect(mine).toContain(String(w.draftA._id));
    expect(mine).not.toContain(String(w.offB._id));
  });

  it('shows a head of department their department only', async () => {
    const w = await world();
    await signInAs(w.hodA);
    const mine = await ids();
    expect(mine).toEqual(expect.arrayContaining([String(w.offA._id), String(w.draftA._id)]));
    expect(mine).not.toContain(String(w.offB._id));
  });

  it('shows a student only the active or completed offerings they are enrolled in', async () => {
    const w = await world();
    const student = await makeUser({ roles: ['student'] });
    const completed = await makeOffering({ status: 'completed', title: 'Done' });
    const dropped = await makeOffering({ status: 'active', title: 'Dropped' });
    await Promise.all([
      enroll(w.offA._id, student._id),
      enroll(w.draftA._id, student._id),
      enroll(completed._id, student._id),
      enroll(dropped._id, student._id, 'dropped'),
    ]);
    await signInAs(student);
    const mine = await ids();
    expect(mine.sort()).toEqual([String(w.offA._id), String(completed._id)].sort());
  });

  it('shows an admin everything and applies the term and department filters', async () => {
    const w = await world();
    await signInAs(await makeUser({ roles: ['admin'] }));
    expect(await ids(1, { termId: String(w.term._id) })).toHaveLength(3);
    expect(await ids(1, { termId: String(w.term._id), departmentId: String(w.deptB._id) })).toEqual([
      String(w.offB._id),
    ]);
  });

  it('is not for support or signed-out visitors', async () => {
    await signInAs(await makeUser({ roles: ['support'] }));
    await expect(listMyOfferings(1, {})).rejects.toMatchObject(redirectsTo('/home'));
    switchBrowser(new Map());
    await expect(listMyOfferings(1, {})).rejects.toMatchObject(redirectsTo('/login'));
  });
});

describe('getHomeSummary', () => {
  it('counts what each role works with', async () => {
    const w = await world();
    const student = await makeUser({ roles: ['student'] });
    const other = await makeUser({ roles: ['student'] });
    await Promise.all([
      enroll(w.offA._id, student._id),
      enroll(w.offA._id, other._id, 'dropped'),
      enroll(w.draftA._id, other._id),
      enroll(w.offB._id, other._id),
    ]);

    await signInAs(w.facultyA);
    expect(await getHomeSummary()).toEqual({ myOfferings: 2, enrolments: 2, admin: null });
    await signInAs(w.hodA);
    expect(await getHomeSummary()).toEqual({ myOfferings: 2, enrolments: 2, admin: null });
    await signInAs(student);
    expect(await getHomeSummary()).toEqual({ myOfferings: 1, enrolments: null, admin: null });
    await signInAs(await makeUser({ roles: ['support'] }));
    expect(await getHomeSummary()).toEqual({ myOfferings: null, enrolments: null, admin: null });
  });

  it('gives admins the programme, catalogue and user counts and the latest audit entries', async () => {
    const admin = await makeUser({ roles: ['admin'], name: 'Audit Admin' });
    await signInAs(admin);
    const before = await getHomeSummary();
    await world();
    await makeUser({ roles: ['faculty', 'hod'], status: 'invited' });
    const entry = await AuditLog.create({
      at: new Date(Date.now() + 60_000),
      actorId: admin._id,
      action: 'user.created',
      entity: 'user',
      entityId: newId(),
    });
    const after = await getHomeSummary();
    expect(after.myOfferings).toBeNull();
    expect(after.admin).toMatchObject({
      activeOfferings: (before.admin?.activeOfferings ?? 0) + 2,
      invited: (before.admin?.invited ?? 0) + 1,
    });
    expect(after.admin?.recent[0]).toEqual({
      id: String(entry._id),
      at: entry.at,
      actor: 'Audit Admin',
      action: 'user.created',
      entity: 'user',
    });
    expect(after.admin?.recent.length).toBeLessThanOrEqual(6);
  });

  it('counts the last seven days of audit entries by IST day and by person', async () => {
    const day = 86_400_000;
    const busy = await makeUser({ roles: ['admin'], name: 'Busy Admin' });
    await signInAs(await makeUser({ roles: ['admin'] }));
    const before = await getHomeSummary();
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * day);
    const entry = (at: Date) => ({ at, actorId: busy._id, action: 'user.created', entity: 'user', entityId: newId() });
    await AuditLog.create([entry(now), entry(now), entry(threeDaysAgo), entry(new Date(now.getTime() - 8 * day))]);
    const after = await getHomeSummary();

    const activity = after.admin?.activity ?? [];
    expect(activity).toHaveLength(7);
    expect(istDayKey(activity[6].day)).toBe(istDayKey(now));
    activity.forEach((d, i) => {
      expect(d.day).toEqual(istDateToDate(istDayKey(d.day)));
      if (i > 0) expect(d.day.getTime() - activity[i - 1].day.getTime()).toBe(day);
    });
    const added = activity.map((d, i) => d.count - (before.admin?.activity[i].count ?? 0));
    expect(added[activity.findIndex((d) => istDayKey(d.day) === istDayKey(now))]).toBe(2);
    expect(added[activity.findIndex((d) => istDayKey(d.day) === istDayKey(threeDaysAgo))]).toBe(1);
    expect(added.reduce((a, b) => a + b, 0)).toBe(3);
    expect(after.admin?.mostActive[0]).toEqual({ id: String(busy._id), name: 'Busy Admin', count: 3 });
    expect(after.admin?.mostActive.length).toBeLessThanOrEqual(3);
  });
});

describe('getWorkspace', () => {
  it('describes the offering and what the viewer may do', async () => {
    const w = await world();
    await signInAs(w.facultyA);
    expect(await getWorkspace(String(w.offA._id))).toMatchObject({
      title: w.offA.title,
      termName: 'Odd 2026',
      access: 'teach',
      canTeach: true,
    });
    await signInAs(w.hodA);
    expect(await getWorkspace(String(w.offA._id))).toMatchObject({ access: 'oversee', canTeach: false });
    await signInAs(await makeUser({ roles: ['admin'] }));
    expect(await getWorkspace(String(w.offB._id))).toMatchObject({ access: 'oversee', canTeach: true });
  });

  it('answers 404 for another department, an unenrolled student, a draft, and a malformed id', async () => {
    const w = await world();
    const student = await makeUser({ roles: ['student'] });
    await enroll(w.draftA._id, student._id);
    await signInAs(w.hodA);
    await expect(getWorkspace(String(w.offB._id))).rejects.toMatchObject({ digest: NOT_FOUND });
    await signInAs(w.facultyA);
    await expect(getWorkspace(String(w.offB._id))).rejects.toMatchObject({ digest: NOT_FOUND });
    await signInAs(student);
    await expect(getWorkspace(String(w.offA._id))).rejects.toMatchObject({ digest: NOT_FOUND });
    await expect(getWorkspace(String(w.draftA._id))).rejects.toMatchObject({ digest: NOT_FOUND });
    await expect(getWorkspace('nope')).rejects.toMatchObject({ digest: NOT_FOUND });
    await expect(getWorkspace(String(newId()))).rejects.toMatchObject({ digest: NOT_FOUND });
  });
});

describe('listRoster', () => {
  it('lists the roster for teachers and overseers but not for students', async () => {
    const w = await world();
    const student = await makeUser({ roles: ['student'], rollNo: `RS${seq}` });
    const gone = await makeUser({ roles: ['student'], rollNo: `RG${seq}` });
    await Promise.all([enroll(w.offA._id, student._id), enroll(w.offA._id, gone._id, 'dropped')]);

    await signInAs(w.facultyA);
    const roster = await listRoster(String(w.offA._id), 1);
    expect(roster.total).toBe(2);
    expect(roster.rows.map((r) => [r.rollNo, r.status]).sort()).toEqual([
      [`RG${seq}`, 'dropped'],
      [`RS${seq}`, 'active'],
    ]);
    await signInAs(w.hodA);
    expect((await listRoster(String(w.offA._id), 1)).total).toBe(2);
    await signInAs(student);
    await expect(listRoster(String(w.offA._id), 1)).rejects.toMatchObject({ digest: NOT_FOUND });
    await signInAs(w.facultyB);
    await expect(listRoster(String(w.offA._id), 1)).rejects.toMatchObject({ digest: NOT_FOUND });
  });
});

describe('getOfferingCourse', () => {
  it('returns the course with its mapping to anyone allowed into the workspace', async () => {
    const w = await world();
    const coId = newId();
    const program = await makeProgram({ outcomeTitles: [{ code: 'PO1', title: 'First' }] });
    const course = await makeCourse({
      cos: [{ _id: coId, code: 'CO1', statement: 'Do things', bloomLevels: ['apply'] }],
      coMap: [{ coId, outcome: 'PO1', level: 2 }],
    });
    const offering = await makeOffering({
      courseId: course._id,
      programId: program._id,
      status: 'active',
      departmentId: w.deptA._id,
    });
    const student = await makeUser({ roles: ['student'] });
    await enroll(offering._id, student._id);

    await signInAs(student);
    expect(await getOfferingCourse(String(offering._id))).toMatchObject({
      code: course.code,
      outcomes: expect.arrayContaining([{ code: 'PO1', title: 'First' }]),
      cells: { [`${coId}:PO1`]: 2 },
    });
    await signInAs(await makeUser({ roles: ['student'] }));
    await expect(getOfferingCourse(String(offering._id))).rejects.toMatchObject({ digest: NOT_FOUND });
  });
});

describe('fillCalendarFromCourse (AC-M01b-09)', () => {
  const sessionPlan = [
    { topic: 'Index of a point', kind: 'theory' },
    { topic: 'Measure angles', kind: 'practice' },
    { topic: 'Residues', kind: 'theory' },
    { topic: 'Study on residues', kind: 'project' },
    { topic: 'Argument principle', kind: 'theory' },
  ];
  const fill = (offeringId: string, over: Record<string, string | string[]> = {}) =>
    fillCalendarFromCourse(form({ offeringId, firstDay: '2026-07-06', 'weekdays[]': ['1', '3', '5'], ...over }));

  it('dates the course session plan on the chosen weekdays, and asks before replacing sessions', async () => {
    const faculty = await makeUser({ roles: ['faculty'] });
    const course = await makeCourse({ sessionPlan });
    const offering = await makeOffering({ courseId: course._id, facultyIds: [faculty._id] });
    const id = String(offering._id);
    await signInAs(faculty);
    expect(await fill(id)).toMatchObject({ ok: true });
    const calendar = (await Offering.findById(id).lean())?.calendar ?? [];
    expect(calendar.map((row) => [istDayKey(row.date), row.topic])).toEqual([
      ['2026-07-06', 'Index of a point'],
      ['2026-07-08', 'Practice: Measure angles'],
      ['2026-07-10', 'Residues'],
      ['2026-07-13', 'Project: Study on residues'],
      ['2026-07-15', 'Argument principle'],
    ]);
    expect(await fill(id, { firstDay: '2026-08-03' })).toMatchObject({
      ok: false,
      fieldErrors: { replace: ['This replaces the 5 sessions already scheduled. Tick the box to go on.'] },
    });
    expect(await fill(id, { firstDay: '2026-08-03', replace: 'true' })).toMatchObject({ ok: true });
    expect(istDayKey((await Offering.findById(id).lean())?.calendar[0].date ?? new Date(0))).toBe('2026-08-03');
  });

  it('is for those who teach the offering, and needs a session plan and a weekday', async () => {
    const faculty = await makeUser({ roles: ['faculty'] });
    const offering = await makeOffering({ courseId: (await makeCourse())._id, facultyIds: [faculty._id] });
    const id = String(offering._id);
    await signInAs(faculty);
    expect(await fill(id)).toMatchObject({ ok: false, message: 'This course has no session plan yet.' });
    expect(await fill(id, { 'weekdays[]': [] })).toMatchObject({
      ok: false,
      fieldErrors: { 'weekdays[]': ['Tick at least one day.'] },
    });
    await signInAs(await makeUser({ roles: ['faculty'] }));
    await expect(fill(id)).rejects.toThrow(NOT_FOUND);
    await signInAs(await makeUser({ roles: ['student'] }));
    expect(await fill(id)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
