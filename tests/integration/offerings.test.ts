import { beforeAll, describe, expect, it } from 'vitest';
import { setOfferingStatus, updateOfferingFaculty, createOffering } from '@/app/(app)/admin/offerings/actions';
import { changeEnrollments } from '@/app/(app)/courses/actions';
import { db } from '@/lib/db';
import { componentKey } from '@/lib/domain/structure';
import { listOfferings } from '@/lib/data/offerings';
import { AuditLog } from '@/lib/models/audit-log';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { Department } from '@/lib/models/department';
import { Enrollment } from '@/lib/models/enrollment';
import { EvaluationScheme } from '@/lib/models/evaluation-scheme';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Term } from '@/lib/models/term';
import { form, makeOffering, makeUser, newId, signInAs } from '../factories';
import { switchBrowser } from '../next-request';

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const TO_OFFERINGS = { digest: expect.stringMatching(/;\/admin\/offerings;/) };

beforeAll(async () => {
  await db();
  await Promise.all(
    [AuditLog, Batch, Course, Department, Enrollment, EvaluationScheme, Offering, Program, Term].map((m) =>
      m.createCollection(),
    ),
  );
});

let seq = 0;
const next = () => ++seq;

// A programme with an active theory scheme, a 2025 batch (sections A and B), a term and a faculty member.
async function setup(opts: { category?: 'ugc' | 'skill'; components?: ('theory' | 'practice' | 'project')[] } = {}) {
  const n = next();
  const category = opts.category ?? 'ugc';
  const components = opts.components ?? ['theory'];
  const department = await Department.create({ code: `D${n}`, name: `Dept ${n}` });
  const program = await Program.create({
    code: `PR${n}`,
    name: `Programme ${n}`,
    departmentId: department._id,
    category,
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
  const key = componentKey(components);
  const course = await Course.create({
    programId: program._id,
    departmentId: department._id,
    category,
    code: `C${n}`,
    title: `Course ${n}`,
    credits: 3,
    components,
    componentKey: key,
    status: 'active',
  });
  const faculty = await makeUser({ roles: ['faculty'], email: `faculty${n}@cutm.test` });
  const student = (section: string, over: Record<string, unknown> = {}) =>
    makeUser({ roles: ['student'], status: 'active', batchId: batch._id, section, rollNo: `R${n}-${next()}`, ...over });
  const fields = (over: Record<string, string> = {}) =>
    form({
      courseId: String(course._id),
      termId: String(term._id),
      batchId: String(batch._id),
      section: 'A',
      faculty: faculty.email,
      projectMode: '',
      ...over,
    });
  return { department, program, batch, term, course, faculty, student, fields, key };
}

async function activeScheme(key: ReturnType<typeof componentKey>) {
  return EvaluationScheme.findOneAndUpdate(
    { componentKey: key, version: 1 },
    {
      $setOnInsert: {
        name: 'Standard',
        internalMax: 50,
        externalMax: 50,
        components: [{ key: 'quiz', label: 'Quiz', weight: 50, modes: ['quiz'], aggregation: 'average' }],
        rounding: { decimals: 0, mode: 'half_up' },
        status: 'active',
        createdBy: newId(),
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
}

const asAdmin = async () => signInAs(await makeUser({ roles: ['admin'] }));

describe('createOffering', () => {
  it('is for admins only', async () => {
    const s = await setup();
    switchBrowser(new Map());
    expect(await createOffering(s.fields())).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
    await signInAs(s.faculty);
    expect(await createOffering(s.fields())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await Offering.countDocuments({ courseId: s.course._id })).toBe(0);
  });

  it('enrolls exactly the live students of the section and binds the active scheme', async () => {
    await asAdmin();
    const s = await setup();
    const scheme = await activeScheme('theory');
    const inA = await Promise.all([s.student('A'), s.student('A'), s.student('A', { status: 'invited' })]);
    await Promise.all([
      s.student('B'),
      s.student('A', { status: 'disabled' }),
      s.student('A', { batchId: newId() }),
      makeUser({ roles: ['faculty'], batchId: s.batch._id, section: 'A' }),
    ]);

    await expect(createOffering(s.fields())).rejects.toMatchObject(TO_OFFERINGS);
    const offering = await Offering.findOne({ courseId: s.course._id });
    expect(offering).toMatchObject({
      title: `${s.course.code} · ${s.course.title} · ${s.term.code} · A`,
      section: 'A',
      status: 'draft',
      category: 'ugc',
      schemeId: scheme?._id,
      projectMode: null,
    });
    expect(offering?.programId).toEqual(s.program._id);
    expect(offering?.departmentId).toEqual(s.department._id);
    expect(offering?.facultyIds).toEqual([s.faculty._id]);

    const enrolled = await Enrollment.find({ offeringId: offering?._id });
    expect(enrolled.map((e) => String(e.studentId)).sort()).toEqual(inA.map((u) => String(u._id)).sort());
    expect(enrolled.every((e) => e.status === 'active')).toBe(true);

    const audit = await AuditLog.findOne({ action: 'enrollment.changed', offeringId: offering?._id });
    expect(audit?.after).toEqual({ added: 3, dropped: 0, source: 'batch', section: 'A' });
  });

  it('enrolls the whole batch when no section is given', async () => {
    await asAdmin();
    const s = await setup();
    await activeScheme('theory');
    await Promise.all([s.student('A'), s.student('B'), s.student('B')]);
    await expect(createOffering(s.fields({ section: '' }))).rejects.toMatchObject(TO_OFFERINGS);
    const offering = await Offering.findOne({ courseId: s.course._id });
    expect(offering?.section).toBeNull();
    expect(await Enrollment.countDocuments({ offeringId: offering?._id })).toBe(3);
  });

  it('refuses a repeat with CONFLICT and leaves the first enrollment untouched', async () => {
    await asAdmin();
    const s = await setup();
    await activeScheme('theory');
    await s.student('A');
    await expect(createOffering(s.fields())).rejects.toMatchObject(TO_OFFERINGS);
    expect(await createOffering(s.fields())).toEqual({
      ok: false,
      code: 'CONFLICT',
      message: 'This course is already offered to that batch and section in that term.',
    });
    expect(await Offering.countDocuments({ courseId: s.course._id })).toBe(1);
    const offering = await Offering.findOne({ courseId: s.course._id });
    expect(await Enrollment.countDocuments({ offeringId: offering?._id })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'enrollment.changed', offeringId: offering?._id })).toBe(1);

    await expect(createOffering(s.fields({ section: '' }))).rejects.toMatchObject(TO_OFFERINGS);
    await expect(createOffering(s.fields({ section: '' }))).resolves.toMatchObject({ ok: false, code: 'CONFLICT' });
  });

  it('needs an active scheme for a UGC course but not for a skill course', async () => {
    await asAdmin();
    const ugc = await setup({ components: ['practice'] });
    expect(await createOffering(ugc.fields())).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'No active evaluation scheme for practice.',
    });
    expect(await Offering.countDocuments({ courseId: ugc.course._id })).toBe(0);

    const skill = await setup({ category: 'skill' });
    await expect(createOffering(skill.fields())).rejects.toMatchObject(TO_OFFERINGS);
    expect((await Offering.findOne({ courseId: skill.course._id }))?.schemeId).toBeNull();
  });

  it('requires a project mode exactly when the course has a project component', async () => {
    await asAdmin();
    await activeScheme('theory+project');
    const withProject = await setup({ components: ['theory', 'project'] });
    expect(await createOffering(withProject.fields())).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { projectMode: ['Choose GitHub or Tracker.'] },
    });
    await expect(createOffering(withProject.fields({ projectMode: 'tracker' }))).rejects.toMatchObject(TO_OFFERINGS);
    expect((await Offering.findOne({ courseId: withProject.course._id }))?.projectMode).toBe('tracker');

    await activeScheme('theory');
    const plain = await setup();
    await expect(createOffering(plain.fields({ projectMode: 'github' }))).rejects.toMatchObject(TO_OFFERINGS);
    expect((await Offering.findOne({ courseId: plain.course._id }))?.projectMode).toBeNull();
  });

  it('checks the course, batch, section and faculty', async () => {
    await asAdmin();
    await activeScheme('theory');
    const s = await setup();
    const other = await setup();

    expect(await createOffering(s.fields({ batchId: String(other.batch._id) }))).toMatchObject({
      ok: false,
      message: 'That batch belongs to a different programme than the course.',
    });
    expect(await createOffering(s.fields({ section: 'Z' }))).toMatchObject({
      ok: false,
      fieldErrors: { section: ['Z is not a section of that batch.'] },
    });
    const student = await makeUser({ roles: ['student'], email: 'stu@cutm.test' });
    expect(await createOffering(s.fields({ faculty: `${student.email}, nobody@cutm.test` }))).toMatchObject({
      ok: false,
      fieldErrors: { faculty: [`No faculty account for ${student.email}, nobody@cutm.test.`] },
    });
    const disabled = await makeUser({ roles: ['faculty'], status: 'disabled' });
    expect(await createOffering(s.fields({ faculty: disabled.email }))).toMatchObject({ ok: false });
    expect(
      await createOffering(s.fields({ faculty: Array.from({ length: 6 }, (_, i) => `f${i}@cutm.test`).join(',') })),
    ).toMatchObject({
      ok: false,
      fieldErrors: { faculty: ['An offering has at most 5 faculty.'] },
    });
    expect(await createOffering(s.fields({ courseId: String(newId()) }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(await createOffering(s.fields({ termId: String(newId()) }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    await Course.updateOne({ _id: s.course._id }, { $set: { status: 'archived' } });
    expect(await createOffering(s.fields())).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await Offering.countDocuments({ courseId: s.course._id })).toBe(0);
  });
});

describe('updateOfferingFaculty and setOfferingStatus', () => {
  it('replaces the faculty list', async () => {
    await asAdmin();
    const [one, two] = await Promise.all([makeUser({ roles: ['faculty'] }), makeUser({ roles: ['faculty'] })]);
    const offering = await makeOffering({ facultyIds: [one._id] });
    const id = String(offering._id);
    expect(await updateOfferingFaculty(form({ offeringId: id, faculty: `${two.email}\n${one.email}` }))).toMatchObject({
      ok: true,
    });
    expect((await Offering.findById(id))?.facultyIds).toEqual([two._id, one._id]);
    expect(await updateOfferingFaculty(form({ offeringId: id, faculty: '' }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(await updateOfferingFaculty(form({ offeringId: String(newId()), faculty: one.email }))).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
    await signInAs(one);
    expect(await updateOfferingFaculty(form({ offeringId: id, faculty: one.email }))).toMatchObject({
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
    await activeScheme('theory');
    await Promise.all([s.student('A'), s.student('A')]);
    await expect(createOffering(s.fields())).rejects.toMatchObject(TO_OFFERINGS);
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
    expect(all.rows.length).toBeLessThanOrEqual(25);
    expect(all.total).toBe(await Offering.countDocuments({ status: 'draft' }));
  });
});
