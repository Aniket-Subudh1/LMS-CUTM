import { describe, expect, it } from 'vitest';
import { allocate, distinctPapers, drawQuestions, PAPERS_CAP, shortfall, type Candidate } from './papers';

const pool = (easy: number, medium: number, hard: number): Candidate[] => [
  ...Array.from({ length: easy }, (_, i) => ({ id: `e${i}`, difficulty: 'easy' as const })),
  ...Array.from({ length: medium }, (_, i) => ({ id: `m${i}`, difficulty: 'medium' as const })),
  ...Array.from({ length: hard }, (_, i) => ({ id: `h${i}`, difficulty: 'hard' as const })),
];
const none = { easy: 0, medium: 0, hard: 0 };
const recruitment = { easy: 30, medium: 45, hard: 25 };

describe('allocate (07 §14, TP-05)', () => {
  it.each([
    [15, recruitment, { easy: 4, medium: 7, hard: 4 }],
    [10, recruitment, { easy: 3, medium: 5, hard: 2 }],
    [3, { easy: 34, medium: 33, hard: 33 }, { easy: 1, medium: 1, hard: 1 }],
    [1, { easy: 50, medium: 50, hard: 0 }, { easy: 1, medium: 0, hard: 0 }],
    [20, { easy: 0, medium: 100, hard: 0 }, { easy: 0, medium: 20, hard: 0 }],
  ])('%d at %o → %o', (count, mix, expected) => {
    expect(allocate(count, mix)).toEqual(expected);
  });
  it('is null without a mix (any level will do)', () => {
    expect(allocate(5, none)).toBeNull();
  });
});

describe('drawQuestions', () => {
  const rule = { count: 15, mix: recruitment };
  it('draws the mix, the same for the same seed and different for another', () => {
    const bank = pool(20, 20, 20);
    const first = drawQuestions(bank, rule, 'attempt-1');
    expect(first.filter((c) => c.difficulty === 'easy')).toHaveLength(4);
    expect(first.filter((c) => c.difficulty === 'medium')).toHaveLength(7);
    expect(first.filter((c) => c.difficulty === 'hard')).toHaveLength(4);
    expect(new Set(first.map((c) => c.id)).size).toBe(15);
    expect(drawQuestions(bank, rule, 'attempt-1')).toEqual(first);
    expect(drawQuestions(bank, rule, 'attempt-2')).not.toEqual(first);
  });
  it('without a mix takes any level', () => {
    expect(drawQuestions(pool(1, 1, 1), { count: 2, mix: none }, 's')).toHaveLength(2);
  });
});

describe('shortfall', () => {
  it('names each level the bank is short of', () => {
    expect(shortfall(pool(5, 2, 9), { count: 15, mix: recruitment })).toEqual([{ level: 'medium', missing: 5 }]);
    expect(shortfall(pool(1, 0, 0), { count: 3, mix: none })).toEqual([{ level: 'any', missing: 2 }]);
    expect(shortfall(pool(9, 9, 9), { count: 15, mix: recruitment })).toEqual([]);
  });
});

describe('distinctPapers', () => {
  it('multiplies the choices of every level of every section, capped', () => {
    expect(distinctPapers([{ pool: pool(4, 0, 0), rule: { count: 2, mix: { easy: 100, medium: 0, hard: 0 } } }])).toBe(
      6,
    );
    expect(
      distinctPapers([
        { pool: pool(4, 3, 0), rule: { count: 2, mix: { easy: 50, medium: 50, hard: 0 } } },
        { pool: pool(0, 0, 5), rule: { count: 5, mix: none } },
      ]),
    ).toBe(12);
    expect(distinctPapers([{ pool: pool(2, 0, 0), rule: { count: 3, mix: none } }])).toBe(0);
    expect(distinctPapers([{ pool: pool(200, 0, 0), rule: { count: 15, mix: none } }])).toBe(PAPERS_CAP);
  });
});
