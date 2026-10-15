import type { Credits } from '@/lib/domain/catalog';
import { ceilTo } from '@/lib/domain/round';

export type ComponentMarks = { theory?: number | null; practice?: number | null; project?: number | null };

// 07 §2 (CUTM Examination Policy, 15 Jun 2020): each component is marked out of 100 and the course percentage is
// their credit-weighted average, rounded up once (Q-39). Null when a weighted component has no mark yet, or for a
// non-credit course.
export function coursePercentage(credits: Credits, marks: ComponentMarks): number | null {
  let weighted = 0;
  let weight = 0;
  for (const part of ['theory', 'practice', 'project'] as const) {
    if (credits[part] === 0) continue;
    const mark = marks[part];
    if (mark === undefined || mark === null) return null;
    weighted += credits[part] * mark;
    weight += credits[part];
  }
  return weight === 0 ? null : ceilTo(weighted / weight, 0);
}

// The theory component's attendance marks: the first band (highest first) the percentage reaches; below the last
// band, nothing.
export function attendancePoints(pct: number, bands: readonly { minPct: number; marks: number }[]): number {
  return bands.find((band) => pct >= band.minPct)?.marks ?? 0;
}
