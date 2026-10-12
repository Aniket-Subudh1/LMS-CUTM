import { beforeAll, describe, expect, it } from 'vitest';
import { addCo, deleteCo, saveCoMap, saveCourse, saveObjectives, updateCo } from '@/app/(app)/admin/courses/actions';
import { db } from '@/lib/db';
import { getCourse, listCourses } from '@/lib/data/courses';
import { AuditLog } from '@/lib/models/audit-log';
import { Course } from '@/lib/models/course';
import { Program } from '@/lib/models/program';
import { form, makeUser, newId, signInAs } from '../factories';
import { switchBrowser } from '../next-request';

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const COURSE_PAGE = { digest: expect.stringMatching(/;\/admin\/courses\/[a-f\d]{24};/) };

beforeAll(async () => {
  await db();
  await Promise.all([Course.createCollection(), AuditLog.createCollection(), Program.createCollection()]);
});

async function asAdmin() {
  return signInAs(await makeUser({ roles: ['admin'] }));
}

const makeProgram = (code: string, category: 'ugc' | 'skill' = 'ugc') =>
  Program.create({
    code,
    name: code,
    departmentId: newId(),
    category,
    durationSemesters: 8,
    pos:
      category === 'ugc'
        ? [
            { code: 'PO1', title: 'a' },
            { code: 'PO2', title: 'b' },
          ]
        : [],
    psos: category === 'ugc' ? [{ code: 'PSO1', title: 'c' }] : [],
  });

const courseFields = (programId: string, code: string, components = ['theory', 'practice'], credits = '3') =>
  form({ programId, code, title: `Title ${code}`, credits, 'components[]': components, status: 'draft' });

async function makeCourse(code: string, category: 'ugc' | 'skill' = 'ugc') {
  const program = await makeProgram(`P-${code}`, category);
  await expect(saveCourse(courseFields(String(program._id), code))).rejects.toMatchObject(COURSE_PAGE);
  const course = await Course.findOne({ programId: program._id, code });
  if (!course) throw new Error('course was not created');
  return { program, course, id: String(course._id) };
}

const auditOf = (courseId: string, action: string) =>
  AuditLog.find({ entity: 'course', entityId: courseId, action }).sort({ at: 1 }).lean();

describe('admin only', () => {
  it('refuses every catalog action to other roles', async () => {
    const id = String(newId());
    await signInAs(await makeUser({ roles: ['faculty', 'hod'] }));
    const results = await Promise.all([
      saveCourse(courseFields(id, 'X')),
      saveObjectives(form({ courseId: id, objectives: 'a' })),
      addCo(form({ courseId: id, statement: 's', bloomLevel: 'apply' })),
      updateCo(form({ courseId: id, coId: id, statement: 's', bloomLevel: 'apply' })),
      deleteCo(form({ courseId: id, coId: id })),
      saveCoMap(form({ courseId: id, 'cell[]': [''] })),
    ]);
    for (const result of results) expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    switchBrowser(new Map());
    await expect(listCourses(1, undefined)).rejects.toMatchObject({ digest: expect.stringContaining('/login') });
  });
});

