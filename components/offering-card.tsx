import Link from 'next/link';
import { BookOpenTextIcon, CalendarBlankIcon } from '@phosphor-icons/react/ssr';
import { LinkSpinner } from '@/components/link-spinner';
import { Badge } from '@/components/ui/badge';
import type { MyOfferingRow } from '@/lib/data/workspace';
import { statusTone } from '@/lib/format';

export function OfferingCard({ offering }: { offering: MyOfferingRow }) {
  return (
    <Link href={`/courses/${offering.id}`} className="surface-interactive group flex h-full flex-col gap-3 p-4">
      <span className="flex items-start justify-between gap-3">
        <span className="icon-chip size-10 [&_svg]:size-5">
          <BookOpenTextIcon weight="duotone" />
        </span>
        <span className="flex items-center gap-2">
          <LinkSpinner />
          <Badge variant={statusTone(offering.status)} className="capitalize">
            {offering.status}
          </Badge>
        </span>
      </span>
      <span className="line-clamp-2 leading-snug font-medium">{offering.title}</span>
      <span className="text-muted-foreground mt-auto flex min-w-0 items-center gap-1.5 text-xs">
        <CalendarBlankIcon weight="duotone" className="size-4 shrink-0" />
        <span className="truncate">
          {offering.termCode} · {offering.faculty.length > 0 ? offering.faculty.join(', ') : 'No faculty assigned'}
        </span>
      </span>
    </Link>
  );
}
