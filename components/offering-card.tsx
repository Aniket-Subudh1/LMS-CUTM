import Link from 'next/link';
import { CourseCover, coverTone } from '@/components/course-cover';
import { LinkSpinner } from '@/components/link-spinner';
import { PageIcon } from '@/components/page-icon';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/cn';
import type { MyOfferingRow } from '@/lib/data/workspace';
import { creditTotal, formatCredits } from '@/lib/domain/catalog';
import { COURSE_TYPE_LABEL, formatDuration, formatPct, initials, statusTone } from '@/lib/format';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Design "A · Cover on top" (chosen by Aniket from three mock-ups, 17 Oct 2026): the class's cover (CourseCover),
// then type and credit chips, title, faculty, and the viewer's progress or the class at a glance.
export function OfferingCard({ offering: o }: { offering: MyOfferingRow }) {
  const [lead, ...others] = o.faculty;
  const tone = coverTone(o.code);
  const credits = creditTotal(o.credits);
  const { view } = o;
  const pct = view.as === 'learner' && view.published > 0 ? (100 * view.completed) / view.published : 0;
  return (
    // Named by the offering's full title, so a screen reader announces the course rather than the whole card.
    <Link href={`/courses/${o.id}`} aria-label={o.title} className="surface-interactive flex h-full flex-col p-2">
      <CourseCover code={o.code} coverKey={o.coverKey} className="h-32 rounded-md px-4 py-3.5">
        <LinkSpinner className="absolute top-3 right-3" />
        <span className="relative text-xl font-bold tracking-tight">{o.code}</span>
        <span className="relative text-xs opacity-80">{o.termCode}</span>
      </CourseCover>
      <span className="flex flex-1 flex-col gap-2.5 px-2 pt-3 pb-2">
        <span className="flex flex-wrap gap-1.5 text-xs font-medium">
          {o.courseType && (
            <span className={cn('rounded-md px-2 py-0.5', tone.chip)}>{COURSE_TYPE_LABEL[o.courseType]}</span>
          )}
          <span className="bg-muted text-muted-foreground rounded-md px-2 py-0.5">
            {credits > 0 ? `${plural(credits, 'credit')} · ${formatCredits(o.credits)}` : 'Non-credit'}
          </span>
        </span>
        <span className="line-clamp-2 text-base leading-snug font-semibold tracking-tight">{o.courseTitle}</span>
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
          <Avatar className="size-6">
            <AvatarFallback className="bg-primary/10 text-primary text-[0.625rem] font-semibold">
              {lead ? initials(lead) : '–'}
            </AvatarFallback>
          </Avatar>
          <span className="truncate">
            {lead ? `${lead}${others.length > 0 ? ` +${others.length}` : ''}` : 'Not assigned'}
          </span>
          {o.section && <span className="shrink-0">· Section {o.section}</span>}
        </span>
        {view.as === 'learner' ? (
          <span className="grid gap-1.5 text-xs">
            <span className="text-muted-foreground flex justify-between gap-2">
              Progress
              <span className={cn(view.published > 0 && 'text-foreground font-semibold')}>
                {view.published > 0 ? formatPct(pct) : 'No lessons yet'}
              </span>
            </span>
            {view.published > 0 ? (
              <Progress value={pct} className="bg-muted h-1.5" aria-label="Lessons complete" />
            ) : (
              <span className="bg-muted h-1.5 rounded-full" />
            )}
          </span>
        ) : (
          <span className="flex items-center justify-between gap-2 text-xs">
            <Badge variant={statusTone(o.status)}>{o.status}</Badge>
            <span className="text-muted-foreground truncate">
              {view.planPublished ? 'Course plan published' : 'No course plan yet'}
            </span>
          </span>
        )}
        <span className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-1">
          <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
            {view.as === 'learner' ? (
              <>
                <PageIcon name={view.published > 0 ? 'lessons' : 'modules'} className="size-4 shrink-0" />
                <span className="truncate">
                  {view.published > 0
                    ? `${view.completed} of ${plural(view.published, 'lesson')}${view.videoSec > 0 ? ` · ${formatDuration(view.videoSec)}` : ''}`
                    : plural(o.units, 'unit')}
                </span>
              </>
            ) : (
              <>
                <PageIcon name="students" className="size-4 shrink-0" />
                <span className="truncate">
                  {plural(view.students, 'student')} · {plural(o.units, 'unit')}
                </span>
              </>
            )}
          </span>
          <span className="bg-foreground text-background ml-auto inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[0.8125rem] font-medium">
            {view.as === 'teacher'
              ? 'Open workspace'
              : view.completed > 0 && view.completed < view.published
                ? 'Continue'
                : 'Open course'}
          </span>
        </span>
      </span>
    </Link>
  );
}
