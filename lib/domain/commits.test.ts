import { describe, expect, it } from 'vitest';
import { computeCommitMetrics, goodMessage, type CommitInput } from './commits';

const DAY = 86_400_000;
const startsOn = new Date('2026-08-01T00:00:00Z');
const dueOn = new Date(startsOn.getTime() + 56 * DAY); // 8 weeks
const now = new Date(dueOn.getTime() + DAY);
const settings = {
  lastMinuteHours: 48,
  hugeCommitLines: 1000,
  messageStopWords: ['update', 'fix', 'changes', 'commit', 'wip', 'test', 'minor', 'asdf', '.'],
};
const commit = (
  studentId: string | null,
  week: number,
  message: string,
  lines: number,
  over: Partial<CommitInput> = {},
) => ({
  studentId,
  committedAt: new Date(startsOn.getTime() + week * 7 * DAY + DAY),
  message,
  additions: lines,
  deletions: 0,
  isMerge: false,
  ...over,
});
const lastMinute = (studentId: string, message: string, lines: number) =>
  commit(studentId, 0, message, lines, { committedAt: new Date(dueOn.getTime() - 3_600_000) });
const GOOD = 'Add login form validation';

// 07 §12's two members: totalWeeks 8, a team of 2, 800 team lines.
const A = [
  ...[0, 1, 2, 3, 4, 5].map((w) => commit('A', w, GOOD, 60)),
  commit('A', 1, GOOD, 60),
  commit('A', 2, 'update', 60),
  lastMinute('A', GOOD, 60),
  lastMinute('A', 'update', 60),
];
const B = [commit('B', 2, GOOD, 100), lastMinute('B', 'wip', 50), lastMinute('B', 'fix', 50)];

describe('computeCommitMetrics (07 §12)', () => {
  const result = computeCommitMetrics({
    commits: [...A, ...B, commit('A', 3, 'Merge branch main', 5000, { isMerge: true }), commit(null, 4, GOOD, 10)],
    memberIds: ['A', 'B'],
    startsOn,
    dueOn,
    now,
    settings,
  });
  const [a, b] = result.members;
  it.each([
    [
      'A',
      a,
      {
        commits: 10,
        activeWeeks: 7,
        regularity: 0.875,
        lastMinuteShare: 0.2,
        messageQuality: 0.8,
        share: 600 / 810,
        score: 89,
      },
    ],
    ['B', b, { commits: 3, activeWeeks: 2, regularity: 0.25, score: 34 }],
  ])('member %s', (_, member, expected) => {
    expect(member).toMatchObject(expected);
  });
  it('works over 8 weeks, leaves merges out and counts the unattributed commit', () => {
    expect(result.totalWeeks).toBe(8);
    expect(result.unattributed).toBe(1);
    expect(a.weekly).toEqual([1, 2, 2, 1, 1, 1, 0, 2]);
  });
  it('scores a member with no commits 0', () => {
    expect(
      computeCommitMetrics({ commits: [], memberIds: ['C'], startsOn, dueOn, now, settings }).members[0].score,
    ).toBe(0);
  });
});

describe('a good commit message', () => {
  it.each([
    ['update', false],
    ['fixed bug', false],
    ['Add login form validation', true],
    ['updated readme file', true],
  ])('%s → %s', (message, good) => {
    expect(goodMessage(message, settings.messageStopWords)).toBe(good);
  });
});
