import { describe, expect, it } from 'vitest';
import { externalMaxima, gradeFor, gradeSheet, gradeSheetRow, internalMaxima, sgpa, type CourseMarks } from './grades';
import { SETTINGS } from '@/lib/schemas/settings';

const policy = SETTINGS.evaluation.schema.parse({});
const grading = SETTINGS.grading.schema.parse({});
const c = (theory: number, practice: number, project: number) => ({ theory, practice, project });
const ext = (component: 'theory' | 'practice' | 'project', marks: number | 'AB') => ({
  component,
  marks: marks === 'AB' ? null : marks,
  max: component === 'theory' ? 60 : 50,
  absent: marks === 'AB',
});
const course = (over: Partial<CourseMarks> & Pick<CourseMarks, 'courseCode' | 'credits'>): CourseMarks => ({
  policy,
  locked: true,
  internals: {},
  externals: [],
  ...over,
});

// 07 §6's worked table: each component's marks split into internal + external.
const DECT0901 = course({
  courseCode: 'DECT0901',
  credits: c(1, 2, 2),
  internals: { theory: 30, practice: 44, project: 47 },
  externals: [ext('theory', 57), ext('practice', 45), ext('project', 45)],
});
const CUTM1535 = course({
  courseCode: 'CUTM1535',
  credits: c(3, 0, 1),
  internals: { theory: 30, project: 40 },
  externals: [ext('theory', 44), ext('project', 40)],
});
const CUTM1014 = course({
  courseCode: 'CUTM1014',
  credits: c(1.5, 0, 1.5),
  internals: { theory: 25, project: 30 },
  externals: [ext('theory', 35), ext('project', 31)],
});

describe('maxima', () => {
  it('splits each component of the default policy into its internal and external parts', () => {
    expect(internalMaxima(policy)).toEqual({ theory: 40, practice: 50, project: 50 });
    expect(externalMaxima(policy)).toEqual({ theory: 60, practice: 50, project: 50 });
  });
});

describe('gradeFor', () => {
  it.each([
    [100, 'O', 10],
    [90, 'O', 10],
    [89, 'A+', 9],
    [70, 'A', 8],
    [61, 'B+', 7],
    [40, 'P', 4],
    [39, 'F', 0],
    [0, 'F', 0],
  ])('%d %% → %s (%d)', (pct, grade, points) => {
    expect(gradeFor(pct, grading.scale)).toEqual({ grade, points });
  });
});

describe('gradeSheet (07 §6)', () => {
  it.each([
    [DECT0901, 90, 'O', 10],
    [CUTM1535, 76, 'A', 8],
    [CUTM1014, 61, 'B+', 7],
  ])('%s', (marks, pct, grade, gradePoint) => {
    const result = gradeSheetRow(marks, grading);
    expect(result).toMatchObject({ ok: true, row: { pct, grade, gradePoint } });
  });

  it('gives the worked example SGPA 103 / 12 = 8.58', () => {
    const sheet = gradeSheet([DECT0901, CUTM1535, CUTM1014], grading);
    expect(sheet).toMatchObject({ status: 'draft', credits: 12, sgpa: 8.58 });
  });

  it('keeps each component as internal + external out of 100', () => {
    const result = gradeSheetRow(CUTM1535, grading);
    expect(result.ok && result.row.components).toEqual([
      { component: 'theory', internal: 30, internalMax: 40, external: 44, externalMax: 60, absent: false, marks: 74 },
      { component: 'project', internal: 40, internalMax: 50, external: 40, externalMax: 50, absent: false, marks: 80 },
    ]);
  });

  it('gives Ab, 0 points, for AB in practice only; its credits stay in the SGPA (4.42)', () => {
    const absent = course({ ...DECT0901, internals: { theory: 30, practice: 45, project: 47 } });
    absent.externals = [ext('theory', 57), ext('practice', 'AB'), ext('project', 45)];
    expect(gradeSheetRow(absent, grading)).toMatchObject({
      ok: true,
      row: { pct: 73, grade: 'Ab', gradePoint: 0 },
    });
    expect(gradeSheet([absent, CUTM1535, CUTM1014], grading)).toMatchObject({ credits: 12, sgpa: 4.42 });
  });

  it('leaves the SGPA out when the settings hide it', () => {
    expect(gradeSheet([DECT0901], { ...grading, showSgpa: false })).toMatchObject({ status: 'draft', sgpa: null });
  });

  it('guesses nothing: an unlocked course, a missing internal and a missing end-sem row are listed', () => {
    const sheet = gradeSheet(
      [
        { ...CUTM1535, locked: false },
        { ...CUTM1014, internals: { theory: null, project: 30 }, notes: { theory: 'attendance' } },
        { ...DECT0901, externals: null },
      ],
      grading,
    );
    expect(sheet).toEqual({
      status: 'incomplete',
      missing: [
        'CUTM1535: marks not locked yet',
        'CUTM1014: theory internal missing (attendance)',
        'DECT0901: no end-semester marks',
      ],
    });
  });

  it('keeps at most 20 reasons', () => {
    const courses = Array.from({ length: 25 }, (_, i) => ({ ...CUTM1535, courseCode: `C${i}`, externals: null }));
    const sheet = gradeSheet(courses, grading);
    expect(sheet.status === 'incomplete' && sheet.missing).toHaveLength(20);
    expect(sheet.status === 'incomplete' && sheet.missing.at(-1)).toBe('and 6 more');
  });
});

describe('sgpa', () => {
  it('is null without credits and skips a 0-0-0 course', () => {
    expect(sgpa([])).toBeNull();
    expect(sgpa([{ credits: c(0, 0, 0), gradePoint: 10 }])).toBeNull();
    expect(
      sgpa([
        { credits: c(3, 0, 1), gradePoint: 8 },
        { credits: c(0, 0, 0), gradePoint: 10 },
      ]),
    ).toBe(8);
  });
});
