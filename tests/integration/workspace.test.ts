import type { Types } from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import { fillCalendarFromCourse } from '@/app/(app)/courses/[offeringId]/plan/actions';
import { getOfferingCourse } from '@/lib/data/courses';
import { db } from '@/lib/db';
import { istDayKey } from '@/lib/domain/time';
import { listOfferings, offeringNeeds } from '@/lib/data/offerings';
import { getHomeSummary, getWorkspace, listMyOfferings, listRoster } from '@/lib/data/workspace';
import { Attendance } from '@/lib/models/attendance';
import { Course } from '@/lib/models/course';
import { Department } from '@/lib/models/department';
import { Enrollment } from '@/lib/models/enrollment';
import { Lesson } from '@/lib/models/lesson';
import { LessonProgress } from '@/lib/models/lesson-progress';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Submission } from '@/lib/models/submission';
import { Term } from '@/lib/models/term';
import type { OfferingNeed } from '@/lib/schemas/structure';
import {
  enroll,
  form,
  makeAssessment,
  makeCourse,
  makeOffering,
  makeProgram,
  makeUser,
  newId,
  signInAs,
} from '../factories';
import { switchBrowser } from '../next-request';

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const redirectsTo = (path: string) => ({ digest: expect.stringMatching(new RegExp(`;${path};`)) });

beforeAll(async () => {
  await db();
  await Promise.all(
    [Course, Department, Enrollment, Lesson, LessonProgress, Offering, Program, Term].map((m) => m.createCollection()),
  );
  await Offering.createIndexes();
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

  it("gives a student the course's parts and their progress through published lessons, and a teacher the class", async () => {
    const w = await world();
    const course = await makeCourse({ title: 'Computer Networks', type: 'core' });
    await Offering.updateOne(
      { _id: w.offA._id },
      {
        courseId: course._id,
        section: 'A',
        'plan.publishedAt': new Date(),
        $push: { modules: { title: 'Unit 1', order: 1 } },
      },
    );
    const student = await makeUser({ roles: ['student'] });
    await enroll(w.offA._id, student._id);
    const lesson = (published: boolean, durationSec: number) =>
      Lesson.create({
        offeringId: w.offA._id,
        moduleId: newId(),
        order: 1,
        kind: 'video',
        title: 'L',
        published,
        durationSec,
      });
    const [done, , unpublished] = await Promise.all([lesson(true, 600), lesson(true, 300), lesson(false, 900)]);
    // A lesson completed and later unpublished no longer counts, as on the course's Overview.
    await LessonProgress.create(
      [done, unpublished].map((l) => ({
        lessonId: l._id,
        offeringId: w.offA._id,
        studentId: student._id,
        completedAt: new Date(),
      })),
    );
    await signInAs(student);
    expect((await listMyOfferings(1, {})).rows).toEqual([
      expect.objectContaining({
        code: course.code,
        courseTitle: 'Computer Networks',
        courseType: 'core',
        section: 'A',
        units: 1,
        view: { as: 'learner', completed: 1, published: 2, videoSec: 900 },
      }),
    ]);
    await signInAs(w.facultyA);
    const rows = (await listMyOfferings(1, {})).rows;
    expect(rows.find((r) => r.id === String(w.offA._id))?.view).toEqual({
      as: 'teacher',
      students: 1,
      planPublished: true,
    });
    expect(rows.find((r) => r.id === String(w.draftA._id))?.view).toEqual({
      as: 'teacher',
      students: 0,
      planPublished: false,
    });
  });

  it('searches only within the offerings the viewer may see', async () => {
    const w = await world();
    await Offering.updateOne({ _id: w.offA._id }, { title: `Volcanology ${seq}` });
    await Offering.updateOne({ _id: w.offB._id }, { title: `Volcanology elsewhere ${seq}` });
    await signInAs(w.facultyA);
    expect(await ids(1, { q: 'volcanology' })).toEqual([String(w.offA._id)]);
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
    const none = { student: null, toGrade: null, admin: null };

    await signInAs(w.facultyA);
    expect(await getHomeSummary()).toEqual({ myOfferings: 2, enrolments: 2, ...none, toGrade: 0 });
    await signInAs(w.hodA);
    expect(await getHomeSummary()).toEqual({ myOfferings: 2, enrolments: 2, ...none });
    await signInAs(student);
    expect(await getHomeSummary()).toEqual({
      myOfferings: 1,
      enrolments: null,
      ...none,
      student: { courses: 1, attended: 0, held: 0, completed: 0, published: 0 },
    });
    await signInAs(await makeUser({ roles: ['support'] }));
    expect(await getHomeSummary()).toEqual({ myOfferings: null, enrolments: null, ...none });
  });

  it('gives a student their attendance and lessons in active courses only, and a teacher the hand-ins awaiting marks', async () => {
    const w = await world();
    const student = await makeUser({ roles: ['student'] });
    const done = await makeOffering({ status: 'completed', title: 'Done' });
    await Promise.all([enroll(w.offA._id, student._id), enroll(done._id, student._id)]);
    const mark = (offeringId: Types.ObjectId, status?: 'present' | 'absent') => ({
      sessionId: newId(),
      offeringId,
      studentId: student._id,
      status,
      source: 'manual' as const,
    });
    await Attendance.create([
      mark(w.offA._id, 'present'),
      mark(w.offA._id, 'present'),
      mark(w.offA._id, 'absent'),
      mark(w.offA._id),
      mark(done._id, 'absent'),
    ]);
    const moduleId = newId();
    const lessons = await Lesson.create(
      [true, true, false].map((published, order) => ({
        offeringId: w.offA._id,
        moduleId,
        order,
        kind: 'link' as const,
        title: `L${order}`,
        published,
      })),
    );
    await LessonProgress.create({
      offeringId: w.offA._id,
      lessonId: lessons[0]._id,
      studentId: student._id,
      completedAt: new Date(),
    });
    await signInAs(student);
    expect((await getHomeSummary()).student).toEqual({ courses: 1, attended: 2, held: 3, completed: 1, published: 2 });

    const quiz = await makeAssessment({ offeringId: w.offA._id, createdBy: w.facultyA._id });
    const attempt = (studentId: Types.ObjectId, status: 'submitted' | 'graded') => ({
      assessmentId: quiz._id,
      offeringId: w.offA._id,
      studentId,
      attemptNo: 1,
      status,
      startedAt: new Date(),
      deadlineAt: new Date(),
      submittedAt: new Date(),
    });
    await Submission.create([attempt(student._id, 'submitted'), attempt(newId(), 'graded')]);
    await signInAs(w.facultyA);
    expect((await getHomeSummary()).toGrade).toBe(1);
    await signInAs(w.facultyB);
    expect((await getHomeSummary()).toGrade).toBe(0);
  });

  it('gives admins the platform counts and the current term by readiness', async () => {
    const admin = await makeUser({ roles: ['admin'] });
    await signInAs(admin);
    const before = await getHomeSummary();
    await world();
    await makeUser({ roles: ['faculty', 'hod'], status: 'invited' });
    const after = await getHomeSummary();
    expect(after.myOfferings).toBeNull();
    expect(after.student).toBeNull();
    expect(after.admin).toMatchObject({
      activeOfferings: (before.admin?.activeOfferings ?? 0) + 2,
      invited: (before.admin?.invited ?? 0) + 1,
    });
    expect(after.admin?.readiness?.term.code).toMatch(/^WT\d+$/);
  });
});

