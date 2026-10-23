import { roundHalfUp } from '@/lib/domain/round';
import type { SettingsValue } from '@/lib/schemas/settings';

// 07 §12 (PRJ-03, PRJ-04): a GitHub project's commit metrics per member and the suggested score. Merge commits are left
// out. The score is a suggestion shown while marking a review; faculty enter the marks.

const WEEK_MS = 7 * 86_400_000;

export type CommitInput = {
  studentId: string | null;
  committedAt: Date;
  message: string;
  additions: number;
  deletions: number;
  isMerge: boolean;
};

export type MemberMetrics = {
  studentId: string;
  commits: number;
  lines: number;
  hugeCommits: number;
  activeWeeks: number;
  regularity: number;
  lastMinuteShare: number;
  messageQuality: number;
  share: number;
  balance: number;
  volume: number;
  score: number;
  // Commits in each week from the start, oldest first.
  weekly: number[];
};

// A first line, trimmed and lower-cased, of at least 10 characters that is not a stock word.
export function goodMessage(message: string, stopWords: readonly string[]): boolean {
  const first = (message.split('\n')[0] ?? '').trim().toLowerCase();
  return first.length >= 10 && !stopWords.includes(first);
}

export function computeCommitMetrics(input: {
  commits: readonly CommitInput[];
  memberIds: readonly string[];
  startsOn: Date;
  dueOn: Date;
  now: Date;
  settings: SettingsValue<'projects'>;
}): { totalWeeks: number; members: MemberMetrics[]; unattributed: number; teamWeekly: number[] } {
  const { startsOn, dueOn, settings } = input;
  const end = Math.min(input.now.getTime(), dueOn.getTime());
  const totalWeeks = Math.max(1, Math.ceil((end - startsOn.getTime()) / WEEK_MS));
  const weekOf = (at: Date) => Math.floor((at.getTime() - startsOn.getTime()) / WEEK_MS);
  const commits = input.commits.filter((c) => !c.isMerge);
  const lastMinuteFrom = dueOn.getTime() - settings.lastMinuteHours * 3_600_000;
  const linesOf = (c: CommitInput) => c.additions + c.deletions;
  const teamLines = commits.reduce((sum, c) => sum + linesOf(c), 0);
  const weeks = (list: readonly CommitInput[]) => {
    const counts = Array.from({ length: totalWeeks }, () => 0);
    for (const c of list) {
      const w = weekOf(c.committedAt);
      if (w >= 0 && w < totalWeeks) counts[w] += 1;
    }
    return counts;
  };
  const members = input.memberIds.map((studentId) => {
    const mine = commits.filter((c) => c.studentId === studentId);
    const n = mine.length;
    const lines = mine.reduce((sum, c) => sum + linesOf(c), 0);
    const activeWeeks = new Set(mine.map((c) => weekOf(c.committedAt))).size;
    const lastMinute = mine.filter((c) => c.committedAt.getTime() >= lastMinuteFrom && c.committedAt <= dueOn).length;
    const regularity = activeWeeks / totalWeeks;
    const lastMinuteShare = n === 0 ? 0 : lastMinute / n;
    const messageQuality =
      n === 0 ? 0 : mine.filter((c) => goodMessage(c.message, settings.messageStopWords)).length / n;
    const share = teamLines === 0 ? 0 : lines / teamLines;
    const balance = Math.min(1, share * input.memberIds.length);
    const volume = Math.min(1, n / totalWeeks);
    const score =
      n === 0
        ? 0
        : roundHalfUp(
            100 *
              (0.35 * regularity + 0.2 * messageQuality + 0.15 * (1 - lastMinuteShare) + 0.2 * balance + 0.1 * volume),
            0,
          );
    return {
      studentId,
      commits: n,
      lines,
      hugeCommits: mine.filter((c) => linesOf(c) > settings.hugeCommitLines).length,
      activeWeeks,
      regularity,
      lastMinuteShare,
      messageQuality,
      share,
      balance,
      volume,
      score,
      weekly: weeks(mine),
    };
  });
  return {
    totalWeeks,
    members,
    unattributed: commits.filter((c) => c.studentId === null || !input.memberIds.includes(c.studentId)).length,
    teamWeekly: weeks(commits),
  };
}
