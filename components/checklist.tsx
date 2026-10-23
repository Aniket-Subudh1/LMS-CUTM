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
          <span className="grid size-8 shrink-0 place-items-center [&_img]:size-8 [&_svg]:size-5">{icon}</span>
          <div className="min-w-0">
            <h2 className="text-[0.9375rem] font-semibold tracking-tight">
              {done === steps.length ? readyTitle : title}
            </h2>
            <p className="text-muted-foreground text-[0.8125rem]">
              {done} of {steps.length} steps done.{done < steps.length && hint ? ` ${hint}` : ''}
            </p>
          </div>
        </div>
        <Progress value={(100 * done) / steps.length} className="bg-muted h-1 w-full sm:w-40" aria-label="Progress" />
      </div>
      <ol className="grid divide-y">
        {steps.map((step, index) => {
          const current = index === next;
          return (
            <li
              key={step.title}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-2 px-1 py-2.5',
                current && 'bg-primary/4 -mx-1 rounded-md px-2',
              )}
            >
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold',
                  step.done
                    ? 'bg-success text-white'
                    : current
                      ? 'bg-foreground text-background'
                      : 'ring-border text-muted-foreground ring-1',
                )}
              >
                {step.done ? <CheckIcon weight="bold" className="size-3.5" /> : index + 1}
                <span className="sr-only">{step.done ? ' (done)' : ''}</span>
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className={cn('text-[0.8125rem] font-medium', step.done && 'text-muted-foreground')}>
                  {step.title}
                </span>
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
