import { roundHalfUp } from '@/lib/domain/round';
import type { AttendanceStatus } from '@/lib/schemas/live';

export type Presence = { joinedAt: Date; leftAt: Date | null };

// 07 §10 (ATT-03, LIV-04): time in the class is the union of the student's connections inside [startedAt, endedAt];
// a connection still open counts until the end. Present from `thresholdPct` of the class's length.
export function deriveAttendance(
  presence: readonly Presence[],
  startedAt: Date,
  endedAt: Date,
  thresholdPct: number,
): { presenceSec: number; status: AttendanceStatus } {
  const start = startedAt.getTime();
  const end = endedAt.getTime();
  const clipped = presence
    .map(({ joinedAt, leftAt }) => [Math.max(start, joinedAt.getTime()), Math.min(end, leftAt?.getTime() ?? end)])
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0]);
  let unionMs = 0;
  let reached = start;
  for (const [from, to] of clipped) {
    if (to <= reached) continue;
    unionMs += to - Math.max(from, reached);
    reached = to;
  }
  const presenceSec = Math.round(unionMs / 1000);
  const lengthSec = (end - start) / 1000;
  // A class of no length has no attendance to earn.
  const present = lengthSec > 0 && presenceSec * 100 >= thresholdPct * lengthSec;
  return { presenceSec, status: present ? 'present' : 'absent' };
}

// ATT-02, SKL-04: classes attended over classes held (live classes, or a skill course's published lessons).
export function attendancePct(attended: number, held: number): number | null {
  if (held <= 0) return null;
  return roundHalfUp((100 * attended) / held, 2);
}
