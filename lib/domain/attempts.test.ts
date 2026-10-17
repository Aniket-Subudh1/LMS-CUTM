import { describe, expect, it } from 'vitest';
import { canStart, countedScore, deadlineAt, isLate, windowState } from './attempts';

const at = (time: string) => new Date(`2026-10-30T${time}:00+05:30`);

describe('deadlineAt (05 §5.2)', () => {
  it.each([
    ['60 min, closes 10:30, no late window', 60, '10:30', null, '10:30'],
    ['60 min, late until 11:30', 60, '10:30', '11:30', '11:00'],
    ['untimed, late until 11:30', null, '10:30', '11:30', '11:30'],
    ['untimed, no late window', null, '10:30', null, '10:30'],
    ['20 min, plenty of time', 20, '12:00', null, '10:20'],
  ])('start 10:00, %s → %s', (_, durationMin, closes, late, expected) => {
    expect(
      deadlineAt({ startedAt: at('10:00'), durationMin, closesAt: at(closes), lateUntil: late ? at(late) : null }),
    ).toEqual(at(expected));
  });
});

describe('windowState', () => {
  const window = { opensAt: at('10:00'), closesAt: at('11:00'), lateUntil: at('12:00') };
  it.each([
    ['09:59', 'upcoming'],
    ['10:00', 'open'],
    ['10:59', 'open'],
    ['11:00', 'late'],
    ['12:00', 'closed'],
  ])('%s → %s', (time, state) => {
    expect(windowState({ ...window, now: at(time) })).toBe(state);
  });
  it('closes at closesAt without a late window', () => {
    expect(windowState({ ...window, lateUntil: null, now: at('11:00') })).toBe('closed');
  });
});

describe('canStart', () => {
  const base = {
    opensAt: at('10:00'),
    closesAt: at('11:00'),
    lateUntil: null,
    attemptsUsed: 0,
    attemptsAllowed: 2,
    inProgress: false,
  };
  it.each([
    ['before it opens', { now: at('09:30') }, 'not_open'],
    ['while open', { now: at('10:30') }, 'start'],
    ['after it closes', { now: at('11:00') }, 'closed'],
    ['with every attempt used', { now: at('10:30'), attemptsUsed: 2 }, 'no_attempts_left'],
    ['with one running', { now: at('10:30'), inProgress: true, attemptsUsed: 2 }, 'resume'],
    ['in the late window', { now: at('11:30'), lateUntil: at('12:00') }, 'start'],
  ])('%s → %s', (_, over, expected) => {
    expect(canStart({ ...base, ...over })).toBe(expected);
  });
});

describe('isLate', () => {
  it.each([
    ['10:59', false],
    ['11:00', false],
    ['11:01', true],
  ])('handed in %s, closes 11:00 → %s', (time, late) => {
    expect(isLate(at(time), at('11:00'))).toBe(late);
  });
});

describe('countedScore (07 §14)', () => {
  const graded = (attemptNo: number, total: number) => ({ attemptNo, status: 'graded', total });
  const three = [graded(1, 6), graded(2, 8), graded(3, 7)];
  it.each([
    ['6/10, 8/10, 7/10 with best', three, 'best', 8],
    ['6/10, 8/10, 7/10 with last', three, 'last', 7],
    ['the last one not graded yet', [graded(1, 6), { attemptNo: 2, status: 'submitted', total: null }], 'last', 6],
    ['no graded attempt', [], 'best', 0],
  ] as const)('%s → %d', (_, attempts, policy, expected) => {
    expect(countedScore(attempts, policy)).toBe(expected);
  });
});
