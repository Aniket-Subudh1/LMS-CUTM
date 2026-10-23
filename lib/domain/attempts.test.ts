import { describe, expect, it } from 'vitest';
import {
  canStart,
  countedScore,
  deadlineAt,
  isLate,
  planSectionMove,
  sectionDeadline,
  sectionOpen,
  windowState,
} from './attempts';

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

describe('extra time (TP-07)', () => {
  const at = (hhmm: string) => new Date(`2026-10-24T${hhmm}:00+05:30`);
  it('lengthens both the time limit and the end of hand-ins', () => {
    const window = { startedAt: at('10:00'), durationMin: 30, closesAt: at('10:20'), lateUntil: null };
    expect(deadlineAt(window)).toEqual(at('10:20'));
    expect(deadlineAt({ ...window, extraMin: 15 })).toEqual(at('10:35'));
    expect(deadlineAt({ ...window, closesAt: at('12:00'), extraMin: 15 })).toEqual(at('10:45'));
  });
});

describe('sections (TP-06)', () => {
  const t = (minutes: number) => new Date(Date.UTC(2026, 9, 24, 4, 30 + minutes));
  const end = t(60);
  const rules = [
    { id: 'apt', durationMin: 15, locked: true },
    { id: 'ds', durationMin: null, locked: false },
    { id: 'code', durationMin: null, locked: false },
  ];
  const visit = (sectionId: string, startedAt: Date, closedAt: Date | null = null) => ({
    sectionId,
    startedAt,
    closedAt,
  });

  it('closes a timed section at its own time, never after the attempt', () => {
    expect(sectionDeadline(rules[0], visit('apt', t(0)), end)).toEqual(t(15));
    expect(sectionDeadline(rules[0], visit('apt', t(50)), end)).toEqual(end);
    expect(sectionOpen(rules[0], visit('apt', t(0)), t(14), end)).toBe(true);
    expect(sectionOpen(rules[0], visit('apt', t(0)), t(15), end)).toBe(false);
    expect(sectionOpen(rules[1], undefined, t(1), end)).toBe(false);
  });

  it.each([
    ['opening the first section', [], null, 'apt', t(0), { ok: true, close: [] }],
    ['skipping past an unopened "no going back" section', [], null, 'ds', t(0), { ok: false, reason: 'gated' }],
    ['past it while it is open elsewhere', [visit('apt', t(0))], 'code', 'ds', t(1), { ok: false, reason: 'gated' }],
    ['leaving it closes it', [visit('apt', t(0))], 'apt', 'ds', t(5), { ok: true, close: ['apt'] }],
    [
      'back to it once closed',
      [visit('apt', t(0), t(5)), visit('ds', t(5))],
      'ds',
      'apt',
      t(6),
      { ok: false, reason: 'closed' },
    ],
    ['past it once its time ran out', [visit('apt', t(0))], 'apt', 'code', t(16), { ok: true, close: ['apt'] }],
    [
      'between open sections',
      [visit('apt', t(0), t(5)), visit('ds', t(5))],
      'ds',
      'code',
      t(6),
      { ok: true, close: [] },
    ],
    [
      'back to an open section',
      [visit('apt', t(0), t(5)), visit('ds', t(5)), visit('code', t(6))],
      'code',
      'ds',
      t(7),
      { ok: true, close: [] },
    ],
  ] as const)('%s', (_, visits, from, to, now, expected) => {
    expect(planSectionMove(rules, visits, from, to, now, end)).toEqual(expected);
  });
});
