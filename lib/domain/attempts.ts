import type { AttemptPolicy } from '@/lib/schemas/assessment';

type Window = { opensAt: Date; closesAt: Date; lateUntil: Date | null };
export type WindowState = 'upcoming' | 'open' | 'late' | 'closed';

// Whether an assessment is open is derived, never stored (05 §5.1). `late` is the window after closesAt while
// lateUntil allows hand-ins (ASG-04).
export function windowState({ now, opensAt, closesAt, lateUntil }: Window & { now: Date }): WindowState {
  if (now < opensAt) return 'upcoming';
  if (now < closesAt) return 'open';
  if (lateUntil && now < lateUntil) return 'late';
  return 'closed';
}

// 05 §5.2: the attempt ends at the time limit or when hand-ins end, whichever comes first.
export function deadlineAt({
  startedAt,
  durationMin,
  closesAt,
  lateUntil,
}: {
  startedAt: Date;
  durationMin: number | null;
  closesAt: Date;
  lateUntil: Date | null;
}): Date {
  const end = (lateUntil ?? closesAt).getTime();
  return new Date(durationMin === null ? end : Math.min(startedAt.getTime() + durationMin * 60_000, end));
}

export type StartCheck = 'start' | 'resume' | 'not_open' | 'closed' | 'no_attempts_left';

// The caller hands in an expired attempt first, so `inProgress` means one that is still running.
export function canStart(
  input: Window & { now: Date; attemptsUsed: number; attemptsAllowed: number; inProgress: boolean },
): StartCheck {
  if (input.inProgress) return 'resume';
  const state = windowState(input);
  if (state === 'upcoming') return 'not_open';
  if (state === 'closed') return 'closed';
  return input.attemptsUsed >= input.attemptsAllowed ? 'no_attempts_left' : 'start';
}

export function isLate(submittedAt: Date, closesAt: Date): boolean {
  return submittedAt > closesAt;
}

// 07 §14: only graded attempts count; best or last of them; none graded → 0 (a missed assessment counts as zero).
export function countedScore(
  attempts: readonly { attemptNo: number; status: string; total?: number | null }[],
  policy: AttemptPolicy,
): number {
  const graded = attempts.filter(
    (a): a is { attemptNo: number; status: string; total: number } =>
      a.status === 'graded' && typeof a.total === 'number',
  );
  if (graded.length === 0) return 0;
  if (policy === 'best') return Math.max(...graded.map((a) => a.total));
  return graded.reduce((latest, a) => (a.attemptNo > latest.attemptNo ? a : latest)).total;
}
