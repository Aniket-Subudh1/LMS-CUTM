import { cn } from '@/lib/cn';

const weekday = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short' });
const day = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric' });
const month = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'short' });

// A day as a small tile (M03b): weekday over the date in IST. Blue for live classes, gold for plan sessions, grey for
// what has passed. The full date is in its accessible name.
export function DateTile({
  date,
  tone = 'live',
  withMonth = false,
  className,
}: {
  date: Date;
  tone?: 'live' | 'plan' | 'past';
  withMonth?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'grid size-12 shrink-0 place-content-center rounded-md text-center leading-none',
        tone === 'live' && 'bg-primary/10 text-primary',
        tone === 'plan' && 'bg-gold/15 text-foreground',
        tone === 'past' && 'bg-muted text-muted-foreground',
        className,
      )}
    >
      <span className="text-[0.625rem] font-semibold uppercase">{weekday.format(date)}</span>
      <span className="text-lg font-bold tabular-nums">{day.format(date)}</span>
      {withMonth && <span className="text-[0.625rem] font-medium">{month.format(date)}</span>}
    </span>
  );
}
