import { describe, expect, it } from 'vitest';
import {
  addedUp,
  attendancePoints,
  computeInternalMarks,
  coursePercentage,
  partMarks,
  reviewAverages,
} from './evaluation';
import { roundHalfUp } from './round';
import { SETTINGS } from '@/lib/schemas/settings';

const c = (theory: number, practice: number, project: number) => ({ theory, practice, project });

describe('coursePercentage', () => {
  it.each([
    // The policy's own example: DECT0901, 1-2-2, 87 / 89 / 92 → 449 / 5 = 89.8 → 90.
    [c(1, 2, 2), { theory: 87, practice: 89, project: 92 }, 90],
    [c(3, 0, 1), { theory: 72.5, project: 80 }, 75],
    [c(1.5, 0, 1.5), { theory: 60, project: 61 }, 61],
    [c(2, 0, 0), { theory: 90 }, 90],
    [c(3, 1, 0), { theory: 89.2, practice: 89.2 }, 90],
    [c(3, 0, 1), { theory: 80 }, null],
    [c(3, 0, 1), { theory: 80, project: null }, null],
    [c(0, 0, 0), {}, null],
  ])('credits %o, marks %o → %s', (credits, marks, expected) => {
    expect(coursePercentage(credits, marks)).toBe(expected);
  });
});

describe('attendancePoints', () => {
  const bands = [
    { minPct: 90, marks: 5 },
    { minPct: 85, marks: 4 },
    { minPct: 80, marks: 3 },
    { minPct: 75, marks: 2 },
  ];
  it.each([
    [100, 5],
    [90, 5],
    [89.99, 4],
    [85, 4],
    [84.99, 3],
    [80, 3],
    [79.99, 2],
    [75, 2],
    [74.99, 0],
    [0, 0],
  ])('%d %% → %d', (pct, marks) => {
    expect(attendancePoints(pct, bands)).toBe(marks);
  });
});

// 07 §2, internal marks (M06, Q-41): values are unrounded and shown at 2 dp.
const r = (counted: number, maxMarks: number) => ({ counted, maxMarks });
describe('partMarks', () => {
  it.each([
    [15, [r(34, 50)], 10.2],
    [15, [r(16, 20)], 12],
    [15, [r(7, 9)], 11.67],
    [5, [r(8, 10), r(30, 50)], 3.5],
    [5, [r(8, 10), r(30, 50), r(0, 10)], 2.33],
    [5, [r(10, 10), r(10, 10)], 5],
    [15, [r(0, 20)], 0],
  ])('out of %d, %o → %d', (max, results, marks) => {
    expect(roundHalfUp(partMarks(max, results) ?? Number.NaN, 2)).toBe(marks);
  });
  it('is null while nothing counts toward the part', () => {
    expect(partMarks(15, [])).toBeNull();
  });
});

describe('a rubric added up', () => {
  it.each([
    [[4, 8, 7.5, 9, 4, 8], 40.5],
    [[5, 10, 10, 10, 5, 10], 50],
    [[4, 8, null, 9, 4, 8], null],
  ])('%o → %s', (criteria, total) => {
    expect(addedUp(criteria)).toBe(total);
  });
});

describe('computeInternalMarks, the worked example', () => {
  const policy = SETTINGS.evaluation.schema.parse({});
  const example = computeInternalMarks({
    credits: { theory: 3, practice: 1, project: 0 },
    policy,
    counted: [
      { part: 'midTerm1', counted: 34, maxMarks: 50 },
      { part: 'midTerm2', counted: 16, maxMarks: 20 },
      { part: 'assignment', counted: 8, maxMarks: 10 },
      { part: 'assignment', counted: 30, maxMarks: 50 },
      { part: 'assignment', counted: 0, maxMarks: 10 },
    ],
    attendance: { attended: 17, held: 20 },
    rubrics: {
      practice: {
        practiceConcept: 4,
        practicePlanning: 8,
        practiceResult: 7.5,
        practiceRecord: 9,
        practiceConduct: 4,
        practiceViva: 8,
      },
    },
  });
  it('gives each theory part, theory 28.53 of 40, practice 40.5 of 50 and 76.7 %', () => {
    expect(example.parts.map((p) => [p.key, roundHalfUp(p.marks ?? Number.NaN, 2), p.max, p.count])).toEqual([
      ['midTerm1', 10.2, 15, 1],
      ['midTerm2', 12, 15, 1],
      ['assignment', 2.33, 5, 3],
      ['attendance', 4, 5, 20],
    ]);
    expect(example.attendancePct).toBe(85);
    expect(roundHalfUp(example.components.theory ?? Number.NaN, 2)).toBe(28.53);
    expect(example.components).toMatchObject({ practice: 40.5 });
    expect(example.components).not.toHaveProperty('project');
    expect(example).toMatchObject({ complete: true, internalPct: 76.7 });
  });
  it('is not complete while a part, a criterion or the classes are missing', () => {
    const missing = computeInternalMarks({
      credits: { theory: 1, practice: 0, project: 1 },
      policy,
      counted: [{ part: 'midTerm1', counted: 10, maxMarks: 20 }],
      attendance: { attended: 0, held: 0 },
      rubrics: { project: { projectRelevance: 4 } },
    });
    expect(missing.parts.map((p) => p.marks)).toEqual([7.5, null, null, null]);
    expect(missing).toMatchObject({
      attendancePct: null,
      components: { theory: null, project: null },
      complete: false,
      internalPct: null,
    });
  });
  it('lets the unrounded attendance decide the band', () => {
    // 449 of 500 is 89.8 %: band 85 → 4, never 5.
    const marks = computeInternalMarks({
      credits: { theory: 1, practice: 0, project: 0 },
      policy,
      counted: [],
      attendance: { attended: 449, held: 500 },
      rubrics: {},
    });
    expect(marks.parts.at(-1)).toMatchObject({ key: 'attendance', marks: 4 });
  });
});

// 07 §2, the project internal from the reviews (M07 decision 2).
const KEYS = [
  'projectRelevance',
  'projectLiterature',
  'projectMethodology',
  'projectAnalysis',
  'projectInterpretation',
  'projectReport',
];
const review = (...marks: (number | null)[]) =>
  Object.fromEntries(KEYS.flatMap((key, i) => (marks[i] === null ? [] : [[key, marks[i]]])));
describe('reviewAverages', () => {
  it.each([
    [[review(4, 4, 8, 8, 7, 8), review(5, 4, 9, 7, 8, 9)], [4.5, 4, 8.5, 7.5, 7.5, 8.5], 40.5],
    [[review(4, null, 8, 8, 7, 8), review(5, 3, 9, 7, 8, 9)], [4.5, 3, 8.5, 7.5, 7.5, 8.5], 39.5],
    [[review(4, null, 8, 8, 7, 8)], [4, undefined, 8, 8, 7, 8], null],
    [[], [undefined, undefined, undefined, undefined, undefined, undefined], null],
  ])('%o → %o, internal %s', (reviews, averages, internal) => {
    const result = reviewAverages(reviews);
    expect(KEYS.map((key) => result[key])).toEqual(averages);
    expect(addedUp(KEYS.map((key) => result[key]))).toBe(internal);
  });
});
