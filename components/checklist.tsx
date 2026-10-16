import type { ReactNode } from 'react';
import Link from 'next/link';
import { CheckIcon } from '@phosphor-icons/react/ssr';
import { LinkSpinner } from '@/components/link-spinner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/cn';

export type ChecklistStep = {
  title: string;
  // Shown when done ("3 sessions") or not ("Not written yet").
  detail: string;
  done: boolean;
  // Where the step is done; null when someone else does it (`waiting` then says who).
  href: string | null;
  action: string;
  waiting?: string;
};

// A path through a setup, in order (08 §5.2): what is done, and a link to where the next step is done. The
// highlighted step is the first unfinished one the viewer can do. Used by the course Overview and the catalogue
// course page.
export function Checklist({
  icon,
  title,
  readyTitle,
  steps,
  hint,
}: {
  icon: ReactNode;
  title: string;
  readyTitle: string;
  steps: ChecklistStep[];
  hint?: string;
}) {
  const done = steps.filter((step) => step.done).length;
  const next = steps.findIndex((step) => !step.done && step.href);
  return (
    <section className="surface grid gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-chip size-10 [&_svg]:size-5">{icon}</span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">{done === steps.length ? readyTitle : title}</h2>
            <p className="text-muted-foreground text-sm">
              {done} of {steps.length} steps done.{done < steps.length && hint ? ` ${hint}` : ''}
            </p>
          </div>
        </div>
        <Progress value={(100 * done) / steps.length} className="bg-muted h-2 w-full sm:w-48" aria-label="Progress" />
      </div>
      <ol className="grid gap-2">
        {steps.map((step, index) => {
          const current = index === next;
          return (
            <li
              key={step.title}
              className={cn(
                'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-3 ring-1',
                current ? 'bg-primary/4 ring-primary/25' : 'ring-border/80',
              )}
            >
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  step.done
                    ? 'bg-success text-white'
                    : current
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {step.done ? <CheckIcon weight="bold" className="size-3.5" /> : index + 1}
                <span className="sr-only">{step.done ? ' (done)' : ''}</span>
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-sm font-medium">{step.title}</span>
                <span className="text-muted-foreground text-xs">{step.detail}</span>
              </span>
              {step.href ? (
                <Button asChild size="sm" variant={current ? 'default' : 'outline'}>
                  <Link href={step.href} scroll={false}>
                    {step.done ? 'Open' : step.action}
                    <LinkSpinner />
                  </Link>
                </Button>
              ) : (
                !step.done && step.waiting && <span className="text-muted-foreground text-xs">{step.waiting}</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
