import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createUpload } from '@/app/(app)/actions';
import {
  addCo,
  clearSyllabusFile,
  deleteCo,
  deleteCourseModule,
  markReviewed,
  reorderCourseModules,
  saveCoMap,
  saveCourse,
  saveCourseModule,
  saveObjectives,
  saveProjects,
  saveSessionPlan,
  setCoordinator,
  setSyllabusFile,
  updateCo,
} from '@/app/(app)/catalog/actions';
import { getCatalogCourse, getCatalogStats, listCatalog } from '@/lib/data/courses';
import { db } from '@/lib/db';
import { AuditLog } from '@/lib/models/audit-log';
import { Course } from '@/lib/models/course';
import { CurriculumEntry } from '@/lib/models/curriculum-entry';
import { Offering } from '@/lib/models/offering';
import { User } from '@/lib/models/user';
import { form, makeCourse, makeOffering, makeProgram, makeUser, newId, signInAs } from '../factories';

const { presignUpload, deleteObjects } = vi.hoisted(() => ({
  presignUpload: vi.fn(async (key: string) => `https://storage.test/put/${key}`),
  deleteObjects: vi.fn(async (keys: string[]) => void keys),
}));
vi.mock('@/lib/integrations/storage', () => ({ presignUpload, deleteObjects }));

const FORBIDDEN = { ok: false, code: 'FORBIDDEN' };

beforeAll(async () => {
  await db();
  // The catalogue search uses the text index; the unique code index makes duplicates a conflict.
  await Promise.all([
    Course.createIndexes(),
    User.createIndexes(),
    AuditLog.createCollection(),
    CurriculumEntry.createCollection(),
  ]);
  await Offering.createCollection();
});

async function coordinated() {
  const coordinator = await makeUser({ roles: ['faculty'] });
  const course = await makeCourse({ coordinatorId: coordinator._id });
  return { coordinator, course, courseId: String(course._id) };
}

const audit = (courseId: string, action: string) =>
  AuditLog.find({ entity: 'course', entityId: courseId, action }).sort({ at: 1 }).lean();

describe('who edits a course (CRS-07, AC-M01b-04)', () => {
  it('lets the coordinator and admins edit content, and nobody else', async () => {
    const { coordinator, courseId } = await coordinated();
    const edit = () => saveObjectives(form({ courseId, objectives: 'Use residues.' }));

    await signInAs(coordinator);
    expect(await edit()).toEqual({ ok: true, data: undefined });
    for (const roles of [['faculty'], ['hod'], ['student']] as const) {
      await signInAs(await makeUser({ roles: [...roles] }));
      expect(await edit()).toMatchObject(FORBIDDEN);
    }
    await signInAs(await makeUser({ roles: ['admin'] }));
    expect(await saveObjectives(form({ courseId, objectives: 'Use residues.\nEvaluate integrals.' }))).toMatchObject({
      ok: true,
    });
  });

  it('keeps course details and the coordinator for admins', async () => {
    const { coordinator, courseId, course } = await coordinated();
    await signInAs(coordinator);
    expect(
      await saveCourse(
        form({
          id: courseId,
          code: course.code,
          title: 'Mine now',
          theory: '3',
          practice: '0',
          project: '1',
          status: 'active',
        }),
      ),
    ).toMatchObject(FORBIDDEN);
    expect(await setCoordinator(form({ courseId, coordinatorId: '' }))).toMatchObject(FORBIDDEN);
  });

  it('shows the catalogue to staff only, editable only where they may edit', async () => {
    const { coordinator, courseId } = await coordinated();
    await signInAs(coordinator);
    expect(await getCatalogCourse(courseId)).toMatchObject({ canEdit: true, isAdmin: false });
    await signInAs(await makeUser({ roles: ['faculty'] }));
    expect(await getCatalogCourse(courseId)).toMatchObject({ canEdit: false });
    await signInAs(await makeUser({ roles: ['student'] }));
    await expect(getCatalogCourse(courseId)).rejects.toMatchObject({ digest: expect.stringContaining('/home') });
  });
});

