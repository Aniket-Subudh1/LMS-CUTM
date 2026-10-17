import { beforeAll, describe, expect, it } from 'vitest';
import { createOfferings, setOfferingStatus, updateOfferingFaculty } from '@/app/(app)/admin/offerings/actions';
import { changeEnrollments } from '@/app/(app)/courses/actions';
import { db } from '@/lib/db';
import { getOfferingStats, listOfferings } from '@/lib/data/offerings';
import type { Credits } from '@/lib/domain/catalog';
import { AuditLog } from '@/lib/models/audit-log';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { CurriculumEntry } from '@/lib/models/curriculum-entry';
import { Department } from '@/lib/models/department';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Setting } from '@/lib/models/setting';
import { Term } from '@/lib/models/term';
import { SETTINGS } from '@/lib/schemas/settings';
import { form, makeCourse, makeOffering, makeUser, newId, signInAs } from '../factories';

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';

beforeAll(async () => {
  await db();
  await Promise.all(
    [AuditLog, Batch, Course, CurriculumEntry, Department, Enrollment, Offering, Program, Setting, Term].map((m) =>
      m.createCollection(),
    ),
  );
  await Offering.createIndexes();
});

let seq = 0;
const next = () => ++seq;

// A programme with a department, its 2025 batch (sections A and B), a current term, a faculty member of the
// department and a course in the programme's curriculum.
async function setup(opts: { credits?: Credits; listed?: boolean; withDepartment?: boolean } = {}) {
  const n = next();
  const department = await Department.create({ code: `D${n}`, name: `Dept ${n}` });
  const program = await Program.create({
    code: `PR${n}`,
    name: `Programme ${n}`,
    departmentId: opts.withDepartment === false ? null : department._id,
    durationSemesters: 8,
  });
  const batch = await Batch.create({ programId: program._id, name: '2025', startYear: 2025, sections: ['A', 'B'] });
  const term = await Term.create({
    code: `T${n}`,
    name: 'Term',
    academicYear: '2026-27',
    startsOn: new Date(),
    endsOn: new Date(),
    status: 'current',
  });
  const course = await makeCourse({
    credits: opts.credits ?? { theory: 3, practice: 0, project: 0 },
    modules: [{ title: 'Residues' }, { title: 'Harmonic functions' }],
  });
  if (opts.listed !== false) {
    await CurriculumEntry.create({ programId: program._id, courseId: course._id, courseCode: course.code });
  }
  const faculty = await makeUser({ roles: ['faculty'], email: `faculty${n}@cutm.test`, departmentId: department._id });
  const student = (section: string, over: Record<string, unknown> = {}) =>
    makeUser({ roles: ['student'], status: 'active', batchId: batch._id, section, rollNo: `R${n}-${next()}`, ...over });
  const fields = (over: Record<string, string | string[]> = {}) =>
    form({
      batchId: String(batch._id),
      courseId: String(course._id),
      termId: String(term._id),
      'sections[]': ['A'],
      'faculty[]': [String(faculty._id)],
      ...over,
    });
  return { department, program, batch, term, course, faculty, student, fields };
}

const asAdmin = async () => signInAs(await makeUser({ roles: ['admin'] }));

