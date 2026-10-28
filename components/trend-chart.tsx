import { cn } from '@/lib/cn';
import { formatPct, TREND_LABEL } from '@/lib/format';
import type { Trend } from '@/lib/schemas/marks';

const TONE: Record<Trend, string> = {
  rising: 'text-success',
  dropping: 'text-destructive',
  steady: 'text-muted-foreground',
  insufficient: 'text-muted-foreground',
};

// The trend as a line (08 §5.2): the published percentages, oldest first, on 0–100 %, with a sentence for screen
// readers.
export function TrendChart({ points, trend, wide = false }: { points: number[]; trend: Trend; wide?: boolean }) {
  const [w, h, pad] = wide ? [300, 120, 16] : [64, 20, 2];
  const xy = points.map((p, i) => [
    pad + (points.length === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (points.length - 1)),
    h - pad - (Math.min(100, Math.max(0, p)) / 100) * (h - 2 * pad),
  ]);
  const summary = `${points.length === 0 ? 'No published results yet' : `Results ${points.map((p) => formatPct(Math.round(p))).join(', ')}`}: ${TREND_LABEL[trend].toLowerCase()}.`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={summary}
      className={cn('shrink-0 overflow-visible', TONE[trend], wide ? 'w-full' : 'h-5 w-16')}
    >
      {wide && <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} className="stroke-border" />}
      {xy.length > 1 && (
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth={wide ? 2 : 1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={xy.map((p) => p.join(',')).join(' ')}
        />
      )}
      {wide &&
        xy.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={3} fill="currentColor" />
            <text x={x} y={y - 8} textAnchor="middle" className="fill-muted-foreground text-[9px]">
              {formatPct(Math.round(points[i]))}
            </text>
          </g>
        ))}
    </svg>
  );
}
