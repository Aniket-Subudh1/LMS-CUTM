import { cn } from '@/lib/cn';
import type { BloomLevel } from '@/lib/domain/catalog';

// Bloom levels as quiet chips: lower orders in blue, application in gold, higher orders in teal and green. Its own file:
// the course Overview shows it too, and must not load the Outcomes tab's chart with it.
const BLOOM_TONE: Record<BloomLevel, string> = {
  remember: 'bg-primary/10 text-primary',
  understand: 'bg-primary/10 text-primary',
  apply: 'bg-gold/15 text-foreground',
  analyse: 'bg-teal/10 text-teal',
  evaluate: 'bg-teal/10 text-teal',
  create: 'bg-success/10 text-success',
};

export function BloomChip({ level }: { level: BloomLevel }) {
  return (
    <span className={cn('rounded-sm px-1.5 py-px text-[0.6875rem] font-semibold capitalize', BLOOM_TONE[level])}>
      {level}
    </span>
  );
}
