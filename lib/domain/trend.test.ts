import { describe, expect, it } from 'vitest';
import { computeTrend } from './trend';

// 07 §3, with the defaults: window 6, at least 3 results, ±2 points.
const settings = { window: 6, minPoints: 3, slopeThreshold: 2 };

describe('computeTrend', () => {
  it.each([
    [[50, 60, 70], 10, 'rising'],
    [[80, 70, 60, 50], -10, 'dropping'],
    [[70, 72, 69, 71], 0, 'steady'],
    [[60, 62, 61, 65, 63, 64], 0.77, 'steady'],
    [[10, 20, 30, 40, 50, 60, 70], 10, 'rising'],
    [[90, 40], null, 'insufficient'],
  ])('%o → slope %s, %s', (points, slope, trend) => {
    expect(computeTrend(points, settings)).toEqual({ slope, trend });
  });
});
