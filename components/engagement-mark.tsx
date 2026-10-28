import { ArrowRightIcon, TrendDownIcon, TrendUpIcon } from '@phosphor-icons/react/ssr';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { ENGAGEMENT_TREND_LABEL, statusTone } from '@/lib/format';
import type { EngagementBand, EngagementTrend } from '@/lib/schemas/engagement';

// A student's engagement in one line (08 §5.2): the score, the band as a status badge and the trend as an arrow.
export function EngagementMark({
  score,
  band,
  trend,
}: {
  score: number | null;
  band: EngagementBand | null;
  trend: EngagementTrend;
}) {
  const label = ENGAGEMENT_TREND_LABEL[trend];
  const Mark = trend === 'rising' ? TrendUpIcon : trend === 'falling' ? TrendDownIcon : ArrowRightIcon;
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <b className="w-6 text-right tabular-nums">{score ?? '—'}</b>
      {band && <Badge variant={statusTone(band)}>{band}</Badge>}
      {trend === 'new' ? (
        <span className="text-muted-foreground text-xs">{label}</span>
      ) : (
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs',
            trend === 'rising' ? 'text-success' : trend === 'falling' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          <Mark className="size-3.5" aria-hidden="true" />
          {label}
        </span>
      )}
    </span>
  );
}
