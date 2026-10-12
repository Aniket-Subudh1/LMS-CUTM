import { beforeAll, describe, expect, it } from 'vitest';
import { saveBatch, saveDepartment, saveProgram, saveProgramOutcomes, saveTerm } from '@/app/(app)/admin/actions';
import { db } from '@/lib/db';
import { getProgram, listDepartments, listPrograms } from '@/lib/data/structure';
import { Batch } from '@/lib/models/batch';
import { Course } from '@/lib/models/course';
import { Department } from '@/lib/models/department';
import { Program } from '@/lib/models/program';
import { Term } from '@/lib/models/term';
import { form, makeUser, newId, signInAs } from '../factories';
import { switchBrowser } from '../next-request';

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
// `path` is a regular expression source: redirect() puts the target between semicolons in the error digest.
const redirectsTo = (path: string) => ({ digest: expect.stringMatching(new RegExp(`;${path};`)) });
const PROGRAM_PAGE = { ok: true, data: { next: expect.stringMatching(/^\/admin\/programs\/[a-f\d]{24}$/) } };
const SAVED = { ok: true };

beforeAll(async () => {
  await db();
  await Promise.all([Department, Program, Batch, Course, Term].map((m) => m.createCollection()));
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
    switchBrowser(new Map());
    await expect(listPrograms(1)).rejects.toMatchObject(redirectsTo('/login'));
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
  it('gives a UGC programme the default outcomes and a skill programme none', async () => {
    await asAdmin();
    const dept = await makeDepartment('PRG1');
    const base = { departmentId: String(dept._id), durationSemesters: '8', status: 'active' };
    expect(await saveProgram(form({ ...base, code: 'btech-x', name: 'B.Tech X', category: 'ugc' }))).toMatchObject(
      PROGRAM_PAGE,
    );
    expect(
      await saveProgram(form({ ...base, code: 'cert-x', name: 'Certificate X', category: 'skill' })),
    ).toMatchObject(PROGRAM_PAGE);
    const ugc = await Program.findOne({ code: 'BTECH-X' });
    const skill = await Program.findOne({ code: 'CERT-X' });
    expect([ugc?.pos.length, ugc?.psos.length]).toEqual([12, 3]);
    expect([skill?.pos.length, skill?.psos.length]).toEqual([0, 0]);
  });

  it('rejects a repeated code and an unknown department', async () => {
    await asAdmin();
    const dept = await makeDepartment('PRG2');
    const fields = {
      code: 'DUP-P',
      name: 'P',
      departmentId: String(dept._id),
      category: 'ugc',
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

  it('keeps the category and refuses to move a programme that has courses', async () => {
    await asAdmin();
    const [from, to] = await Promise.all([makeDepartment('PRG3'), makeDepartment('PRG4')]);
    const program = await Program.create({
      code: 'MOVE-P',
      name: 'Move',
      departmentId: from._id,
      category: 'ugc',
      durationSemesters: 8,
    });
    const edit = (departmentId: string) =>
      form({
        id: String(program._id),
        code: 'MOVE-P',
        name: 'Moved',
        departmentId,
        category: 'skill',
        durationSemesters: '6',
        status: 'active',
      });
    expect(await saveProgram(edit(String(to._id)))).toEqual(SAVED);
    expect(await Program.findById(program._id)).toMatchObject({ name: 'Moved', category: 'ugc', durationSemesters: 6 });

    await Course.create({
      programId: program._id,
      departmentId: to._id,
      category: 'ugc',
      code: 'C1',
      title: 'C',
      credits: 3,
      components: ['theory'],
      componentKey: 'theory',
    });
    expect(await saveProgram(edit(String(from._id)))).toMatchObject({ ok: false, code: 'CONFLICT' });
  });
});

describe('saveProgramOutcomes', () => {
  const grid = (programId: string, pos: string[], psos: string[] = []) => {
    const fields: Record<string, string> = { programId };
    pos.forEach((code, i) => Object.assign(fields, { [`po_code_${i}`]: code, [`po_title_${i}`]: `Title ${code}` }));
    psos.forEach((code, i) => Object.assign(fields, { [`pso_code_${i}`]: code, [`pso_title_${i}`]: `Title ${code}` }));
    return form(fields);
  };
  const ugc = async (code: string) =>
    Program.create({
      code,
      name: code,
      departmentId: newId(),
      category: 'ugc',
      durationSemesters: 8,
      pos: [
        { code: 'PO1', title: 'a' },
        { code: 'PO2', title: 'b' },
      ],
      psos: [{ code: 'PSO1', title: 'c' }],
    });

  it('replaces the lists, ignoring rows with an empty code', async () => {
    await asAdmin();
    const program = await ugc('OUT-1');
    expect(await saveProgramOutcomes(grid(String(program._id), ['PO1', '', 'PO3'], ['PSO1', 'PSO2']))).toMatchObject({
      ok: true,
    });
    const saved = await Program.findById(program._id);
    expect(saved?.pos.map((o) => o.code)).toEqual(['PO1', 'PO3']);
    expect(saved?.psos.map((o) => o.code)).toEqual(['PSO1', 'PSO2']);
  });

  it('rejects malformed and repeated codes', async () => {
    await asAdmin();
    const program = await ugc('OUT-2');
    expect(await saveProgramOutcomes(grid(String(program._id), ['X1']))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(await saveProgramOutcomes(grid(String(program._id), ['PO1', 'PO1']))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { pos: ['Each PO code can appear once.'] },
    });
  });

  it('refuses to drop an outcome a course maps to, naming the course', async () => {
    await asAdmin();
    const program = await ugc('OUT-3');
    await Course.create({
      programId: program._id,
      departmentId: program.departmentId,
      category: 'ugc',
      code: 'CS101',
      title: 'Intro',
      credits: 3,
      components: ['theory'],
      componentKey: 'theory',
      cos: [{ code: 'CO1', statement: 's', bloomLevel: 'apply' }],
      coMap: [{ coId: newId(), outcome: 'PO2', level: 2 }],
    });
    const result = await saveProgramOutcomes(grid(String(program._id), ['PO1'], ['PSO1']));
    expect(result).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(result.ok ? '' : result.message).toContain('PO2 is used in the CO–PO–PSO matrix of CS101');
    expect((await Program.findById(program._id))?.pos).toHaveLength(2);

    await Course.updateOne({ code: 'CS101', programId: program._id }, { $set: { coMap: [] } });
    expect(await saveProgramOutcomes(grid(String(program._id), ['PO1'], ['PSO1']))).toMatchObject({ ok: true });
  });

  it('has no outcomes to edit on a skill programme', async () => {
    await asAdmin();
    const program = await Program.create({
      code: 'OUT-S',
      name: 'S',
      departmentId: newId(),
      category: 'skill',
      durationSemesters: 2,
    });
    expect(await saveProgramOutcomes(grid(String(program._id), ['PO1']))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
  });
});

describe('saveBatch', () => {
  it('splits sections, and one start year is one batch per programme', async () => {
    await asAdmin();
    const program = await Program.create({
      code: 'BAT-1',
      name: 'B',
      departmentId: newId(),
      category: 'ugc',
      durationSemesters: 8,
    });
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
        Program.create({ code, name: code, departmentId: newId(), category: 'ugc', durationSemesters: 8 }),
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
    await Program.create({
      code: 'RD-PROG',
      name: 'Reads',
      departmentId: dept._id,
      category: 'ugc',
      durationSemesters: 8,
    });
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
