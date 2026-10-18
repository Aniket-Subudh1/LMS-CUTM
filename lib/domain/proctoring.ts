import { roundHalfUp } from '@/lib/domain/round';
import { HARD_EVENTS, type ProctorEvent } from '@/lib/schemas/assessment';

// 07 §15 (M04b, TP-08). The runner beats every BEAT_MS; a tab not heard from for LIVE_MS has gone, so another may take
// the attempt over; silence longer than GAP_MS is recorded as a lost connection. Leaving full screen also hides the
// page, so serious warnings closer together than MERGE_MS are one act and count once.
export const BEAT_MS = 15_000;
export const LIVE_MS = 45_000;
export const GAP_MS = 60_000;
export const MERGE_MS = 3_000;

export type ProctorTally = { hard: number; soft: number; lastHardAt: Date | null };

export const isHard = (type: ProctorEvent) => HARD_EVENTS.some((hard) => hard === type);

// One event. A serious warning counts unless it follows the last counted one within MERGE_MS; with a limit N > 0 the
// N-th counted one hands the attempt in (0 only records them).
export function recordEvent(
  tally: ProctorTally,
  type: ProctorEvent,
  at: Date,
  hardLimit: number,
): { tally: ProctorTally; counted: boolean; end: boolean } {
  if (!isHard(type)) return { tally: { ...tally, soft: tally.soft + 1 }, counted: false, end: false };
  if (tally.lastHardAt && at.getTime() - tally.lastHardAt.getTime() < MERGE_MS) {
    return { tally, counted: false, end: false };
  }
  const hard = tally.hard + 1;
  return { tally: { ...tally, hard, lastHardAt: at }, counted: true, end: hardLimit > 0 && hard >= hardLimit };
}

// Marks taken off for serious warnings, unless a grader waived them.
export function proctorPenalty(hard: number, penaltyEach: number, waived: boolean): number {
  return waived ? 0 : roundHalfUp(hard * penaltyEach, 2);
}

// The penalty comes off the attempt's total, which never goes below 0 (A-M04b-9); null while anything is unmarked.
export function withPenalty(total: number | null, penalty: number): number | null {
  return total === null ? null : Math.max(0, roundHalfUp(total - penalty, 2));
}

export type SessionCheck = 'same' | 'take' | 'clash';

// Whether a beat comes from the tab that holds the attempt, may take it over (none holds it, or the holder has gone
// quiet), or clashes with a holder still live — a second tab or device.
export function sessionCheck(
  held: { sessionId: string | null; lastBeatAt: Date | null },
  sessionId: string,
  now: Date,
): SessionCheck {
  if (held.sessionId === sessionId) return 'same';
  if (!held.sessionId || !held.lastBeatAt || now.getTime() - held.lastBeatAt.getTime() >= LIVE_MS) return 'take';
  return 'clash';
}

// Seconds of silence since the last beat when they are longer than GAP_MS, else null.
export function connectionGap(lastBeatAt: Date | null, now: Date): number | null {
  if (!lastBeatAt) return null;
  const gap = now.getTime() - lastBeatAt.getTime();
  return gap > GAP_MS ? Math.round(gap / 1000) : null;
}
