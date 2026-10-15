import { describe, expect, it } from 'vitest';
import { attendancePoints, coursePercentage } from './evaluation';

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