describe('course outcomes, one at a time (M03b)', () => {
  const codes = async (courseId: string) => (await Course.findById(courseId).lean())?.cos.map((co) => co.code);

  it('adds, edits and deletes an outcome; a deleted one takes its links and calendar tags along', async () => {
    const { coordinator, course, courseId } = await coordinated();
    await signInAs(coordinator);
    expect(await addCo(form({ courseId, statement: 'Explain residues.', 'bloom[]': 'understand' }))).toMatchObject({
      ok: true,
    });
    expect(
      await addCo(form({ courseId, statement: 'Evaluate real integrals.', 'bloom[]': ['apply', 'evaluate'] })),
    ).toMatchObject({ ok: true });
    const [co1, co2] = (await Course.findById(courseId).lean())?.cos ?? [];
    expect([co1?.code, co2?.code, co2?.bloomLevels]).toEqual(['CO1', 'CO2', ['apply', 'evaluate']]);
    expect(await saveCoMap(form({ courseId, 'cell[]': [`${co1?._id}:PO1:3`, `${co2?._id}:PSO2:1`] }))).toMatchObject({
      ok: true,
    });
    const offering = await makeOffering({ courseId: course._id });
    await Offering.updateOne(
      { _id: offering._id },
      { $push: { calendar: { date: new Date('2026-11-02'), topic: 'Contours', coIds: [co1?._id, co2?._id] } } },
    );

    expect(
      await updateCo(
        form({ courseId, coId: String(co1?._id), statement: 'Explain residues and poles.', 'bloom[]': 'understand' }),
      ),
    ).toMatchObject({ ok: true });
    expect(await deleteCo(form({ courseId, coId: String(co2?._id) }))).toMatchObject({ ok: true });

    const after = await Course.findById(courseId).lean();
    expect(after?.cos.map((co) => [co.code, co.statement])).toEqual([['CO1', 'Explain residues and poles.']]);
    expect(after?.coMap.map((m) => [String(m.coId), m.outcome])).toEqual([[String(co1?._id), 'PO1']]);
    expect((await Offering.findById(offering._id).lean())?.calendar[0].coIds.map(String)).toEqual([String(co1?._id)]);
    expect((await audit(courseId, 'course.cos_changed')).at(-1)?.after).toEqual({
      deleted: 'CO2',
      mappingLinksRemoved: 1,
      offeringsUntagged: 1,
    });
    expect(await deleteCo(form({ courseId, coId: String(co2?._id) }))).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('never gives a deleted code again, even the highest one (05 §3.6)', async () => {
    const { coordinator, courseId } = await coordinated();
    await signInAs(coordinator);
    for (const statement of ['One.', 'Two.', 'Three.']) await addCo(form({ courseId, statement }));
    const co3 = (await Course.findById(courseId).lean())?.cos[2];
    expect(await deleteCo(form({ courseId, coId: String(co3?._id) }))).toMatchObject({ ok: true });
    expect(await addCo(form({ courseId, statement: 'Four.' }))).toMatchObject({ ok: true });
    expect(await codes(courseId)).toEqual(['CO1', 'CO2', 'CO4']);
  });

  it('confirms a guessed Bloom level when the outcome is saved unchanged', async () => {
    const coId = newId();
    const coordinator = await makeUser({ roles: ['faculty'] });
    const course = await makeCourse({
      coordinatorId: coordinator._id,
      cos: [{ _id: coId, code: 'CO1', statement: 'Design a contour.', bloomLevels: [], suggestedBloom: 'create' }],
    });
    await signInAs(coordinator);
    const courseId = String(course._id);
    expect(
      await updateCo(form({ courseId, coId: String(coId), statement: 'Design a contour.', 'bloom[]': 'create' })),
    ).toMatchObject({ ok: true });
    expect((await Course.findById(courseId).lean())?.cos[0]).toMatchObject({
      bloomLevels: ['create'],
      suggestedBloom: null,
    });
  });

  it('is for the coordinator and admins, on a credit course with room left', async () => {
    const { courseId } = await coordinated();
    await signInAs(await makeUser({ roles: ['faculty'] }));
    expect(await addCo(form({ courseId, statement: 'Mine.' }))).toMatchObject(FORBIDDEN);

    const coordinator = await makeUser({ roles: ['faculty'] });
    const free = await makeCourse({ coordinatorId: coordinator._id, credits: { theory: 0, practice: 0, project: 0 } });
    const full = await makeCourse({
      coordinatorId: coordinator._id,
      cos: Array.from({ length: 15 }, (_, i) => ({ code: `CO${i + 1}`, statement: 'Explain.' })),
    });
    await signInAs(coordinator);
    expect(await addCo(form({ courseId: String(free._id), statement: 'Use Excel.' }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(await addCo(form({ courseId: String(full._id), statement: 'One more.' }))).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
  });
});

describe('saveCoMap (AC-M01b-05)', () => {
  it('refuses codes outside PO1–PO12 and PSO1–PSO3 and levels outside 1–3, and audits the changed cells', async () => {
    const coId = newId();
    const coordinator = await makeUser({ roles: ['faculty'] });
    const course = await makeCourse({
      coordinatorId: coordinator._id,
      cos: [{ _id: coId, code: 'CO1', statement: 'Explain.', bloomLevels: ['understand'] }],
    });
    const courseId = String(course._id);
    await signInAs(coordinator);
    expect(await saveCoMap(form({ courseId, 'cell[]': `${coId}:PO13:2` }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(await saveCoMap(form({ courseId, 'cell[]': `${coId}:PO1:4` }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(await saveCoMap(form({ courseId, 'cell[]': `${newId()}:PO1:2` }))).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
    expect(await saveCoMap(form({ courseId, 'cell[]': [`${coId}:PO1:3`, `${coId}:PSO3:2`] }))).toMatchObject({
      ok: true,
    });
    expect((await audit(courseId, 'course.map_changed')).at(-1)?.after).toEqual([
      { co: 'CO1', outcome: 'PO1', from: null, to: 3 },
      { co: 'CO1', outcome: 'PSO3', from: null, to: 2 },
    ]);
  });
});

describe('content edits', () => {
  it('mark the course as edited here, so the courseware import leaves it alone', async () => {
    const { coordinator, courseId } = await coordinated();
    await signInAs(coordinator);
    expect((await Course.findById(courseId).lean())?.contentEditedAt).toBeNull();
    expect(
      await saveCourseModule(form({ courseId, title: 'Residues', hours: '4+0+2', topics: 'Residue theorem' })),
    ).toMatchObject({ ok: true });
    expect(await saveSessionPlan(form({ courseId, sessions: 'Residues\nProject: Study on residues' }))).toMatchObject({
      ok: true,
    });
    const course = await Course.findById(courseId).lean();
    expect(course?.contentEditedAt).toBeInstanceOf(Date);
    expect(course?.modules.map((m) => [m.title, m.hours])).toEqual([['Residues', '4+0+2']]);
    expect(course?.sessionPlan).toEqual([
      { topic: 'Residues', kind: 'theory' },
      { topic: 'Study on residues', kind: 'project' },
    ]);
    expect(await audit(courseId, 'course.content_changed')).toHaveLength(2);
  });

  it('adds, edits, reorders and deletes syllabus modules one at a time', async () => {
    const { coordinator, courseId } = await coordinated();
    await signInAs(coordinator);
    for (const title of ['Residues', 'Poles', 'Contours']) {
      expect(await saveCourseModule(form({ courseId, title }))).toMatchObject({ ok: true });
    }
    const [residues, poles, contours] = (await Course.findById(courseId).lean())?.modules ?? [];
    const ids = [contours, residues, poles].map((m) => String(m?._id));
    expect(
      await saveCourseModule(
        form({ courseId, moduleId: String(poles?._id), title: 'Poles', hours: '6', practicals: 'Plot poles' }),
      ),
    ).toMatchObject({ ok: true });
    expect(await reorderCourseModules(form({ courseId, 'ids[]': ids.slice(0, 2) }))).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
    expect(await reorderCourseModules(form({ courseId, 'ids[]': ids }))).toMatchObject({ ok: true });
    expect(await deleteCourseModule(form({ courseId, moduleId: String(residues?._id) }))).toMatchObject({ ok: true });
    expect(await saveProjects(form({ courseId, projects: 'Study on residues\n' }))).toMatchObject({ ok: true });

    const course = await Course.findById(courseId).lean();
    expect(course?.modules.map((m) => [m.title, m.hours ?? null, m.practicals])).toEqual([
      ['Contours', null, []],
      ['Poles', '6', ['Plot poles']],
    ]);
    // The edit kept the module's id.
    expect(String(course?.modules[1]._id)).toBe(String(poles?._id));
    expect(course?.projects).toEqual(['Study on residues']);
    expect(
      (await audit(courseId, 'course.content_changed')).map((entry) => (entry.after as { section: string }).section),
    ).toEqual([
      'syllabus module',
      'syllabus module',
      'syllabus module',
      'syllabus module',
      'syllabus order',
      'syllabus module',
      'projects',
    ]);
  });

  it('keeps one syllabus PDF, the editor’s own upload, and deletes the one it replaces', async () => {
    const { coordinator, courseId } = await coordinated();
    await signInAs(coordinator);
    const pdf = (key: string) =>
      JSON.stringify({ key, fileName: 'syllabus.pdf', contentType: 'application/pdf', size: 1000 });
    const mine = (name: string) => `syllabus/${courseId}/${coordinator._id}/${name}.pdf`;
    expect(await setSyllabusFile(form({ courseId, 'syllabusFile[]': pdf(mine('a')) }))).toMatchObject({ ok: true });
    expect(await setSyllabusFile(form({ courseId, 'syllabusFile[]': pdf(mine('b')) }))).toMatchObject({ ok: true });
    expect(deleteObjects).toHaveBeenLastCalledWith([mine('a')]);
    expect(
      await setSyllabusFile(form({ courseId, 'syllabusFile[]': pdf(`syllabus/${courseId}/${newId()}/c.pdf`) })),
    ).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await clearSyllabusFile(form({ courseId }))).toMatchObject({ ok: true });
    expect(deleteObjects).toHaveBeenLastCalledWith([mine('b')]);
    expect((await Course.findById(courseId).lean())?.syllabusFileKey).toBeUndefined();
  });

  it('clears the review notes when someone marks the course reviewed', async () => {
    const coordinator = await makeUser({ roles: ['faculty'] });
    const course = await makeCourse({
      coordinatorId: coordinator._id,
      issues: ['The outcomes had no CO numbers, so they were numbered in order.'],
      reviewNeeded: true,
    });
    await signInAs(coordinator);
    expect(await markReviewed(form({ courseId: String(course._id) }))).toMatchObject({ ok: true });
    expect(await Course.findById(course._id).lean()).toMatchObject({ issues: [], reviewNeeded: false });
  });
});

describe('saveCourse (admin)', () => {
  const fields = (over: Record<string, string> = {}) =>
    form({
      code: 'cutm 9001',
      title: 'New course',
      theory: '2',
      practice: '0',
      project: '1',
      status: 'active',
      ...over,
    });

  it('creates a course under its normalised code, once', async () => {
    await signInAs(await makeUser({ roles: ['admin'] }));
    expect(await saveCourse(fields())).toMatchObject({
      ok: true,
      data: { next: expect.stringMatching(/^\/catalog\//) },
    });
    expect(await Course.findOne({ code: 'CUTM9001' }).lean()).toMatchObject({
      credits: { theory: 2, practice: 0, project: 1 },
    });
    expect(await saveCourse(fields({ code: 'CUTM-9001' }))).toMatchObject({ ok: false, code: 'CONFLICT' });
  });

  it('fixes the code once the course has been offered, and renames it in every curriculum before that', async () => {
    await signInAs(await makeUser({ roles: ['admin'] }));
    const course = await makeCourse({ code: 'CUTM9002' });
    const program = await makeProgram();
    await CurriculumEntry.create({ programId: program._id, courseId: course._id, courseCode: 'CUTM9002' });
    expect(await saveCourse(fields({ id: String(course._id), code: 'CUTM9003' }))).toMatchObject({ ok: true });
    expect(await CurriculumEntry.findOne({ courseId: course._id }).lean()).toMatchObject({ courseCode: 'CUTM9003' });

    await makeOffering({ courseId: course._id });
    expect(await saveCourse(fields({ id: String(course._id), code: 'CUTM9004' }))).toMatchObject({
      ok: false,
      code: 'CONFLICT',
      fieldErrors: { code: ['The code is fixed once the course has been offered.'] },
    });
    expect(await saveCourse(fields({ id: String(course._id), code: 'CUTM9003', title: 'Renamed' }))).toMatchObject({
      ok: true,
    });
  });

  it('assigns a faculty member as coordinator, and only a faculty member', async () => {
    await signInAs(await makeUser({ roles: ['admin'] }));
    const course = await makeCourse();
    const faculty = await makeUser({ roles: ['faculty'] });
    const student = await makeUser({ roles: ['student'] });
    const courseId = String(course._id);
    expect(await setCoordinator(form({ courseId, coordinatorId: String(student._id) }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(await setCoordinator(form({ courseId, coordinatorId: String(faculty._id) }))).toMatchObject({ ok: true });
    expect((await Course.findById(courseId).lean())?.coordinatorId?.equals(faculty._id)).toBe(true);
    expect(await audit(courseId, 'course.coordinator_changed')).toHaveLength(1);
  });
});

describe('syllabus PDF upload', () => {
  it('is for the coordinator and admins', async () => {
    const { coordinator, courseId } = await coordinated();
    const upload = () =>
      createUpload({
        purpose: 'syllabus',
        contextId: courseId,
        contentType: 'application/pdf',
        size: 1000,
        fileName: 's.pdf',
      });
    await signInAs(coordinator);
    expect(await upload()).toMatchObject({ ok: true, data: { key: expect.stringMatching(/^syllabus\//) } });
    await signInAs(await makeUser({ roles: ['faculty'] }));
    expect(await upload()).toMatchObject(FORBIDDEN);
  });
});

describe('listCatalog', () => {
  it('finds courses by the start of a code, by title words, and the ones a faculty member coordinates', async () => {
    const { coordinator } = await coordinated();
    await makeCourse({ code: 'ZZQA1001', title: 'Quantum widgets', coordinatorId: coordinator._id });
    await makeCourse({ code: 'ZZQA1002', title: 'Classical gadgets', reviewNeeded: true, issues: ['Check me.'] });
    await signInAs(coordinator);
    const codes = async (filters: Parameters<typeof listCatalog>[1]) =>
      (await listCatalog(1, filters)).rows.map((r) => r.code);
    expect(await codes({ q: 'zzqa 100' })).toEqual(['ZZQA1001', 'ZZQA1002']);
    expect(await codes({ q: 'quantum' })).toEqual(['ZZQA1001']);
    expect(await codes({ q: 'zzqa', mine: true })).toEqual(['ZZQA1001']);
    expect(await codes({ q: 'zzqa', review: true })).toEqual(['ZZQA1002']);
  });
});

describe('getCatalogStats', () => {
  it('counts the courses, the active ones, those to review and those without a coordinator', async () => {
    await makeCourse({ reviewNeeded: true, issues: ['Check me.'] });
    await makeCourse({ status: 'draft', coordinatorId: newId() });
    await signInAs(await makeUser({ roles: ['faculty'] }));
    expect(await getCatalogStats()).toEqual({
      total: await Course.countDocuments(),
      active: await Course.countDocuments({ status: 'active' }),
      review: await Course.countDocuments({ reviewNeeded: true }),
      unassigned: await Course.countDocuments({ coordinatorId: null }),
    });
  });
});
