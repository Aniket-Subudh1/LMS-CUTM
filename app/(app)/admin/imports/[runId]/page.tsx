import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowClockwiseIcon, ArrowLeftIcon, GlobeIcon, WarningIcon } from '@phosphor-icons/react/ssr';
import Loading from '../../../loading';
import { EmptyState } from '@/components/data-table';
import { LinkSpinner } from '@/components/link-spinner';
import { PageHeader } from '@/components/page-header';
import { Fact, Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { getCoursewareRun } from '@/lib/data/imports';
import { formatDateTime, statusTone } from '@/lib/format';

export const metadata: Metadata = { title: 'Courseware import' };

const STATUS_TEXT = {
  running: 'Running. Each page takes about 30 seconds; refresh to see how far it is.',
  stopped: 'Stopped: nothing has happened for two hours (the worker was probably restarted). Start a new import.',
  succeeded: 'Finished. Every page was read.',
  partial: 'Finished, but some pages could not be read. They are listed below.',
  failed: 'Failed. No page could be read; see below.',
} as const;

export default function RunPage({ params }: PageProps<'/admin/imports/[runId]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Run params={params} />
    </Suspense>
  );
}

async function Run({ params }: { params: PageProps<'/admin/imports/[runId]'>['params'] }) {
  const run = await getCoursewareRun((await params).runId);
  const done = run.stats.applied + run.stats.skipped + run.stats.failed;
  const rows = run.stats.rows ?? 0;
  return (
    <>
      <PageHeader
        icon={<GlobeIcon weight="duotone" />}
        title="Courseware import"
        description={`Started ${formatDateTime(run.startedAt)} by ${run.actor}.`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/imports">
                <ArrowLeftIcon /> All imports
              </Link>
            </Button>
            {run.status === 'running' && (
              <Button asChild>
                <Link href={`/admin/imports/${run.id}`}>
                  <ArrowClockwiseIcon /> Refresh
                  <LinkSpinner />
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-6">
        <section className="surface grid gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant={statusTone(run.status)}>{run.status}</Badge>
            <span className="text-muted-foreground text-sm tabular-nums">
              {done} of {rows} pages{run.status === 'running' && run.mode !== 'one' ? ' found so far' : ''}
            </span>
          </div>
          <Progress value={rows ? (100 * done) / rows : 0} className="bg-muted h-2.5" aria-label="Pages done" />
          <p className="text-sm">{STATUS_TEXT[run.status]}</p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Fact label="Imported">{run.stats.applied}</Fact>
            <Fact label="Left as they were">{run.stats.skipped}</Fact>
            <Fact label="Could not be read">{run.stats.failed}</Fact>
            <Fact label="Finished">{run.finishedAt ? formatDateTime(run.finishedAt) : '—'}</Fact>
          </dl>
          <p className="text-muted-foreground text-xs">
            “Left as they were” covers pages that have not changed since the last import and courses whose content was
            edited here.
          </p>
        </section>
        <Section
          icon={<WarningIcon weight="duotone" />}
          title="Pages that could not be read"
          description="Fix the course on its courseware page, or add it to the course list, then import that page again."
        >
          {run.failures.length === 0 ? (
            <EmptyState icon={<WarningIcon weight="duotone" />} text="None so far." />
          ) : (
            <ul className="surface grid gap-2 p-4 text-sm">
              {run.failures.map((f, i) => (
                <li key={`${f.key}-${i}`} className="flex flex-wrap gap-x-3">
                  <span className="font-medium tabular-nums">
                    {f.key?.startsWith('course/') ? `Page ${f.key.slice(7)}` : (f.key ?? '—')}
                  </span>
                  <span className="text-muted-foreground">{f.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
