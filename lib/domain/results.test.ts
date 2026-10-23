import { describe, expect, it } from 'vitest';
import {
  bandOf,
  breakdown,
  difficultyLabel,
  discriminationLabel,
  histogram,
  itemStats,
  rankAll,
  type ItemRow,
} from './results';

describe('rankAll (07 §19)', () => {
  it('shares a rank between equal totals and gives a percentile of those below plus half of those level', () => {
    const ranks = rankAll([
      { id: 'a', total: 70 },
      { id: 'b', total: 74 },
      { id: 'c', total: 70 },
      { id: 'd', total: 40 },
    ]);
    expect(Object.fromEntries(ranks)).toEqual({
      b: { rank: 1, percentile: 88 },
      a: { rank: 2, percentile: 50 },
      c: { rank: 2, percentile: 50 },
      d: { rank: 4, percentile: 13 },
    });
  });
  it('puts the 7th of 160 at the 96th percentile', () => {
    const totals = Array.from({ length: 160 }, (_, i) => ({ id: String(i), total: 160 - i }));
    expect(rankAll(totals).get('6')).toEqual({ rank: 7, percentile: 96 });
  });
  it('ranks a lone taker 1st at the 50th percentile', () => {
    expect(rankAll([{ id: 'a', total: 3 }]).get('a')).toEqual({ rank: 1, percentile: 50 });
  });
});

describe('bandOf (07 §19)', () => {
  const bands = [
    { label: 'Waitlist', minPct: 60 },
    { label: 'Recommended', minPct: 75 },
  ];
  it.each([
    [78, 'Recommended'],
    [75, 'Recommended'],
    [74.9, 'Waitlist'],
    [59, null],
  ])('%d %% → %s', (pct, band) => {
    expect(bandOf(pct, bands)).toBe(band);
  });
  it('has no band without bands', () => {
    expect(bandOf(90, [])).toBeNull();
  });
});

describe('histogram (07 §19)', () => {
  it('counts ten bins of 10 points, 100 % in the last', () => {
    expect(histogram([0, 9.9, 10, 55, 99, 100])).toEqual([2, 1, 0, 0, 0, 1, 0, 0, 0, 2]);
  });
});

describe('itemStats (07 §19)', () => {
  // Ten takers by percentage; q1 is right for the top seven, q2 for the bottom three only, q3 for nobody.
  const rows: ItemRow[] = Array.from({ length: 10 }, (_, i) => ({
    pct: 100 - i * 10,
    items: {
      q1: { earned: i < 7 ? 1 : 0, picked: i < 7 ? 'r1' : 'w1' },
      q2: { earned: i >= 7 ? 1 : 0, picked: i >= 7 ? 'r2' : i % 2 ? 'w2' : 'w3' },
      q3: { earned: 0.5, picked: null },
    },
  }));
  const stats = itemStats(rows, (key) => ({ q1: 'r1', q2: 'r2' })[key] ?? null);

  it('gives the share right and the 27 % upper-minus-lower discrimination', () => {
    expect(stats.get('q1')).toEqual({
      n: 10,
      correctPct: 70,
      discrimination: 1,
      wrongPick: { optionId: 'w1', pct: 30 },
    });
    expect(stats.get('q2')).toMatchObject({ correctPct: 30, discrimination: -1 });
  });
  it('picks the wrong option chosen most', () => {
    expect(stats.get('q2')?.wrongPick).toEqual({ optionId: 'w3', pct: 40 });
  });
  it('counts only full marks as right', () => {
    expect(stats.get('q3')).toMatchObject({ correctPct: 0, wrongPick: null });
  });
  it('leaves discrimination out with fewer than 10 takers', () => {
    expect(itemStats(rows.slice(0, 9), () => null).get('q1')?.discrimination).toBeNull();
  });
});

describe('labels (07 §19)', () => {
  it.each([
    [18, 'very hard'],
    [35, 'hard'],
    [60, null],
    [85, 'easy'],
    [94, 'very easy'],
  ])('%d %% right → %s', (pct, label) => {
    expect(difficultyLabel(pct)).toBe(label);
  });
  it.each([
    [0.04, 'weak'],
    [0.2, null],
    [0.48, 'strong'],
    [null, null],
  ])('discrimination %s → %s', (d, label) => {
    expect(discriminationLabel(d)).toBe(label);
  });
});

describe('breakdown (07 §19)', () => {
  it('adds marks per group, a question with two outcomes counting to each, and negatives as 0', () => {
    const result = breakdown([
      { groups: ['CO1'], maxMarks: 2, marks: 2 },
      { groups: ['CO1', 'CO2'], maxMarks: 4, marks: 1.5 },
      { groups: ['CO2'], maxMarks: 1, marks: -0.25 },
      { groups: ['CO2'], maxMarks: 3, marks: null },
    ]);
    expect(Object.fromEntries(result)).toEqual({
      CO1: { marks: 3.5, maxMarks: 6 },
      CO2: { marks: 1.5, maxMarks: 8 },
    });
  });
});
