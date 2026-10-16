import { beforeAll, describe, expect, it } from 'vitest';
import {
  addProgrammeCourse,
  removeProgrammeCourse,
  saveBaskets,
  saveBatch,
  saveDepartment,
  saveProgram,
  saveProgramOutcomes,
  saveTerm,
} from '@/app/(app)/admin/actions';
import { db } from '@/lib/db';
import { getProgram, getStructureCounts, listCurriculum, listDepartments, listPrograms } from '@/lib/data/structure';
import { AuditLog } from '@/lib/models/audit-log';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { CurriculumEntry } from '@/lib/models/curriculum-entry';
import { Department } from '@/lib/models/department';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { Term } from '@/lib/models/term';
import { form, makeCourse, makeOffering, makeProgram, makeUser, newId, signInAs } from '../factories';
import { switchBrowser } from '../next-request';

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
// `path` is a regular expression source: redirect() puts the target between semicolons in the error digest.
const redirectsTo = (path: string) => ({ digest: expect.stringMatching(new RegExp(`;${path};`)) });
const PROGRAM_PAGE = { ok: true, data: { next: expect.stringMatching(/^\/admin\/programs\/[a-f\d]{24}$/) } };
const SAVED = { ok: true };

beforeAll(async () => {
  await db();
  await Promise.all(
    [AuditLog, Department, Program, Batch, Course, CurriculumEntry, Offering, Term].map((m) => m.createCollection()),
  );
});

async function asAdmin() {
  await signInAs(await makeUser({ roles: ['admin'] }));
}

async function makeDepartment(code: string) {
  return Department.create({ code, name: `${code} department` });
}

