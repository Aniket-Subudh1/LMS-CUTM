import Link from 'next/link';
import { CaretRightIcon } from '@phosphor-icons/react/ssr';
import { LinkSpinner } from '@/components/link-spinner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import type { MyOfferingRow } from '@/lib/data/workspace';
import { initials, statusTone } from '@/lib/format';

// `featured` is the dark first card of a row on Home.
export function OfferingCard({ offering, featured = false }: { offering: MyOfferingRow; featured?: boolean }) {
  const [lead, ...others] = offering.faculty;
  return (
    <Link
      href={`/courses/${offering.id}`}
      className={cn(
        'surface-interactive flex h-full flex-col gap-3 p-4',
        featured && 'bg-foreground! text-background! ring-foreground!',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <Badge variant={featured ? 'default' : statusTone(offering.status)} className="capitalize">
          {offering.status}
        </Badge>
        <span className={cn('truncate text-xs', featured ? 'text-background/70' : 'text-muted-foreground')}>
          {offering.termCode}
        </span>
      </span>
      <span className="line-clamp-2 text-lg leading-snug font-semibold tracking-tight">{offering.title}</span>
      <span className="mt-auto flex items-center gap-2 pt-2">
        <Avatar className="size-8">
          <AvatarFallback
            className={cn(
              'text-xs font-semibold',
              featured ? 'bg-background/15 text-background' : 'bg-primary/10 text-primary',
            )}
          >
            {lead ? initials(lead) : '–'}
          </AvatarFallback>
        </Avatar>
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className={cn('text-xs', featured ? 'text-background/60' : 'text-muted-foreground')}>Faculty</span>
          <span className="truncate text-sm font-medium">
            {lead ? `${lead}${others.length > 0 ? ` +${others.length}` : ''}` : 'Not assigned'}
          </span>
        </span>
        {featured ? (
          <span className="bg-background text-foreground inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full pr-2 pl-3 text-[0.8125rem] font-medium">
            Open
            <LinkSpinner />
            <CaretRightIcon className="size-4" />
          </span>
        ) : (
          <span className="bg-foreground text-background inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full pr-2 pl-3 text-[0.8125rem] font-medium">
            Open
            <LinkSpinner />
            <CaretRightIcon className="size-4" />
          </span>
        )}
      </span>
    </Link>
  );
}
