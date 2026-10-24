import { describe, expect, it } from 'vitest';
import {
  ATTAINMENT_EXAMPLE,
  computeOfferingAttainment,
  computeProgramAttainment,
  externalPct,
  level,
  missedItems,
} from '@/lib/domain/attainment';
import { SETTINGS } from '@/lib/schemas/settings';

const settings = SETTINGS.attainment.schema.parse({});
const valueOf = (r: ReturnType<typeof computeOfferingAttainment>, code: string) =>
  r.outcomes.find((o) => o.code === code)?.value;

describe('level', () => {
  it.each([
    [70, 3],
    [69.99, 2],
    [60, 2],
    [50, 1],
    [49.99, 0],
  ])('%s %% is level %s', (pct, expected) => {
    expect(level(pct, settings)).toBe(expected);
  });
});

describe('externalPct (07 §4, M09 decision 1)', () => {
  const ext = (component: 'theory' | 'practice' | 'project', marks: number | null, max: number) => ({
    component,
    marks,
    max,
    absent: marks === null,
  });
  it('weights each external % by its credits', () => {
    expect(externalPct({ theory: 3, practice: 0, project: 0 }, [ext('theory', 40, 60)])).toBeCloseTo(66.6667, 4);
    expect(
      externalPct({ theory: 1, practice: 2, project: 2 }, [
        ext('theory', 30, 60),
        ext('practice', 40, 50),
        ext('project', 35, 50),
      ]),
    ).toBeCloseTo(70, 9);
    expect(
      externalPct({ theory: 3, practice: 1, project: 0 }, [ext('theory', 33, 60), ext('practice', 32, 50)]),
    ).toBeCloseTo(57.25, 9);
  });
  it('is absent when any part is AB, and null when a part the course has is missing', () => {
    expect(
      externalPct({ theory: 1, practice: 2, project: 2 }, [
        ext('theory', 50, 60),
        ext('practice', null, 50),
        ext('project', 45, 50),
      ]),
    ).toBe('absent');
    expect(externalPct({ theory: 3, practice: 1, project: 0 }, [ext('theory', 33, 60)])).toBeNull();
  });
});

describe('missedItems (A-179)', () => {
  it('counts the fixed questions and each filtered draw at 0; an unfiltered draw adds nothing', () => {
    expect(
      missedItems({
        items: [{ coIds: ['co1'], maxMarks: 5 }],
        draws: [
          { coIds: ['co1', 'co2'], count: 2, marksEach: 2 },
          { coIds: [], count: 3, marksEach: 1 },
        ],
      }),
    ).toEqual([
      { coIds: ['co1'], maxMarks: 5, marks: 0 },
      { coIds: ['co1', 'co2'], maxMarks: 4, marks: 0 },
    ]);
  });
});

const { cos: COS, cells: CELLS, students: STUDENTS } = ATTAINMENT_EXAMPLE;

