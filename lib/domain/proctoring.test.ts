import { describe, expect, it } from 'vitest';
import type { ProctorEvent } from '@/lib/schemas/assessment';
import { connectionGap, proctorPenalty, recordEvent, sessionCheck, withPenalty } from './proctoring';

const t = (seconds: number) => new Date(Date.UTC(2026, 9, 30, 4, 30, seconds));

describe('recordEvent (07 §15)', () => {
  it.each<[string, number, number, number | null, ProctorEvent, number, number, boolean, boolean]>([
    // limit, hard so far, last counted (s before), event → hard, soft, counted, handed in
    ['the second of three continues', 3, 1, 60, 'left_page', 2, 0, true, false],
    ['the third of three hands in', 3, 2, 60, 'fullscreen_exit', 3, 0, true, true],
    ['within 3 s of the last counts once', 3, 2, 2, 'left_page', 2, 0, false, false],
    ['exactly 3 s after counts', 3, 2, 3, 'left_page', 3, 0, true, true],
    ['a minor one is only recorded', 3, 2, 60, 'paste', 2, 1, false, false],
    ['limit 0 only records', 0, 10, 60, 'left_page', 11, 0, true, false],
    ['limit 1 hands in at the first', 1, 0, null, 'second_device', 1, 0, true, true],
  ])('%s', (_, limit, hard, ago, type, nextHard, nextSoft, counted, end) => {
    const result = recordEvent({ hard, soft: 0, lastHardAt: ago === null ? null : t(60 - ago) }, type, t(60), limit);
    expect(result.tally.hard).toBe(nextHard);
    expect(result.tally.soft).toBe(nextSoft);
    expect(result.counted).toBe(counted);
    expect(result.end).toBe(end);
  });

  it('a merged warning keeps the time of the one it merged with', () => {
    const first = recordEvent({ hard: 0, soft: 0, lastHardAt: null }, 'fullscreen_exit', t(10), 3);
    const merged = recordEvent(first.tally, 'left_page', t(12), 3);
    expect(merged.tally.lastHardAt).toEqual(t(10));
    expect(recordEvent(merged.tally, 'left_page', t(14), 3).counted).toBe(true);
  });
});

describe('proctorPenalty and withPenalty (07 §15)', () => {
  it.each([
    [2, 1.5, false, 3],
    [2, 1.5, true, 0],
    [0, 5, false, 0],
    [3, 0.33, false, 0.99],
  ])('%d warnings × %d, waived %s → %d', (hard, each, waived, expected) => {
    expect(proctorPenalty(hard, each, waived)).toBe(expected);
  });
  it.each([
    [8, 3, 5],
    [2, 3, 0],
    [7.25, 0.5, 6.75],
    [null, 3, null],
  ])('total %s less %d → %s', (total, penalty, expected) => {
    expect(withPenalty(total, penalty)).toBe(expected);
  });
});

describe('sessionCheck (07 §15)', () => {
  it.each([
    ['nobody holds it', null, null, 'take'],
    ['the same tab', 'a', 50, 'same'],
    ['another tab heard 30 s ago', 'b', 30, 'clash'],
    ['another tab quiet for 45 s', 'b', 45, 'take'],
  ])('%s → %s', (_, held, ago, expected) => {
    expect(sessionCheck({ sessionId: held, lastBeatAt: ago === null ? null : t(60 - ago) }, 'a', t(60))).toBe(
      expected,
    );
  });
});

describe('connectionGap (07 §15)', () => {
  it.each([
    [null, null],
    [45, null],
    [60, null],
    [61, 61],
  ])('last beat %s s ago → %s', (ago, expected) => {
    expect(connectionGap(ago === null ? null : t(100 - ago), t(100))).toBe(expected);
  });
});
