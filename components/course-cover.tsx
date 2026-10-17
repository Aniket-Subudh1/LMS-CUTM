import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// Flat tones picked from the course code, so a course without a picture keeps one colour on every page (17 Oct 2026).
const TONES = [
  { cover: 'bg-primary text-primary-foreground', chip: 'bg-primary/10 text-primary' },
  { cover: 'bg-teal text-primary-foreground', chip: 'bg-teal/10 text-teal' },
  { cover: 'bg-gold text-foreground', chip: 'bg-gold/15 text-foreground' },
];

export function coverTone(code: string) {
  return TONES[[...code].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % TONES.length];
}

// A class's cover (M03b): the teacher's picture when there is one (offering-cover, through /api/files), else the
// code's tone under a dot grid with the code's digits large and faint. Course cards and the workspace header use it.
export function CourseCover({
  code,
  coverKey,
  className,
  children,
}: {
  code: string;
  coverKey: string | null;
  className?: string;
  children?: ReactNode;
}) {
  if (coverKey) {
    return (
      <span className={cn('text-primary-foreground relative flex flex-col justify-end overflow-hidden', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a redirect to storage; next/image would proxy the bytes */}
        <img src={`/api/files/${coverKey}`} alt="" className="absolute inset-0 size-full object-cover" />
        <span aria-hidden="true" className="from-foreground/70 absolute inset-0 bg-linear-to-t to-transparent" />
        {children}
      </span>
    );
  }
  return (
    <span
      className={cn('cover-dots relative flex flex-col justify-end overflow-hidden', coverTone(code).cover, className)}
    >
      <span
        aria-hidden="true"
        className="absolute -top-[0.15em] -right-[0.08em] text-[6rem] leading-none font-extrabold tracking-tighter opacity-10"
      >
        {code.replace(/^\D+/, '')}
      </span>
      {children}
    </span>
  );
}