describe('offeringNeeds and the need filter', () => {
  it('counts each offering once, by its first gap, and lists the same offerings', async () => {
    const w = await world();
    const student = await makeUser({ roles: ['student'] });
    const base = { termId: w.term._id, departmentId: w.deptA._id, status: 'active' as const };
    const noTeacher = await makeOffering({ ...base, facultyIds: [], title: 'No teacher' });
    const ready = await makeOffering({ ...base, facultyIds: [w.facultyA._id], title: 'Ready' });
    await Offering.updateOne({ _id: ready._id }, { 'plan.publishedAt': new Date() });
    await Offering.updateOne({ _id: w.offB._id }, { 'plan.publishedAt': new Date() });
    await Promise.all([
      enroll(w.offA._id, student._id),
      enroll(ready._id, student._id),
      enroll(noTeacher._id, student._id),
      enroll(w.offB._id, student._id, 'dropped'),
    ]);
    await signInAs(await makeUser({ roles: ['admin'] }));

    expect(await offeringNeeds(w.term._id)).toEqual({
      draft: 1,
      no_teacher: 1,
      no_students: 1,
      no_plan: 1,
      ready: 1,
    });
    const listed = async (need: OfferingNeed) =>
      (await listOfferings(1, { termId: String(w.term._id), need })).rows.map((r) => r.id);
    expect(await listed('draft')).toEqual([String(w.draftA._id)]);
    expect(await listed('no_teacher')).toEqual([String(noTeacher._id)]);
    expect(await listed('no_students')).toEqual([String(w.offB._id)]);
    expect(await listed('no_plan')).toEqual([String(w.offA._id)]);
    const page = await listOfferings(1, { termId: String(w.term._id), need: 'ready' });
    expect(page).toMatchObject({ total: 1, rows: [{ id: String(ready._id) }] });
  });

  it('is for admins only', async () => {
    const w = await world();
    await signInAs(w.facultyA);
    await expect(offeringNeeds(w.term._id)).rejects.toMatchObject(redirectsTo('/home'));
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
    // M03b: the session's kind is a field of its own, no longer a prefix on the topic.
    expect(calendar.map((row) => [istDayKey(row.date), row.topic, row.kind])).toEqual([
      ['2026-07-06', 'Index of a point', 'theory'],
      ['2026-07-08', 'Measure angles', 'practice'],
      ['2026-07-10', 'Residues', 'theory'],
      ['2026-07-13', 'Study on residues', 'project'],
      ['2026-07-15', 'Argument principle', 'theory'],
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