describe('who may change the structure', () => {
  it('needs a session and the admin role', async () => {
    const fields = form({ code: 'X', name: 'X', status: 'active' });
    switchBrowser(new Map());
    expect(await saveDepartment(fields)).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
    for (const roles of [['faculty'], ['hod'], ['support'], ['student']] as const) {
      await signInAs(await makeUser({ roles: [...roles] }));
      expect(await saveDepartment(fields)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    }
    expect(await Department.countDocuments({ code: 'X' })).toBe(0);
  });

  it('keeps every read behind the admin role', async () => {
    await signInAs(await makeUser({ roles: ['faculty'] }));
    await expect(listDepartments(1)).rejects.toMatchObject(redirectsTo('/home'));
    await expect(listPrograms(1)).rejects.toMatchObject(redirectsTo('/home'));
    await expect(getStructureCounts()).rejects.toMatchObject(redirectsTo('/home'));
    switchBrowser(new Map());
    await expect(listPrograms(1)).rejects.toMatchObject(redirectsTo('/login'));
  });
});

describe('getStructureCounts', () => {
  it('counts departments, programmes and terms', async () => {
    await asAdmin();
    await makeDepartment('CNT');
    expect(await getStructureCounts()).toEqual({
      departments: await Department.countDocuments(),
      programs: await Program.countDocuments(),
      terms: await Term.countDocuments(),
    });
  });
});

describe('saveDepartment', () => {
  it('creates with an upper-cased code, then rejects a repeat', async () => {
    await asAdmin();
    expect(await saveDepartment(form({ code: ' cse ', name: 'Computer Science', status: 'active' }))).toMatchObject({
      ok: true,
    });
    expect(await Department.findOne({ code: 'CSE' })).toMatchObject({ name: 'Computer Science' });
    expect(await saveDepartment(form({ code: 'Cse', name: 'Again', status: 'active' }))).toEqual({
      ok: false,
      code: 'CONFLICT',
      message: 'A department with code CSE already exists.',
    });
  });

  it('explains what is wrong with the fields', async () => {
    await asAdmin();
    const result = await saveDepartment(form({ code: 'A B', name: '', status: 'bogus' }));
    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { code: ['Use letters, digits, - or _.'], name: ['Required.'] },
    });
  });

  it('updates in place and answers 404 for an unknown id', async () => {
    await asAdmin();
    const dept = await makeDepartment('ECE');
    expect(
      await saveDepartment(form({ id: String(dept._id), code: 'ECE', name: 'Electronics', status: 'archived' })),
    ).toEqual(SAVED);
    expect(await Department.findById(dept._id)).toMatchObject({ name: 'Electronics', status: 'archived' });
    expect(
      await saveDepartment(form({ id: String(newId()), code: 'GHOST', name: 'G', status: 'active' })),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('saveProgram', () => {
  it('gives a new programme the default PSO titles', async () => {
    await asAdmin();
    const dept = await makeDepartment('PRG1');
    const base = { departmentId: String(dept._id), durationSemesters: '8', status: 'active' };
    expect(await saveProgram(form({ ...base, code: 'btech-x', name: 'B.Tech X' }))).toMatchObject(PROGRAM_PAGE);
    expect((await Program.findOne({ code: 'BTECH-X' }).lean())?.outcomeTitles).toEqual([
      { code: 'PSO1', title: 'Higher education' },
      { code: 'PSO2', title: 'Entrepreneurship' },
      { code: 'PSO3', title: 'Placement' },
    ]);
  });

  it('rejects a repeated code and an unknown department', async () => {
    await asAdmin();
    const dept = await makeDepartment('PRG2');
    const fields = {
      code: 'DUP-P',
      name: 'P',
      departmentId: String(dept._id),
      durationSemesters: '8',
      status: 'active',
    };
    expect(await saveProgram(form(fields))).toMatchObject(PROGRAM_PAGE);
    expect(await saveProgram(form(fields))).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(await saveProgram(form({ ...fields, code: 'NO-D', departmentId: String(newId()) }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
  });

  it('sets the department of a programme the course list created, and refuses to move one that has offerings', async () => {
    await asAdmin();
    const [from, to] = await Promise.all([makeDepartment('PRG3'), makeDepartment('PRG4')]);
    const program = await Program.create({ code: 'MOVE-P', name: 'Move' });
    const edit = (departmentId: string) =>
      form({
        id: String(program._id),
        code: 'MOVE-P',
        name: 'Moved',
        departmentId,
        durationSemesters: '6',
        status: 'active',
      });
    expect(await saveProgram(edit(String(from._id)))).toEqual(SAVED);
    expect(await Program.findById(program._id).lean()).toMatchObject({
      name: 'Moved',
      departmentId: from._id,
      durationSemesters: 6,
    });

    await makeOffering({ programId: program._id, departmentId: from._id });
    expect(await saveProgram(edit(String(to._id)))).toMatchObject({ ok: false, code: 'CONFLICT' });
  });
});

describe('saveProgramOutcomes', () => {
  it('titles the fixed codes and audits the change', async () => {
    await asAdmin();
    const program = await makeProgram();
    expect(
      await saveProgramOutcomes(
        form({ programId: String(program._id), title_PO1: 'Engineering knowledge', title_PSO1: 'Higher education' }),
      ),
    ).toMatchObject({ ok: true });
    expect((await Program.findById(program._id).lean())?.outcomeTitles).toEqual([
      { code: 'PO1', title: 'Engineering knowledge' },
      { code: 'PSO1', title: 'Higher education' },
    ]);
    expect(await AuditLog.countDocuments({ action: 'programme.outcomes_changed', entityId: program._id })).toBe(1);
  });
});

describe('saveBaskets', () => {
  it('renames a basket with its courses and refuses to remove one that lists courses', async () => {
    await asAdmin();
    const program = await makeProgram({ baskets: [{ name: 'Basket I' }, { name: 'Basket II' }] });
    const [one, two] = program.baskets;
    const course = await makeCourse();
    await CurriculumEntry.create({
      programId: program._id,
      courseId: course._id,
      courseCode: course.code,
      basket: 'Basket I',
    });
    const rows = (over: Record<string, string>) =>
      form({
        programId: String(program._id),
        rows: '2',
        basketId_0: String(one._id),
        name_0: 'Basket I',
        basketId_1: String(two._id),
        name_1: 'Basket II',
        ...over,
      });

    expect(await saveBaskets(rows({ remove_0: 'true' }))).toMatchObject({
      ok: false,
      code: 'CONFLICT',
      message: 'Basket I lists 1 course. Move them first.',
    });
    // Swapping two names moves each basket's courses with it.
    expect(
      await saveBaskets(rows({ name_0: 'Basket II', name_1: 'Basket I', scope_0: 'core', minCredits_0: '16' })),
    ).toMatchObject({ ok: true });
    expect(await CurriculumEntry.findOne({ courseId: course._id }).lean()).toMatchObject({ basket: 'Basket II' });
    expect(
      (await Program.findById(program._id).lean())?.baskets.map((b) => [String(b._id), b.name, b.scope, b.minCredits]),
    ).toEqual([
      [String(one._id), 'Basket II', 'core', 16],
      [String(two._id), 'Basket I', null, null],
    ]);
    expect(await saveBaskets(rows({ name_0: 'Basket II', name_1: 'Basket I', remove_1: 'true' }))).toMatchObject({
      ok: true,
    });
    expect((await Program.findById(program._id).lean())?.baskets.map((b) => b.name)).toEqual(['Basket II']);
  });
});

describe('the curriculum', () => {
  it('adds a catalogue course by code into a basket, and removes it', async () => {
    await asAdmin();
    const program = await makeProgram({ baskets: [{ name: 'Basket I' }] });
    const course = await makeCourse({ code: 'CUTM7001', credits: { theory: 3, practice: 0, project: 1 } });
    const programId = String(program._id);
    expect(await addProgrammeCourse(form({ programId, code: 'cutm 7001', basket: 'Basket I' }))).toMatchObject({
      ok: true,
    });
    expect(await addProgrammeCourse(form({ programId, code: 'CUTM7999' }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(await addProgrammeCourse(form({ programId, code: 'CUTM7001', basket: 'Basket IX' }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });

    expect(await getProgram(programId)).toMatchObject({
      baskets: [{ name: 'Basket I', courses: 1, credits: 4 }],
      unbasketed: { courses: 0, credits: 0 },
    });
    expect((await listCurriculum(programId, 1, undefined)).rows).toEqual([
      {
        courseId: String(course._id),
        code: 'CUTM7001',
        title: course.title,
        credits: { theory: 3, practice: 0, project: 1 },
        basket: 'Basket I',
        courseType: null,
      },
    ]);
    expect((await listCurriculum(programId, 1, '')).total).toBe(0);

    expect(await removeProgrammeCourse(form({ programId, courseId: String(course._id) }))).toMatchObject({ ok: true });
    expect(await CurriculumEntry.countDocuments({ programId })).toBe(0);
    expect(await AuditLog.countDocuments({ action: 'programme.curriculum_changed', entityId: program._id })).toBe(2);
  });
});

describe('saveBatch', () => {
  it('splits sections, and one start year is one batch per programme', async () => {
    await asAdmin();
    const program = await Program.create({ code: 'BAT-1', name: 'B', departmentId: newId(), durationSemesters: 8 });
    const fields = { programId: String(program._id), name: '2026 intake', startYear: '2026', status: 'active' };
    expect(await saveBatch(form({ ...fields, sections: 'A, B  C' }))).toMatchObject({ ok: true });
    expect(await Batch.findOne({ programId: program._id })).toMatchObject({ sections: ['A', 'B', 'C'] });
    expect(await saveBatch(form({ ...fields, sections: '' }))).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(await saveBatch(form({ ...fields, sections: 'A, A' }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { sections: ['Each section can appear once.'] },
    });
  });

  it('only edits a batch of the programme named in the form', async () => {
    await asAdmin();
    const [one, two] = await Promise.all(
      ['BAT-2', 'BAT-3'].map((code) =>
        Program.create({ code, name: code, departmentId: newId(), durationSemesters: 8 }),
      ),
    );
    const batch = await Batch.create({ programId: one._id, name: 'n', startYear: 2025 });
    const edit = (programId: string) =>
      form({ id: String(batch._id), programId, name: 'renamed', startYear: '2025', sections: 'A', status: 'active' });
    expect(await saveBatch(edit(String(two._id)))).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await saveBatch(edit(String(one._id)))).toEqual(SAVED);
    expect(await Batch.findById(batch._id)).toMatchObject({ name: 'renamed', sections: ['A'] });
  });
});

describe('saveTerm', () => {
  const term = (code: string, status: string, extra: Record<string, string> = {}) =>
    form({
      code,
      name: code,
      academicYear: '2026-27',
      startsOn: '2026-07-20',
      endsOn: '2026-12-20',
      status,
      ...extra,
    });

  it('stores calendar dates as midnight IST', async () => {
    await asAdmin();
    expect(await saveTerm(term('T-DATES', 'upcoming'))).toMatchObject({ ok: true });
    const saved = await Term.findOne({ code: 'T-DATES' });
    expect(saved?.startsOn.toISOString()).toBe('2026-07-19T18:30:00.000Z');
    expect(saved?.endsOn.toISOString()).toBe('2026-12-19T18:30:00.000Z');
  });

  it('closes the previous current term when another becomes current', async () => {
    await asAdmin();
    await saveTerm(term('T-A', 'current'));
    await saveTerm(term('T-B', 'current'));
    expect((await Term.findOne({ code: 'T-A' }))?.status).toBe('closed');
    expect((await Term.findOne({ code: 'T-B' }))?.status).toBe('current');

    const b = await Term.findOne({ code: 'T-B' });
    expect(await saveTerm(term('T-B', 'current', { id: String(b?._id), name: 'B renamed' }))).toEqual(SAVED);
    expect(await Term.countDocuments({ status: 'current' })).toBe(1);
    expect((await Term.findOne({ code: 'T-B' }))?.name).toBe('B renamed');
  });

  it('leaves the current term alone when a new term is not current, and rejects a repeat code', async () => {
    await asAdmin();
    await saveTerm(term('T-C', 'current'));
    await saveTerm(term('T-D', 'upcoming'));
    expect((await Term.findOne({ code: 'T-C' }))?.status).toBe('current');
    expect(await saveTerm(term('T-D', 'upcoming'))).toMatchObject({ ok: false, code: 'CONFLICT' });
  });

  it('refuses a term that ends before it starts and, on a repeat code, does not close the current term', async () => {
    await asAdmin();
    expect(await saveTerm(term('T-E', 'upcoming', { startsOn: '2026-12-20', endsOn: '2026-07-20' }))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { endsOn: ['The term must start before it ends.'] },
    });
    await saveTerm(term('T-F', 'current'));
    await saveTerm(term('T-G', 'upcoming'));
    expect(await saveTerm(term('T-G', 'current'))).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect((await Term.findOne({ code: 'T-F' }))?.status).toBe('current');
  });
});

describe('reads', () => {
  it('pages departments and joins the department code onto programmes', async () => {
    await asAdmin();
    const dept = await makeDepartment('RD-1');
    await Program.create({ code: 'RD-PROG', name: 'Reads', departmentId: dept._id, durationSemesters: 8 });
    const { rows, total } = await listPrograms(1);
    expect(rows.length).toBeLessThanOrEqual(25);
    expect(total).toBe(await Program.countDocuments());
    expect(rows.find((r) => r.code === 'RD-PROG')?.departmentCode).toBe('RD-1');
    expect((await listDepartments(1)).rows.length).toBeLessThanOrEqual(25);
  });

  it('answers 404 for a programme id that is invalid or unknown', async () => {
    await asAdmin();
    await expect(getProgram('nope')).rejects.toThrow(NOT_FOUND);
    await expect(getProgram(String(newId()))).rejects.toThrow(NOT_FOUND);
  });
});