describe('createOfferings (AC-M01b-06)', () => {
  it('is for admins only', async () => {
    const s = await setup();
    await signInAs(s.faculty);
    expect(await createOfferings(s.fields())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('creates one offering per section with its students, copying the credits and the evaluation policy', async () => {
    await asAdmin();
    const s = await setup();
    const [a1, a2, , b1] = await Promise.all([
      s.student('A'),
      s.student('A', { status: 'invited' }),
      s.student('A', { status: 'disabled' }),
      s.student('B'),
    ]);
    expect(await createOfferings(s.fields({ 'sections[]': ['A', 'B'] }))).toEqual({ ok: true, data: { created: 2 } });

    const offerings = await Offering.find({ courseId: s.course._id }).sort({ section: 1 }).lean();
    expect(offerings.map((o) => o.title)).toEqual([
      `${s.course.code} · ${s.course.title} · ${s.term.code} · A`,
      `${s.course.code} · ${s.course.title} · ${s.term.code} · B`,
    ]);
    for (const offering of offerings) {
      expect(offering).toMatchObject({
        programId: s.program._id,
        departmentId: s.department._id,
        category: 'ugc',
        credits: { theory: 3, practice: 0, project: 0 },
        evaluation: SETTINGS.evaluation.schema.parse({}),
        projectMode: null,
        status: 'draft',
      });
      expect(offering.modules.map((m) => [m.title, m.order])).toEqual([
        ['Residues', 0],
        ['Harmonic functions', 1],
      ]);
    }
    const enrolled = async (i: number) =>
      (await Enrollment.find({ offeringId: offerings[i]._id }).lean()).map((e) => String(e.studentId)).sort();
    expect(await enrolled(0)).toEqual([a1._id, a2._id].map(String).sort());
    expect(await enrolled(1)).toEqual([String(b1._id)]);
    expect(
      await AuditLog.countDocuments({ action: 'enrollment.changed', offeringId: { $in: offerings.map((o) => o._id) } }),
    ).toBe(2);
  });

  it('keeps each offering on the policy it was created with', async () => {
    await asAdmin();
    const s = await setup();
    expect(await createOfferings(s.fields())).toMatchObject({ ok: true });
    const policy = { ...SETTINGS.evaluation.schema.parse({}), theoryMidTerm1: 10, theoryEndSem: 65 };
    await Setting.updateOne({ _id: 'evaluation' }, { $set: { value: policy, updatedBy: newId() } }, { upsert: true });
    expect(await createOfferings(s.fields({ 'sections[]': ['B'] }))).toMatchObject({ ok: true });
    const [first, second] = await Offering.find({ courseId: s.course._id }).sort({ section: 1 }).lean();
    expect(first.evaluation).toMatchObject({ theoryMidTerm1: 15, theoryEndSem: 60 });
    expect(second.evaluation).toMatchObject({ theoryMidTerm1: 10, theoryEndSem: 65 });
    await Setting.deleteOne({ _id: 'evaluation' });
  });

  it('offers to the whole batch, and refuses a section already offered without writing anything', async () => {
    await asAdmin();
    const s = await setup();
    await Promise.all([s.student('A'), s.student('B')]);
    expect(await createOfferings(s.fields({ 'sections[]': ['A'] }))).toMatchObject({ ok: true });
    expect(await createOfferings(s.fields({ 'sections[]': ['A', 'B'] }))).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
    expect(await Offering.countDocuments({ courseId: s.course._id })).toBe(1);

    const whole = await setup();
    await Promise.all([whole.student('A'), whole.student('B')]);
    expect(await createOfferings(whole.fields({ 'sections[]': ['*'] }))).toMatchObject({ ok: true });
    const offering = await Offering.findOne({ courseId: whole.course._id }).lean();
    expect(offering?.section).toBeNull();
    expect(await Enrollment.countDocuments({ offeringId: offering?._id })).toBe(2);
  });

  it('asks how projects are tracked exactly when the course has project credits', async () => {
    await asAdmin();
    const project = await setup({ credits: { theory: 3, practice: 0, project: 1 } });
    expect(await createOfferings(project.fields())).toMatchObject({
      ok: false,
      fieldErrors: { projectMode: ['Choose GitHub or Tracker.'] },
    });
    expect(await createOfferings(project.fields({ projectMode: 'github' }))).toMatchObject({ ok: true });
    expect((await Offering.findOne({ courseId: project.course._id }).lean())?.projectMode).toBe('github');

    const theory = await setup();
    expect(await createOfferings(theory.fields({ projectMode: 'tracker' }))).toMatchObject({ ok: true });
    expect((await Offering.findOne({ courseId: theory.course._id }).lean())?.projectMode).toBeNull();
  });

  it('makes a 0-0-0 course a non-credit offering with no evaluation policy (AC-M01b-07)', async () => {
    await asAdmin();
    const s = await setup({ credits: { theory: 0, practice: 0, project: 0 } });
    expect(await createOfferings(s.fields())).toMatchObject({ ok: true });
    expect(await Offering.findOne({ courseId: s.course._id }).lean()).toMatchObject({
      category: 'skill',
      evaluation: null,
    });
  });

  it('needs the course in the programme, a department, real sections and faculty accounts', async () => {
    await asAdmin();
    const unlisted = await setup({ listed: false });
    expect(await createOfferings(unlisted.fields())).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: expect.stringContaining('curriculum'),
    });
    const homeless = await setup({ withDepartment: false });
    expect(await createOfferings(homeless.fields())).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: expect.stringContaining('department'),
    });
    const s = await setup();
    expect(await createOfferings(s.fields({ 'sections[]': ['C'] }))).toMatchObject({
      ok: false,
      fieldErrors: { 'sections[]': ['C is not a section of that batch.'] },
    });
    expect(await createOfferings(s.fields({ otherFaculty: 'nobody@cutm.test' }))).toMatchObject({
      ok: false,
      fieldErrors: { otherFaculty: ['No faculty account for nobody@cutm.test.'] },
    });
    expect(await createOfferings(s.fields({ batchId: String(newId()) }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(
      await Offering.countDocuments({ courseId: { $in: [unlisted.course._id, homeless.course._id, s.course._id] } }),
    ).toBe(0);
  });
});

describe('updateOfferingFaculty and setOfferingStatus', () => {
  it('replaces the faculty list', async () => {
    await asAdmin();
    const [one, two] = await Promise.all([makeUser({ roles: ['faculty'] }), makeUser({ roles: ['faculty'] })]);
    const offering = await makeOffering({ facultyIds: [one._id] });
    const id = String(offering._id);
    expect(
      await updateOfferingFaculty(form({ offeringId: id, 'faculty[]': String(two._id), otherFaculty: one.email })),
    ).toMatchObject({ ok: true });
    expect((await Offering.findById(id))?.facultyIds.map(String).sort()).toEqual([one._id, two._id].map(String).sort());
    expect(await updateOfferingFaculty(form({ offeringId: id, otherFaculty: '' }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(await updateOfferingFaculty(form({ offeringId: String(newId()), otherFaculty: one.email }))).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
    await signInAs(one);
    expect(await updateOfferingFaculty(form({ offeringId: id, otherFaculty: one.email }))).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('moves draft to active to completed and no other way', async () => {
    await asAdmin();
    const offering = await makeOffering({ status: 'draft' });
    const id = String(offering._id);
    const set = (status: string) => setOfferingStatus(form({ offeringId: id, status }));
    expect(await set('completed')).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(await set('active')).toMatchObject({ ok: true });
    expect(await set('active')).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(await set('completed')).toMatchObject({ ok: true });
    expect(await set('active')).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect((await Offering.findById(id))?.status).toBe('completed');
    expect(await set('draft')).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await setOfferingStatus(form({ offeringId: String(newId()), status: 'active' }))).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
  });
});

describe('changeEnrollments', () => {
  const upload = (offeringId: string, csv: string) => {
    const fd = form({ offeringId });
    fd.set('file', new File([csv], 'people.csv', { type: 'text/csv' }));
    return fd;
  };

  async function teaching() {
    const faculty = await makeUser({ roles: ['faculty'] });
    const offering = await makeOffering({ facultyIds: [faculty._id] });
    const students = await Promise.all(
      [1, 2, 3].map((i) => makeUser({ roles: ['student'], rollNo: `E${next()}-${i}` })),
    );
    return { faculty, offering, id: String(offering._id), students };
  }

  it('adds, re-adds and drops students and audits the counts', async () => {
    const { faculty, offering, id, students } = await teaching();
    const [a, b, c] = students;
    await Enrollment.create({ offeringId: offering._id, studentId: b._id, status: 'dropped' });
    await Enrollment.create({ offeringId: offering._id, studentId: c._id, status: 'active' });
    await signInAs(faculty);
    const csv = `rollno,action\n${a.rollNo},add\n${b.rollNo},add\n${c.rollNo},drop\n`;
    expect(await changeEnrollments(upload(id, csv))).toEqual({ ok: true, data: { added: 2, dropped: 1 } });
    const statuses = Object.fromEntries(
      (await Enrollment.find({ offeringId: offering._id })).map((e) => [String(e.studentId), e.status]),
    );
    expect(statuses).toEqual({ [String(a._id)]: 'active', [String(b._id)]: 'active', [String(c._id)]: 'dropped' });
    const audit = await AuditLog.find({ action: 'enrollment.changed', offeringId: offering._id });
    expect(audit.map((e) => e.after)).toEqual([{ added: 2, dropped: 1, source: 'csv' }]);
  });

  it('treats adding an enrolled student as no change and writes no audit entry', async () => {
    const { faculty, offering, id, students } = await teaching();
    await Enrollment.create({ offeringId: offering._id, studentId: students[0]._id, status: 'active' });
    await signInAs(faculty);
    expect(await changeEnrollments(upload(id, `rollno,action\n${students[0].rollNo},add\n`))).toEqual({
      ok: true,
      data: { added: 0, dropped: 0 },
    });
    expect(await AuditLog.countDocuments({ offeringId: offering._id })).toBe(0);
  });

  it('writes nothing when any row is wrong and lists every wrong row', async () => {
    const { faculty, offering, id, students } = await teaching();
    await signInAs(faculty);
    const csv = `rollno,action\n${students[0].rollNo},add\nNOPE-1,add\n${students[1].rollNo},drop\n${students[2].rollNo},remove\n`;
    const result = await changeEnrollments(upload(id, csv));
    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { file: ['Row 4: Action must be add or drop.'] },
    });
    const second = await changeEnrollments(
      upload(id, `rollno,action\n${students[0].rollNo},add\nNOPE-1,add\n${students[1].rollNo},drop\n`),
    );
    expect(second).toMatchObject({
      ok: false,
      fieldErrors: {
        file: [
          'Row 2: No student has roll number NOPE-1.',
          `Row 3: ${students[1].rollNo} is not enrolled in this offering.`,
        ],
      },
    });
    expect(await Enrollment.countDocuments({ offeringId: offering._id })).toBe(0);
  });

  it('rejects a file with the wrong columns or no rows', async () => {
    const { faculty, id } = await teaching();
    await signInAs(faculty);
    expect(await changeEnrollments(upload(id, 'roll,what\nx,y\n'))).toMatchObject({
      ok: false,
      fieldErrors: { file: ['Missing column "rollno".', 'Missing column "action".'] },
    });
    expect(await changeEnrollments(upload(id, 'rollno,action\n'))).toMatchObject({
      ok: false,
      fieldErrors: { file: ['The file has no data rows.'] },
    });
    expect(await changeEnrollments(upload(id, ''))).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('is limited to the offering faculty and admins, and stops once marks are locked', async () => {
    const { faculty, offering, id, students } = await teaching();
    const csv = `rollno,action\n${students[0].rollNo},add\n`;

    await signInAs(students[0]);
    expect(await changeEnrollments(upload(id, csv))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    await signInAs(await makeUser({ roles: ['faculty'] }));
    await expect(changeEnrollments(upload(id, csv))).rejects.toThrow(NOT_FOUND);
    await signInAs(await makeUser({ roles: ['faculty', 'hod'], departmentId: offering.departmentId }));
    await expect(changeEnrollments(upload(id, csv))).rejects.toThrow(NOT_FOUND);
    expect(await Enrollment.countDocuments({ offeringId: offering._id })).toBe(0);

    await asAdmin();
    expect(await changeEnrollments(upload(id, csv))).toMatchObject({ ok: true, data: { added: 1 } });

    await Offering.updateOne({ _id: offering._id }, { $set: { lockedAt: new Date() } });
    await signInAs(faculty);
    expect(await changeEnrollments(upload(id, `rollno,action\n${students[1].rollNo},add\n`))).toMatchObject({
      ok: false,
      code: 'LOCKED',
    });
    expect(await Enrollment.countDocuments({ offeringId: offering._id })).toBe(1);
  });
});

describe('listOfferings', () => {
  it('filters, pages and shows faculty and active student counts', async () => {
    await asAdmin();
    const s = await setup();
    await Promise.all([s.student('A'), s.student('A')]);
    expect(await createOfferings(s.fields())).toMatchObject({ ok: true });
    const offering = await Offering.findOne({ courseId: s.course._id });
    await Enrollment.updateOne({ offeringId: offering?._id }, { $set: { status: 'dropped' } });

    const byTerm = await listOfferings(1, { termId: String(s.term._id) });
    expect(byTerm.total).toBe(1);
    expect(byTerm.rows[0]).toMatchObject({
      termCode: s.term.code,
      status: 'draft',
      students: 1,
      faculty: [{ name: s.faculty.name, email: s.faculty.email }],
    });
    expect((await listOfferings(1, { status: 'completed', termId: String(s.term._id) })).total).toBe(0);
    expect((await listOfferings(1, { departmentId: String(s.department._id) })).total).toBe(1);
    const all = await listOfferings(1, { status: 'draft' });
    expect(all.rows.length).toBeLessThanOrEqual(10);
    expect(all.total).toBe(await Offering.countDocuments({ status: 'draft' }));
    const unfiltered = await listOfferings(1, { termId: undefined, departmentId: undefined, status: undefined });
    expect(unfiltered.total).toBe(await Offering.countDocuments());
  });
});

describe('the offering search and counts', () => {
  it('finds offerings by a word of their title and counts them by status', async () => {
    await asAdmin();
    const term = newId();
    await Promise.all([
      makeOffering({ termId: term, title: 'ZZQB1001 · Hydroponic Gardening · T · A', status: 'active' }),
      makeOffering({ termId: term, title: 'ZZQB1002 · Desert Survival · T · A', status: 'draft' }),
    ]);
    const found = await listOfferings(1, { q: 'hydroponic' });
    expect(found.rows.map((r) => r.title)).toEqual(['ZZQB1001 · Hydroponic Gardening · T · A']);
    expect(found.total).toBe(1);
    expect((await listOfferings(1, { q: 'ZZQB1002', status: 'active' })).total).toBe(0);
    expect(await getOfferingStats()).toEqual({
      total: await Offering.countDocuments(),
      active: await Offering.countDocuments({ status: 'active' }),
      draft: await Offering.countDocuments({ status: 'draft' }),
      completed: await Offering.countDocuments({ status: 'completed' }),
    });
    await signInAs(await makeUser({ roles: ['faculty'] }));
    await expect(getOfferingStats()).rejects.toMatchObject({ digest: expect.stringMatching(/;\/home;/) });
  });
});
