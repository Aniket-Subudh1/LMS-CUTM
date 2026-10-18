import { describe, expect, it } from 'vitest';
import { attemptTotal, autoGrade, normalizeBlank, quizAveragePct, rubricTotal } from './grading';

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

describe('autoGrade, the M04b types (07 §14, TP-06)', () => {
  const tf = { type: 'true_false' as const, maxMarks: 1, answer: { truth: true } };
  const blanks = {
    type: 'fill_blank' as const,
    maxMarks: 2,
    answer: null,
    blanks: [{ accepted: ['recursive', 'recursion'] }, { accepted: ['base'] }],
  };
  const pairs = {
    type: 'matching' as const,
    maxMarks: 4,
    answer: null,
    pairs: ['p', 'q', 'r', 's'].map((id) => ({ id, rightId: `${id}'` })),
  };
  const order = { type: 'ordering' as const, maxMarks: 4, answer: { optionIds: ['a', 'b', 'c', 'd'] } };
  const matched = (rights: string[]) => ({
    matches: ['p', 'q', 'r', 's'].map((left, i) => ({ left, right: `${rights[i]}'` })),
  });
  it.each([
    ['true or false, right', tf, { truth: true }, 1],
    ['true or false, wrong', tf, { truth: false }, 0],
    ['true or false, unanswered', tf, { truth: null }, 0],
    ['blanks, both right ignoring case and spaces', blanks, { texts: ['  Recursion ', 'BASE'] }, 2],
    ['blanks, one right', blanks, { texts: ['recursive', 'stop'] }, 0],
    ['blanks, one right, partial credit', { ...blanks, partialCredit: true }, { texts: ['recursive', ''] }, 1],
    ['matching, all four', pairs, matched(['p', 'q', 'r', 's']), 4],
    ['matching, two swapped', pairs, matched(['q', 'p', 'r', 's']), 0],
    ['matching, two swapped, partial credit', { ...pairs, partialCredit: true }, matched(['q', 'p', 'r', 's']), 2],
    ['ordering, right', order, { optionIds: ['a', 'b', 'c', 'd'] }, 4],
    [
      'ordering, last two swapped, partial credit',
      { ...order, partialCredit: true },
      { optionIds: ['a', 'b', 'd', 'c'] },
      2,
    ],
    ['ordering, untouched', order, { optionIds: [] }, 0],
    ['msq {a,b} of {a,b,c}, partial credit', { ...msq, partialCredit: true }, { optionIds: ['a', 'b'] }, 2.67],
    ['msq {a,b,d} of {a,b,c}, partial credit', { ...msq, partialCredit: true }, { optionIds: ['a', 'b', 'd'] }, 1.33],
    ['msq {a,d} of {a,b,c}, partial credit', { ...msq, partialCredit: true }, { optionIds: ['a', 'd'] }, 0],
  ])('%s → %d', (_, item, given, expected) => {
    expect(autoGrade(item, given)).toBe(expected);
  });

  it.each([
    ['mcq wrong', { ...mcq, negativeMarks: 0.5 }, { optionId: 'a' }, -0.5],
    ['mcq unanswered', { ...mcq, negativeMarks: 0.5 }, { optionId: null }, 0],
    ['mcq right', { ...mcq, negativeMarks: 0.5 }, { optionId: 'b' }, 2],
    ['msq wrong, partial credit earned', { ...msq, negativeMarks: 1, partialCredit: true }, { optionIds: ['a'] }, 1.33],
    ['msq wrong, nothing earned', { ...msq, negativeMarks: 1, partialCredit: true }, { optionIds: ['d'] }, -1],
    ['numeric wrong', { ...numeric(4, 0), negativeMarks: 1 }, { value: 5 }, -1],
  ])('negative marks: %s → %d', (_, item, given, expected) => {
    expect(autoGrade(item, given)).toBe(expected);
  });
});

describe('normalizeBlank', () => {
  it('ignores case, the spaces around and repeated spaces inside', () => {
    expect(normalizeBlank('  Base   Case ')).toBe('base case');
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
  it('never goes below 0 however many negative marks (A-M04b-9)', () => {
    expect(attemptTotal(['a', 'b'], { a: { marks: -0.5 }, b: { marks: -0.5 } })).toBe(0);
    expect(attemptTotal(['a', 'b'], { a: { marks: 2 }, b: { marks: -0.5 } })).toBe(1.5);
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
