import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AddCo,
  CreateOfferings,
  CreateUser,
  SaveBaskets,
  SaveCoMap,
  SaveCourse,
  SaveCourseModule,
  SaveProgramOutcomes,
  SaveTerm,
  StartCoursewareImport,
  UpdateCo,
} from './structure';

const id = 'a'.repeat(24);
const other = 'b'.repeat(24);
const fieldErrors = (result: { success: boolean; error?: z.ZodError }) =>
  result.error ? z.flattenError(result.error).fieldErrors : {};

describe('SaveCourse', () => {
  const course = {
    code: 'cutm 1535',
    title: 'Advanced complex analysis',
    theory: '3',
    practice: '0',
    project: '1',
    status: 'active',
  };

  it('reads T-P-Pj in half steps and keeps the type optional', () => {
    const ok = SaveCourse.safeParse({ ...course, type: '' });
    expect(ok.success && ok.data).toMatchObject({ theory: 3, practice: 0, project: 1, type: undefined });
    expect(fieldErrors(SaveCourse.safeParse({ ...course, practice: '0.25' }))).toEqual({
      practice: ['Credits go in steps of 0.5.'],
    });
  });

  it('takes a whole-semester part but refuses more than 30 credits in all', () => {
    expect(SaveCourse.safeParse({ ...course, theory: '0', practice: '0', project: '24' }).success).toBe(true);
    expect(fieldErrors(SaveCourse.safeParse({ ...course, theory: '20', practice: '10', project: '1' }))).toEqual({
      project: ['A course has at most 30 credits in all.'],
    });
  });
});

describe('AddCo and UpdateCo', () => {
  it('take a statement and up to three Bloom levels, none ticked being none', () => {
    expect(AddCo.parse({ courseId: id, statement: ' Explain residues. ', 'bloom[]': ['understand', 'apply'] })).toEqual(
      {
        courseId: id,
        statement: 'Explain residues.',
        'bloom[]': ['understand', 'apply'],
      },
    );
    expect(UpdateCo.parse({ courseId: id, coId: other, statement: 'Design a solver.' })['bloom[]']).toEqual([]);
  });

  it('refuses an empty statement, unknown levels, repeats and more than three', () => {
    expect(fieldErrors(AddCo.safeParse({ courseId: id, statement: ' ', 'bloom[]': ['recall'] }))).toEqual({
      statement: ['Required.'],
      'bloom[]': ['Pick from the levels shown.'],
    });
    expect(
      fieldErrors(AddCo.safeParse({ courseId: id, statement: 'Analyse.', 'bloom[]': ['apply', 'apply'] })),
    ).toEqual({ 'bloom[]': ['Pick each level once.'] });
    expect(
      fieldErrors(
        AddCo.safeParse({
          courseId: id,
          statement: 'Analyse data.',
          'bloom[]': ['remember', 'understand', 'apply', 'analyse'],
        }),
      ),
    ).toEqual({ 'bloom[]': ['Pick at most three levels.'] });
  });
});

describe('SaveCoMap', () => {
  it('takes PO1–PO12 and PSO1–PSO3 at levels 1–3, and nothing ticked as an empty map', () => {
    expect(SaveCoMap.safeParse({ courseId: id, 'cell[]': [`${id}:PO12:3`, `${id}:PSO3:1`] }).success).toBe(true);
    expect(SaveCoMap.safeParse({ courseId: id }).success && SaveCoMap.parse({ courseId: id })['cell[]']).toEqual([]);
    for (const bad of [`${id}:PO13:2`, `${id}:PSO4:1`, `${id}:PO1:4`, `${id}:PO1:0`, `${id}:po1:2`]) {
      expect(SaveCoMap.safeParse({ courseId: id, 'cell[]': [bad] }).success).toBe(false);
    }
  });

  it('holds at most 225 links', () => {
    const cells = Array.from({ length: 226 }, () => `${id}:PO1:1`);
    expect(fieldErrors(SaveCoMap.safeParse({ courseId: id, 'cell[]': cells }))).toEqual({
      'cell[]': ['A course has at most 225 links.'],
    });
  });
});

