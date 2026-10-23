import { roundHalfUp } from '@/lib/domain/round';
import type { Trend } from '@/lib/schemas/marks';
import type { SettingsValue } from '@/lib/schemas/settings';

// 07 §3 (CE-09): the least-squares slope of the last `window` percentages, oldest first. The unrounded slope decides;
// it is reported at 2 dp.
export function computeTrend(
  points: readonly number[],
  settings: SettingsValue<'ceTrend'>,
): { trend: Trend; slope: number | null } {
  const ys = points.slice(-settings.window);
  const n = ys.length;
  if (n < settings.minPoints) return { trend: 'insufficient', slope: null };
  const meanX = (n - 1) / 2;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;
  let numerator = 0;
  let denominator = 0;
  ys.forEach((y, x) => {
    numerator += (x - meanX) * (y - meanY);
    denominator += (x - meanX) ** 2;
  });
  const slope = numerator / denominator;
  const trend = slope >= settings.slopeThreshold ? 'rising' : slope <= -settings.slopeThreshold ? 'dropping' : 'steady';
  return { trend, slope: roundHalfUp(slope, 2) };
}
