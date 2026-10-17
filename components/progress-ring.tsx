import { cn } from '@/lib/cn';

const R = 30;
const LENGTH = 2 * Math.PI * R;

// A course's overall progress as a ring (Round 1, 17 Oct 2026); per-module progress stays a thin bar.
export function ProgressRing({
  value,
  label,
  size = 64,
  className,
}: {
  value: number;
  label: string;
  size?: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 76 76" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="38" cy="38" r={R} fill="none" strokeWidth="5" className="stroke-muted" />
        <circle
          cx="38"
          cy="38"
          r={R}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={LENGTH}
          strokeDashoffset={LENGTH * (1 - pct / 100)}
          className="stroke-primary motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700"
        />
      </svg>
      <span className="text-xs font-bold tabular-nums">{Math.round(pct)}%</span>
    </span>
  );
}
