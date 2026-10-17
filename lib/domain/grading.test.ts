import { describe, expect, it } from 'vitest';
import { attemptTotal, autoGrade, quizAveragePct, rubricTotal } from './grading';

const mcq = { type: 'mcq' as const, maxMarks: 2, answer: { optionId: 'b' } };
const msq = { type: 'msq' as const, maxMarks: 4, answer: { optionIds: ['a', 'b', 'c'] } };
const numeric = (value: number, tolerance: number) => ({
  type: 'numeric' as const,
  maxMarks: 3,
  answer: { value, tolerance },
});

describe('autoGrade (07 §14)', () => {
  it.each([
    ['mcq, the key', mcq, { optionId: 'b' }, 2],
    ['mcq, another option', mcq, { optionId: 'a' }, 0],
    ['mcq, unanswered', mcq, null, 0],
    ['msq, the exact set', msq, { optionIds: ['c', 'a', 'b'] }, 4],
    ['msq, {a,b} of {a,b,c}', msq, { optionIds: ['a', 'b'] }, 0],
    ['msq, a superset', msq, { optionIds: ['a', 'b', 'c', 'd'] }, 0],
    ['numeric 3.14 vs 3.1416 ± 0.01', numeric(3.1416, 0.01), { value: 3.14 }, 3],
    ['numeric 3.2 vs 3.1416 ± 0.01', numeric(3.1416, 0.01), { value: 3.2 }, 0],
    ['numeric 1.01 vs 1 ± 0.01 (binary noise)', numeric(1, 0.01), { value: 1.01 }, 3],
    ['numeric exact, no margin', numeric(4, 0), { value: 4 }, 3],
    ['numeric unanswered', numeric(4, 0), { value: null }, 0],
  ])('%s → %d', (_, item, given, expected) => {
    expect(autoGrade(item, given)).toBe(expected);
  });

  it.each(['text', 'file'] as const)('%s is marked by a person', (type) => {
    expect(autoGrade({ type, maxMarks: 5, answer: null }, null)).toBeNull();
  });
});

describe('rubricTotal (07 §14)', () => {
  it.each([
    [[2, 2, 2], 6],
    [[0.1, 0.2], 0.3],
    [[], 0],
  ])('%o → %d', (marks, expected) => {
    expect(rubricTotal(marks)).toBe(expected);
  });
});

describe('attemptTotal (07 §14)', () => {
  it('adds every question, at 2 decimals', () => {
    expect(attemptTotal(['a', 'b'], { a: { marks: 1.005 }, b: { marks: 2 } })).toBe(3.01);
  });
  it('is null while a question is unscored', () => {
    expect(attemptTotal(['a', 'b'], { a: { marks: 2 } })).toBeNull();
  });
});

describe('quizAveragePct (07 §14)', () => {
  it.each([
    [
      [
        { counted: 8, maxMarks: 10 },
        { counted: 15, maxMarks: 20 },
      ],
      77.5,
    ],
    [
      [
        { counted: 8, maxMarks: 10 },
        { counted: 0, maxMarks: 10 },
      ],
      40,
    ],
    [[{ counted: 1, maxMarks: 3 }], 33.33],
    [[], null],
  ])('%o → %s', (quizzes, expected) => {
    expect(quizAveragePct(quizzes)).toBe(expected);
  });
});
