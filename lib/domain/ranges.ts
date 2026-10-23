import { roundHalfUp } from '@/lib/domain/round';

export type Range = readonly [number, number];

// 07 §8: watched intervals in whole seconds, merged when they touch or sit within one second of each other.
export function mergeRanges(existing: readonly Range[], incoming: readonly Range[], durationSec: number) {
  const cleaned = [...existing, ...incoming]
    .map(([start, end]) => [Math.round(start), Math.round(end)] as const)
    .map(
      ([start, end]) => [Math.max(0, Math.min(durationSec, start)), Math.max(0, Math.min(durationSec, end))] as const,
    )
    .filter(([start, end]) => end - start > 0)
    .sort((left, right) => left[0] - right[0]);

  const ranges: [number, number][] = [];
  for (const [start, end] of cleaned) {
    const last = ranges.at(-1);
    if (!last || start > last[1] + 1) {
      ranges.push([start, end]);
      continue;
    }
    last[1] = Math.max(last[1], end);
  }

  const watchedSec = ranges.reduce((total, [start, end]) => total + (end - start), 0);
  const progressPct = durationSec <= 0 ? 0 : roundHalfUp(Math.min(100, (100 * watchedSec) / durationSec), 2);
  return { ranges, watchedSec, progressPct };
}

// 07 §9: new unique seconds may grow at most 2× real time plus 30 s of slack; the first beacon may add 120 s.
export function acceptVideoBeacon({
  watchedBefore,
  watchedAfter,
  lastBeaconAt,
  now,
}: {
  watchedBefore: number;
  watchedAfter: number;
  lastBeaconAt: Date | null;
  now: Date;
}) {
  const newSec = Math.max(0, watchedAfter - watchedBefore);
  const allowedSec = lastBeaconAt ? (2 * (now.getTime() - lastBeaconAt.getTime())) / 1000 + 30 : 120;
  return { accepted: newSec <= allowedSec, newSec, allowedSec };
}

// 07 §9 (LIV-03): focused seconds may grow at most with real time plus 5 s of slack, and 120 s per beacon.
export function acceptFocusBeacon({
  focusedSec,
  lastFocusAt,
  now,
}: {
  focusedSec: number;
  lastFocusAt: Date | null;
  now: Date;
}): boolean {
  const allowedSec = lastFocusAt ? Math.min(120, (now.getTime() - lastFocusAt.getTime()) / 1000 + 5) : 120;
  return focusedSec <= allowedSec;
}
