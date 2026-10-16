import { describe, expect, it } from 'vitest';
import { acceptFocusBeacon, acceptVideoBeacon, mergeRanges } from './ranges';

const mergeCases = [
  { existing: [], incoming: [[0, 30]], duration: 100, ranges: [[0, 30]], watched: 30, pct: 30 },
  { existing: [[0, 30]], incoming: [[30, 60]], duration: 100, ranges: [[0, 60]], watched: 60, pct: 60 },
  { existing: [[0, 30]], incoming: [[31, 40]], duration: 100, ranges: [[0, 40]], watched: 40, pct: 40 },
  {
    existing: [[0, 30]],
    incoming: [
      [50, 70],
      [10, 20],
    ],
    duration: 100,
    ranges: [
      [0, 30],
      [50, 70],
    ],
    watched: 50,
    pct: 50,
  },
  { existing: [], incoming: [[90, 130]], duration: 100, ranges: [[90, 100]], watched: 10, pct: 10 },
  { existing: [], incoming: [[40, 40]], duration: 100, ranges: [], watched: 0, pct: 0 },
  {
    existing: [],
    incoming: [
      [60, 80],
      [70, 90],
      [0, 10],
    ],
    duration: 100,
    ranges: [
      [0, 10],
      [60, 90],
    ],
    watched: 40,
    pct: 40,
  },
] as const;

describe('mergeRanges', () => {
  it.each(mergeCases)('merges %o', ({ existing, incoming, duration, ranges, watched, pct }) => {
    expect(mergeRanges(existing, incoming, duration)).toEqual({
      ranges,
      watchedSec: watched,
      progressPct: pct,
    });
  });
});

describe('acceptVideoBeacon', () => {
  const at = (time: string) => new Date(`2026-10-13T${time}+05:30`);
  it.each([
    [null, at('10:00:30'), 120, true],
    [null, at('10:00:30'), 121, false],
    [at('10:00:00'), at('10:00:30'), 90, true],
    [at('10:00:00'), at('10:00:30'), 91, false],
  ])('last beacon %o, now %o, %d new seconds → accepted %s', (lastBeaconAt, now, newSec, accepted) => {
    expect(acceptVideoBeacon({ watchedBefore: 0, watchedAfter: newSec, lastBeaconAt, now })).toMatchObject({
      accepted,
      newSec,
    });
  });
});

describe('acceptFocusBeacon (07 §9)', () => {
  const at = (time: string) => new Date(`2026-10-16T${time}+05:30`);
  it.each([
    [null, at('10:00:30'), 120, true],
    [null, at('10:00:30'), 121, false],
    [at('10:00:00'), at('10:01:00'), 65, true],
    [at('10:00:00'), at('10:01:00'), 66, false],
    [at('10:00:00'), at('10:05:00'), 120, true],
    [at('10:00:00'), at('10:05:00'), 121, false],
  ])('last beacon %o, now %o, %d focused seconds → accepted %s', (lastFocusAt, now, focusedSec, accepted) => {
    expect(acceptFocusBeacon({ focusedSec, lastFocusAt, now })).toBe(accepted);
  });
});