describe('computeOfferingAttainment (07 §4)', () => {
  it('works out the documented example (AC-M09-01)', () => {
    const r = computeOfferingAttainment({
      cos: COS,
      cells: CELLS,
      students: STUDENTS,
      settings,
    });
    expect(r.cos.map((co) => [co.code, co.cie, co.value, co.met])).toEqual([
      ['CO1', { assessed: 10, attained: 8, pct: 80, level: 3 }, 2.5, true],
      ['CO2', { assessed: 10, attained: 6, pct: 60, level: 2 }, 2, true],
      ['CO3', { assessed: 10, attained: 6, pct: 60, level: 2 }, 2, true],
    ]);
    expect(r.see).toEqual({ considered: 10, attained: 6, pct: 60, level: 2, withoutMarks: 0 });
    expect(Object.fromEntries(r.outcomes.map((o) => [o.code, o.value]))).toEqual({
      PO1: 2.21,
      PO2: 2.08,
      PO3: 2,
      PO4: null,
      PO5: null,
      PO6: null,
      PO7: null,
      PO8: null,
      PO9: null,
      PO10: null,
      PO11: null,
      PO12: null,
      PSO1: 2,
      PSO2: null,
      PSO3: 2.25,
    });
    expect(r.warnings).toEqual([]);
  });

  it('without end-semester rows, each value is the CIE level and says so', () => {
    const r = computeOfferingAttainment({
      cos: COS,
      cells: CELLS,
      students: STUDENTS.map((st) => ({ ...st, see: null })),
      settings,
    });
    expect(r.cos.map((co) => co.value)).toEqual([3, 2, 2]);
    expect(r.see).toBeNull();
    expect(r.warnings).toEqual(['No end-semester marks yet: each value is the internal assessments alone (CIE only).']);
  });

  it('a student exactly at the target attains (s3 on CO1, s6 at 30/50); 29/50 does not (s7)', () => {
    const one = (i: number) => computeOfferingAttainment({ cos: COS, cells: [], students: [STUDENTS[i]], settings });
    expect(one(2).cos[0].cie?.attained).toBe(1);
    expect(one(5).see?.attained).toBe(1);
    expect(one(6).see?.attained).toBe(0);
  });

  it('weights CIE 0.4 and SEE 0.6: CO1 2.4 (AC-M09-05)', () => {
    const r = computeOfferingAttainment({
      cos: COS,
      cells: CELLS,
      students: STUDENTS,
      settings: { ...settings, cieWeight: 0.4, seeWeight: 0.6 },
    });
    expect(r.cos.map((co) => co.value)).toEqual([2.4, 2, 2]);
  });

  it('a CO no question carried is null with a warning, never 0 (AC-M09-03)', () => {
    const r = computeOfferingAttainment({
      cos: [...COS, { id: 'co4', code: 'CO4', statement: 'Use files' }],
      cells: [...CELLS, { coId: 'co4', outcome: 'PO4', level: 3 }],
      students: STUDENTS,
      settings,
    });
    expect(r.cos[3]).toMatchObject({ code: 'CO4', cie: null, value: null, met: null });
    expect(valueOf(r, 'PO4')).toBeNull();
    expect(r.warnings).toEqual(['CO4 was not assessed in any published assessment.']);
  });

  it('judges each student on their own drawn paper, and a missed draw at 0 (07 §4 drawn papers)', () => {
    const r = computeOfferingAttainment({
      cos: [...COS, { id: 'co4', code: 'CO4', statement: 'Use files' }],
      cells: [],
      students: [
        {
          items: [
            { coIds: ['co1'], maxMarks: 2, marks: 2 },
            { coIds: ['co2'], maxMarks: 2, marks: 0 },
          ],
          see: null,
        },
        {
          items: [
            { coIds: ['co2'], maxMarks: 2, marks: 2 },
            { coIds: ['co2', 'co3'], maxMarks: 2, marks: 1 },
          ],
          see: null,
        },
        { items: missedItems({ items: [], draws: [{ coIds: ['co1', 'co2'], count: 2, marksEach: 2 }] }), see: null },
      ],
      settings,
    });
    expect(r.cos.map((co) => [co.code, co.cie, co.value])).toEqual([
      ['CO1', { assessed: 2, attained: 1, pct: 50, level: 1 }, 1],
      ['CO2', { assessed: 3, attained: 1, pct: 33.33, level: 0 }, 0],
      ['CO3', { assessed: 1, attained: 0, pct: 0, level: 0 }, 0],
      ['CO4', null, null],
    ]);
    expect(r.warnings).toContain('CO4 was not assessed in any published assessment.');
  });
});

describe('computeProgramAttainment (07 §5)', () => {
  const record = (courseId: string, po1: number | null) => ({
    courseId,
    outcomes: [{ code: 'PO1' as const, value: po1 }],
  });
  it('averages the courses, leaving out a course with no value', () => {
    const r = computeProgramAttainment([record('a', 2.21), record('b', 1.79), record('c', null)]);
    expect(r.outcomes.find((o) => o.code === 'PO1')?.value).toBe(2);
    expect(r.outcomes.find((o) => o.code === 'PO2')?.value).toBeNull();
  });
  it('counts a course taught in sections once, as their mean, and rounds once (A-182)', () => {
    const r = computeProgramAttainment([record('a', 2.5), record('a', 2), record('b', 1.5)]);
    expect(r.courses.find((c) => c.courseId === 'a')?.outcomes[0]).toEqual({ code: 'PO1', value: 2.25 });
    expect(r.outcomes.find((o) => o.code === 'PO1')?.value).toBe(1.88);
  });
});