describe('saveCourse', () => {
  it('copies department and category from the programme and computes the component key', async () => {
    await asAdmin();
    const program = await makeProgram('SC-1');
    await expect(saveCourse(courseFields(String(program._id), 'cs101', ['practice', 'theory']))).rejects.toMatchObject(
      COURSE_PAGE,
    );
    expect(await Course.findOne({ programId: program._id })).toMatchObject({
      code: 'CS101',
      category: 'ugc',
      componentKey: 'theory+practice',
      departmentId: program.departmentId,
    });
  });

  it('keeps a code unique within a programme only', async () => {
    await asAdmin();
    const [one, two] = await Promise.all([makeProgram('SC-2'), makeProgram('SC-3')]);
    await expect(saveCourse(courseFields(String(one._id), 'DUP'))).rejects.toMatchObject(COURSE_PAGE);
    expect(await saveCourse(courseFields(String(one._id), 'dup'))).toEqual({
      ok: false,
      code: 'CONFLICT',
      message: 'This programme already has a course DUP.',
    });
    await expect(saveCourse(courseFields(String(two._id), 'DUP'))).rejects.toMatchObject(COURSE_PAGE);
  });

  it('validates credits, components and the programme', async () => {
    await asAdmin();
    const program = await makeProgram('SC-4');
    expect(await saveCourse(courseFields(String(program._id), 'V1', ['theory'], '2.3'))).toMatchObject({
      ok: false,
      fieldErrors: { credits: ['Credits go in steps of 0.5.'] },
    });
    expect(await saveCourse(courseFields(String(program._id), 'V2', []))).toMatchObject({
      ok: false,
      fieldErrors: { 'components[]': ['Pick at least one component.'] },
    });
    expect(await saveCourse(courseFields(String(newId()), 'V3'))).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('updates in place without moving the programme or changing the category', async () => {
    await asAdmin();
    const { program, id } = await makeCourse('UP1');
    const result = await saveCourse(
      form({
        id,
        programId: String(newId()),
        code: 'UP1',
        title: 'Renamed',
        credits: '4',
        'components[]': ['theory'],
        status: 'active',
      }),
    );
    expect(result).toMatchObject({ ok: true });
    expect(await Course.findById(id)).toMatchObject({
      title: 'Renamed',
      credits: 4,
      componentKey: 'theory',
      status: 'active',
      programId: program._id,
    });
    expect(
      await saveCourse(
        form({
          id: String(newId()),
          programId: String(program._id),
          code: 'Z',
          title: 'Z',
          credits: '1',
          'components[]': ['theory'],
          status: 'draft',
        }),
      ),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('saveObjectives', () => {
  it('stores one objective per line', async () => {
    await asAdmin();
    const { id } = await makeCourse('OB1');
    expect(await saveObjectives(form({ courseId: id, objectives: ' first \n\nsecond\r\n' }))).toMatchObject({
      ok: true,
    });
    expect((await Course.findById(id))?.objectives).toEqual(['first', 'second']);
    const tooMany = Array.from({ length: 21 }, (_, i) => `objective ${i}`).join('\n');
    expect(await saveObjectives(form({ courseId: id, objectives: tooMany }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(await saveObjectives(form({ courseId: String(newId()), objectives: 'x' }))).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
  });
});

describe('course outcomes', () => {
  it('numbers COs in order, never reuses a code, and audits every change', async () => {
    await asAdmin();
    const { id } = await makeCourse('CO1');
    for (const statement of ['one', 'two', 'three']) {
      expect(await addCo(form({ courseId: id, statement, bloomLevel: 'apply' }))).toMatchObject({ ok: true });
    }
    let course = await Course.findById(id);
    expect(course?.cos.map((c) => c.code)).toEqual(['CO1', 'CO2', 'CO3']);

    const second = course?.cos[1];
    expect(await deleteCo(form({ courseId: id, coId: String(second?._id) }))).toMatchObject({ ok: true });
    expect(await addCo(form({ courseId: id, statement: 'four', bloomLevel: 'create' }))).toMatchObject({ ok: true });
    course = await Course.findById(id);
    expect(course?.cos.map((c) => c.code)).toEqual(['CO1', 'CO3', 'CO4']);

    const entries = await auditOf(id, 'course.cos_changed');
    expect(entries).toHaveLength(5);
    expect(entries[3]).toMatchObject({ before: [{ code: 'CO2', statement: 'two' }], after: [] });
  });

  it('updates the statement and level, and ignores a save that changes nothing', async () => {
    await asAdmin();
    const { id } = await makeCourse('CO2');
    await addCo(form({ courseId: id, statement: 'old', bloomLevel: 'remember' }));
    const co = (await Course.findById(id))?.cos[0];
    const input = { courseId: id, coId: String(co?._id), statement: 'new', bloomLevel: 'evaluate' };
    expect(await updateCo(form(input))).toMatchObject({ ok: true });
    expect((await Course.findById(id))?.cos[0]).toMatchObject({
      code: 'CO1',
      statement: 'new',
      bloomLevel: 'evaluate',
    });
    expect(await updateCo(form(input))).toMatchObject({ ok: true });
    expect(await auditOf(id, 'course.cos_changed')).toHaveLength(2);
    expect(await updateCo(form({ ...input, coId: String(newId()) }))).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await updateCo(form({ ...input, bloomLevel: 'ponder' }))).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('allows at most 15 and has none on a skill course', async () => {
    await asAdmin();
    const { id } = await makeCourse('CO3');
    const cos = Array.from({ length: 15 }, (_, i) => ({ code: `CO${i + 1}`, statement: 's', bloomLevel: 'apply' }));
    await Course.updateOne({ _id: id }, { $set: { cos } });
    expect(await addCo(form({ courseId: id, statement: 'sixteen', bloomLevel: 'apply' }))).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'A course has at most 15 COs.',
    });
    const skill = await makeCourse('SK1', 'skill');
    expect(await addCo(form({ courseId: skill.id, statement: 's', bloomLevel: 'apply' }))).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Skill courses have no course outcomes.',
    });
  });

  it('removes a CO together with its matrix cells', async () => {
    await asAdmin();
    const { id } = await makeCourse('CO4');
    await addCo(form({ courseId: id, statement: 'a', bloomLevel: 'apply' }));
    await addCo(form({ courseId: id, statement: 'b', bloomLevel: 'apply' }));
    const [one, two] = (await Course.findById(id))?.cos ?? [];
    await saveCoMap(form({ courseId: id, 'cell[]': [`${one._id}:PO1:3`, `${two._id}:PO1:2`, `${two._id}:PSO1:1`] }));
    await deleteCo(form({ courseId: id, coId: String(one._id) }));
    const course = await Course.findById(id);
    expect(course?.coMap.map((m) => `${m.outcome}:${m.level}`)).toEqual(['PO1:2', 'PSO1:1']);
    expect(course?.coMap.every((m) => m.coId.equals(two._id))).toBe(true);
  });
});

describe('saveCoMap', () => {
  async function courseWithCos() {
    const made = await makeCourse(`MAP${Math.random().toString(36).slice(2, 7)}`);
    await addCo(form({ courseId: made.id, statement: 'a', bloomLevel: 'apply' }));
    await addCo(form({ courseId: made.id, statement: 'b', bloomLevel: 'apply' }));
    const [one, two] = (await Course.findById(made.id))?.cos ?? [];
    return { ...made, one: String(one._id), two: String(two._id) };
  }

  it('replaces the matrix, treating an empty cell as no link, and audits only the changed cells', async () => {
    await asAdmin();
    const { id, one, two } = await courseWithCos();
    expect(await saveCoMap(form({ courseId: id, 'cell[]': [`${one}:PO1:3`, '', `${two}:PSO1:2`, ''] }))).toMatchObject({
      ok: true,
    });
    expect((await Course.findById(id))?.coMap).toHaveLength(2);

    expect(
      await saveCoMap(form({ courseId: id, 'cell[]': [`${one}:PO1:3`, `${two}:PSO1:1`, `${one}:PO2:1`] })),
    ).toMatchObject({
      ok: true,
    });
    const entries = await auditOf(id, 'course.map_changed');
    expect(entries).toHaveLength(2);
    expect(entries[1].after).toEqual(
      expect.arrayContaining([
        { co: 'CO2', outcome: 'PSO1', from: 2, to: 1 },
        { co: 'CO1', outcome: 'PO2', from: null, to: 1 },
      ]),
    );
    expect(entries[1].after).toHaveLength(2);

    expect(
      await saveCoMap(form({ courseId: id, 'cell[]': [`${one}:PO1:3`, `${two}:PSO1:1`, `${one}:PO2:1`] })),
    ).toMatchObject({
      ok: true,
    });
    expect(await auditOf(id, 'course.map_changed')).toHaveLength(2);

    expect(await saveCoMap(form({ courseId: id, 'cell[]': [''] }))).toMatchObject({ ok: true });
    expect((await Course.findById(id))?.coMap).toHaveLength(0);
  });

  it('accepts only levels 1 to 3 and only the programme outcome codes', async () => {
    await asAdmin();
    const { id, one } = await courseWithCos();
    expect(await saveCoMap(form({ courseId: id, 'cell[]': [`${one}:PO1:4`] }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { 'cell[]': ['Levels are 1, 2 or 3.'] },
    });
    expect(await saveCoMap(form({ courseId: id, 'cell[]': [`${one}:PO1:0`] }))).toMatchObject({ ok: false });
    expect(await saveCoMap(form({ courseId: id, 'cell[]': [`${one}:PO9:2`] }))).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'PO9 is not an outcome of this programme.',
    });
    expect(await saveCoMap(form({ courseId: id, 'cell[]': [`${newId()}:PO1:2`] }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect((await Course.findById(id))?.coMap).toHaveLength(0);
  });

  it('has no matrix on a skill course and 404s nothing silently for an unknown course', async () => {
    await asAdmin();
    const skill = await makeCourse('SK2', 'skill');
    expect(await saveCoMap(form({ courseId: skill.id, 'cell[]': [''] }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(await saveCoMap(form({ courseId: String(newId()), 'cell[]': [''] }))).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
  });
});

describe('reads', () => {
  it('filters the list by programme and returns the detail with matrix columns and cells', async () => {
    await asAdmin();
    const { program, id } = await makeCourse('RD1');
    await makeCourse('RD2');
    await addCo(form({ courseId: id, statement: 'a', bloomLevel: 'apply' }));
    const co = (await Course.findById(id))?.cos[0];
    await saveCoMap(form({ courseId: id, 'cell[]': [`${co?._id}:PSO1:2`] }));

    const filtered = await listCourses(1, String(program._id));
    expect(filtered.total).toBe(1);
    expect(filtered.rows[0]).toMatchObject({ code: 'RD1', programCode: 'P-RD1' });

    const detail = await getCourse(id);
    expect(detail.outcomes).toEqual(['PO1', 'PO2', 'PSO1']);
    expect(detail.cells).toEqual({ [`${co?._id}:PSO1`]: 2 });
    expect(detail.cos).toEqual([{ id: String(co?._id), code: 'CO1', statement: 'a', bloomLevel: 'apply' }]);
  });

  it('answers 404 for an invalid or unknown course id', async () => {
    await asAdmin();
    await expect(getCourse('nope')).rejects.toThrow(NOT_FOUND);
    await expect(getCourse(String(newId()))).rejects.toThrow(NOT_FOUND);
  });
});
