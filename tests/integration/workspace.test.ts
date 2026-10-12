import { beforeAll, describe, expect, it } from 'vitest';
import { getOfferingCourse } from '@/lib/data/courses';
import { db } from '@/lib/db';
import { getWorkspace, listMyOfferings, listRoster } from '@/lib/data/workspace';
import { Course } from '@/lib/models/course';
import { Department } from '@/lib/models/department';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Term } from '@/lib/models/term';
import { enroll, makeOffering, makeUser, newId, signInAs } from '../factories';
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

describe('getWorkspace', () => {
  it('describes the offering and what the viewer may do', async () => {
    const w = await world();
    await signInAs(w.facultyA);
    expect(await getWorkspace(String(w.offA._id))).toMatchObject({
      title: w.offA.title,
      termName: 'Odd 2026',
      access: 'teach',
      canChangeEnrollments: true,
    });
    await signInAs(w.hodA);
    expect(await getWorkspace(String(w.offA._id))).toMatchObject({ access: 'oversee', canChangeEnrollments: false });
    await signInAs(await makeUser({ roles: ['admin'] }));
    expect(await getWorkspace(String(w.offB._id))).toMatchObject({ access: 'oversee', canChangeEnrollments: true });
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
    const program = await Program.create({
      code: `WP${seq}`,
      name: 'Programme',
      departmentId: w.deptA._id,
      category: 'ugc',
      durationSemesters: 8,
      pos: [{ code: 'PO1', title: 'First', statement: 'First' }],
    });
    const course = await Course.create({
      programId: program._id,
      departmentId: w.deptA._id,
      category: 'ugc',
      code: `WC${seq}`,
      title: 'Workspace course',
      credits: 3,
      components: ['theory'],
      componentKey: 'theory',
      status: 'active',
      cos: [{ _id: coId, code: 'CO1', statement: 'Do things', bloomLevel: 'apply' }],
      coMap: [{ coId, outcome: 'PO1', level: 2 }],
    });
    const offering = await makeOffering({ courseId: course._id, status: 'active', departmentId: w.deptA._id });
    const student = await makeUser({ roles: ['student'] });
    await enroll(offering._id, student._id);

    await signInAs(student);
    expect(await getOfferingCourse(String(offering._id))).toMatchObject({
      code: course.code,
      outcomes: expect.arrayContaining(['PO1']),
      cells: { [`${coId}:PO1`]: 2 },
    });
    await signInAs(await makeUser({ roles: ['student'] }));
    await expect(getOfferingCourse(String(offering._id))).rejects.toMatchObject({ digest: NOT_FOUND });
  });
});
