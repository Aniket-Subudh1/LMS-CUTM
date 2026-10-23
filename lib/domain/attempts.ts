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

// 05 §5.2: the attempt ends at the time limit or when hand-ins end, whichever comes first. Extra time for one person
// (M04b, TP-07) lengthens both.
export function deadlineAt({
  startedAt,
  durationMin,
  closesAt,
  lateUntil,
  extraMin = 0,
}: {
  startedAt: Date;
  durationMin: number | null;
  closesAt: Date;
  lateUntil: Date | null;
  extraMin?: number;
}): Date {
  const extra = extraMin * 60_000;
  const end = (lateUntil ?? closesAt).getTime() + extra;
  return new Date(durationMin === null ? end : Math.min(startedAt.getTime() + durationMin * 60_000 + extra, end));
}

// --- Sections (M04b, TP-06) ---

export type SectionRule = { id: string; durationMin: number | null; locked: boolean };
export type SectionVisit = { sectionId: string; startedAt: Date; closedAt: Date | null };

// A section with its own time limit closes that long after it was first opened, and never after the attempt does.
export function sectionDeadline(rule: SectionRule, visit: SectionVisit, attemptDeadline: Date): Date {
  if (rule.durationMin === null) return attemptDeadline;
  return new Date(Math.min(visit.startedAt.getTime() + rule.durationMin * 60_000, attemptDeadline.getTime()));
}

// Whether a section's answers can still change: it was opened, was not left for good, and its time is not up.
export function sectionOpen(
  rule: SectionRule,
  visit: SectionVisit | undefined,
  now: Date,
  attemptDeadline: Date,
): boolean {
  return Boolean(visit && !visit.closedAt && now < sectionDeadline(rule, visit, attemptDeadline));
}

export type SectionMove = { ok: true; close: string[] } | { ok: false; reason: 'closed' | 'gated' };

// Moving to a section. A section that was left for good or ran out of time cannot be opened again. A "no going back"
// section is a gate: nothing after it opens until it is left, and leaving it closes it for good.
export function planSectionMove(
  rules: readonly SectionRule[],
  visits: readonly SectionVisit[],
  from: string | null,
  to: string,
  now: Date,
  attemptDeadline: Date,
): SectionMove {
  const at = rules.findIndex((rule) => rule.id === to);
  if (at === -1) return { ok: false, reason: 'closed' };
  const visitOf = (id: string) => visits.find((visit) => visit.sectionId === id);
  const target = visitOf(to);
  if (target && !sectionOpen(rules[at], target, now, attemptDeadline)) return { ok: false, reason: 'closed' };
  const gate = rules
    .slice(0, at)
    .find((rule) => rule.locked && rule.id !== from && sectionOpen(rule, visitOf(rule.id), now, attemptDeadline));
  const skipped = rules.slice(0, at).find((rule) => rule.locked && rule.id !== from && !visitOf(rule.id));
  if (gate || skipped) return { ok: false, reason: 'gated' };
  const leaving = rules.find((rule) => rule.id === from);
  return { ok: true, close: leaving && leaving.locked && from !== to ? [leaving.id] : [] };
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

// 07 §14: only graded attempts count; the best of them (the first of equals) or the last. Null when none is graded.
export function countedAttempt<T extends { attemptNo: number; status: string; total?: number | null }>(
  attempts: readonly T[],
  policy: AttemptPolicy,
): (T & { total: number }) | null {
  const graded = attempts.filter(
    (a): a is T & { total: number } => a.status === 'graded' && typeof a.total === 'number',
  );
  if (graded.length === 0) return null;
  return graded.reduce((kept, a) =>
    policy === 'best'
      ? a.total > kept.total || (a.total === kept.total && a.attemptNo < kept.attemptNo)
        ? a
        : kept
      : a.attemptNo > kept.attemptNo
        ? a
        : kept,
  );
}

// 07 §14: the counted attempt's total; none graded → 0 (a missed assessment counts as zero).
export function countedScore(
  attempts: readonly { attemptNo: number; status: string; total?: number | null }[],
  policy: AttemptPolicy,
): number {
  return countedAttempt(attempts, policy)?.total ?? 0;
}
