import { CircleNotchIcon } from '@phosphor-icons/react/ssr';
import { PageIcon, type PageIconName } from '@/components/page-icon';
import { cn } from '@/lib/cn';
import type { LessonKind } from '@/lib/schemas/content';

const MARK: Record<LessonKind, PageIconName> = { video: 'video', document: 'books', link: 'globe' };

// A lesson's picture (M03b): the teacher's upload, else the worker's video frame, else its type's mark. Pictures come
// through /api/files, which checks access and redirects to storage, so no bytes pass through Next (S6).
export function LessonThumb({
  kind,
  thumb,
  processing = false,
  className,
}: {
  kind: LessonKind;
  thumb: string | null;
  processing?: boolean;
  className?: string;
}) {
  const frame = cn(
    'bg-muted relative grid aspect-video w-24 shrink-0 place-items-center overflow-hidden rounded-sm',
    className,
  );
  if (thumb) {
    return (
      <span className={frame}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a redirect to storage; next/image would proxy the bytes */}
        <img src={`/api/files/${thumb}`} alt="" loading="lazy" className="size-full object-cover" />
      </span>
    );
  }
  if (processing) {
    return (
      <span className={cn(frame, 'text-muted-foreground')} title="Making the thumbnail">
        <CircleNotchIcon className="size-5 animate-spin" />
      </span>
    );
  }
  return (
    <span className={frame}>
      <PageIcon name={MARK[kind]} className="size-1/2" />
    </span>
  );
}