describe('SaveCourseModule', () => {
  it('reads one module, its hours and its practicals', () => {
    expect(
      SaveCourseModule.parse({
        courseId: id,
        moduleId: '',
        title: 'Residues',
        hours: '4 + 0 + 2',
        topics: ' Residue theorem ',
        practicals: 'Plot poles\n\nFind residues',
      }),
    ).toEqual({
      courseId: id,
      title: 'Residues',
      hours: '4+0+2',
      topics: 'Residue theorem',
      practicals: ['Plot poles', 'Find residues'],
    });
    expect(SaveCourseModule.parse({ courseId: id, moduleId: other, title: 'Poles', hours: '' })).toMatchObject({
      moduleId: other,
      hours: null,
      topics: '',
      practicals: [],
    });
    expect(fieldErrors(SaveCourseModule.safeParse({ courseId: id, title: '', hours: 'six' }))).toEqual({
      title: ['Required.'],
      hours: ['Write hours as 6 or 4+0+2.'],
    });
  });
});

describe('SaveProgramOutcomes', () => {
  it('keeps the titled codes in code order', () => {
    const parsed = SaveProgramOutcomes.safeParse({
      programId: id,
      title_PSO1: 'Higher education',
      title_PO1: ' Engineering knowledge ',
      title_PO2: '',
    });
    expect(parsed.success && parsed.data.outcomeTitles).toEqual([
      { code: 'PO1', title: 'Engineering knowledge' },
      { code: 'PSO1', title: 'Higher education' },
    ]);
  });
});

describe('SaveBaskets', () => {
  it('refuses two baskets with one name', () => {
    const parsed = SaveBaskets.safeParse({ programId: id, rows: '2', name_0: 'Basket I', name_1: 'basket i' });
    expect(parsed.success).toBe(false);
    expect(parsed.error && z.flattenError(parsed.error).formErrors).toEqual(['Each basket name can appear once.']);
  });

  it('reads scope and minimum credits', () => {
    const parsed = SaveBaskets.safeParse({
      programId: id,
      rows: '1',
      name_0: 'Basket IV',
      scope_0: 'choice',
      minCredits_0: '12.5',
    });
    expect(parsed.success && parsed.data.baskets).toEqual([
      { basketId: null, name: 'Basket IV', title: null, scope: 'choice', minCredits: 12.5 },
    ]);
  });
});

describe('CreateOfferings', () => {
  const offering = { batchId: id, courseId: id, termId: id, 'sections[]': ['A', 'B'], 'faculty[]': [id] };

  it('takes several sections and faculty ticked or typed', () => {
    expect(CreateOfferings.safeParse(offering).success).toBe(true);
    expect(
      CreateOfferings.safeParse({ ...offering, 'faculty[]': undefined, otherFaculty: 'a@cutm.ac.in' }).success,
    ).toBe(true);
  });

  it('needs a section and a faculty member, and not the whole batch with sections', () => {
    expect(fieldErrors(CreateOfferings.safeParse({ ...offering, 'sections[]': undefined }))).toEqual({
      'sections[]': ['Tick at least one section.'],
    });
    expect(fieldErrors(CreateOfferings.safeParse({ ...offering, 'faculty[]': undefined }))).toEqual({
      'faculty[]': ['Choose 1 to 5 faculty members.'],
    });
    expect(fieldErrors(CreateOfferings.safeParse({ ...offering, 'sections[]': ['*', 'A'] }))).toEqual({
      'sections[]': ['Choose the whole batch or sections, not both.'],
    });
  });
});

describe('StartCoursewareImport', () => {
  it('needs a page for "one page"', () => {
    expect(StartCoursewareImport.safeParse({ mode: 'new' }).success).toBe(true);
    expect(fieldErrors(StartCoursewareImport.safeParse({ mode: 'one', page: '' }))).toEqual({
      page: ['Enter the page number or its link.'],
    });
  });
});

describe('SaveTerm', () => {
  const term = {
    code: '2026-odd',
    name: 'Odd 2026',
    academicYear: '2026-27',
    startsOn: '2026-07-15',
    endsOn: '2026-12-20',
    status: 'upcoming',
  };

  it('upper-cases the code and needs the start before the end', () => {
    const ok = SaveTerm.safeParse(term);
    expect(ok.success && ok.data.code).toBe('2026-ODD');
    expect(SaveTerm.safeParse({ ...term, endsOn: '2026-07-15' }).success).toBe(false);
    expect(SaveTerm.safeParse({ ...term, startsOn: '2026-02-30' }).success).toBe(false);
  });
});

describe('checkbox groups', () => {
  it('turn "nothing ticked" into the field message, not a type error', () => {
    expect(fieldErrors(CreateUser.safeParse({ name: 'N', email: 'n@cutm.test' }))).toEqual({
      'roles[]': ['Pick at least one role.'],
    });
  });
});
