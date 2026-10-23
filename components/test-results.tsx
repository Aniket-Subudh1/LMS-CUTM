import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  FilePdfIcon,
  FileXlsIcon,
  PercentIcon,
  SealCheckIcon,
  UsersThreeIcon,
  WarningIcon,
} from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import { z } from 'zod';
import { refreshResults } from '@/app/(app)/courses/[offeringId]/assessments/actions';
import { ActionForm } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { PageIcon } from '@/components/page-icon';
import { Section } from '@/components/section';
import { TestFileButton } from '@/components/test-file-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { getTestResults, type TestResults } from '@/lib/data/assessments';
import { assessmentPath } from '@/lib/domain/test-links';
import { formatDateTime, ITEM_LABEL } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

const Search = z.object({ page: pageParam.catch(1) });

type Item = NonNullable<TestResults['stats']>['items'][number];

// TP-11 (mock-up C6): how a test went, from the testStats job's last run — who took it, the average and highest,
// answers flagged as alike, the score histogram and each question's analysis, the ones to look at first. Shared by a
// course's assessments and standalone tests.
export async function TestResultsView({
  params,
  searchParams,
}: {
  params: Promise<{ offeringId?: string; aid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { offeringId, aid } = await params;
  const { page } = Search.parse(await searchParams);
  const view = await getTestResults(aid);
  if (view.path !== assessmentPath(offeringId ?? null, aid)) notFound();
  const { stats, rules } = view;
  const top = rules.bands[0]?.minPct ?? null;
  const tiles: { icon: Icon; value: string; label: string; tone: string }[] = stats
    ? [
        { icon: UsersThreeIcon, value: String(stats.takers), label: 'Took the test', tone: '' },
        {
          icon: PercentIcon,
          value: stats.averagePct === null ? '—' : `${Math.round(stats.averagePct)}%`,
          label: 'Average',
          tone: '',
        },
        {
          icon: SealCheckIcon,
          value: stats.highestPct === null ? '—' : `${Math.round(stats.highestPct)}%`,
          label: 'Highest',
          tone: '',
        },
        {
          icon: WarningIcon,
          value: String(stats.flagged),
          label: 'Flagged for similarity',
          tone: stats.flagged > 0 ? 'text-warning' : '',
        },
      ]
    : [];
  const highest = stats ? Math.max(1, ...stats.histogram) : 1;
  const base = `${view.path}/results`;
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`${view.path}/edit`}>
          <ArrowLeftIcon /> {view.assessment.title}
        </Link>
      </Button>
      <Section
        icon={<PageIcon name="chart" className="size-8" />}
        title="Results and analytics"
        description={
          stats
            ? `How the test went and how each question worked, over each person’s counted attempt. Worked out ${formatDateTime(stats.computedAt)}.`
            : 'Not worked out yet. It happens when the results are published, or now if you ask.'
        }
        action={
          <>
            {/* TP-12 (mock-up C6): every result in Excel; every hand-in's report in one PDF. */}
            {view.files && (
              <>
                <TestFileButton
                  assessmentId={aid}
                  kind="results_xlsx"
                  label="Export to Excel"
                  icon={<FileXlsIcon />}
                  file={view.files.results_xlsx}
                  again
                />
                <TestFileButton
                  assessmentId={aid}
                  kind="reports_pdf"
                  label="PDF reports"
                  icon={<FilePdfIcon />}
                  file={view.files.reports_pdf}
                  again
                />
              </>
            )}
            {view.canManage && (
              <ActionForm
                action={refreshResults}
                submitLabel="Work them out again"
                submitVariant="outline"
                submitSize="sm"
                submitIcon={<ArrowClockwiseIcon />}
                successMessage="Working them out. Reload in a minute."
              >
                <input type="hidden" name="assessmentId" value={aid} />
              </ActionForm>
            )}
          </>
        }
      >
        {view.assessment.status !== 'results_published' && (
          <p className="text-muted-foreground bg-muted/60 rounded-md px-3 py-2 text-[0.8125rem]">
            The results are not published, so nobody taking the test sees these yet.
          </p>
        )}
        {stats && (
          <>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {tiles.map((tile) => (
                <div key={tile.label} className="ring-border/70 flex items-center gap-3 rounded-md px-3.5 py-3 ring-1">
                  <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md">
                    <tile.icon className="size-4.5" />
                  </span>
                  <div className="grid min-w-0">
                    <dd className={cn('text-lg leading-tight font-semibold tabular-nums', tile.tone)}>{tile.value}</dd>
                    <dt className="text-muted-foreground order-first text-xs">{tile.label}</dt>
                  </div>
                </div>
              ))}
            </dl>
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <figure className="ring-border/70 grid gap-3 rounded-md p-4 ring-1">
                <figcaption className="text-[0.875rem] font-semibold">Score distribution</figcaption>
                <div
                  className="flex h-44 items-end gap-1.5"
                  role="img"
                  aria-label="How many people scored in each band of 10 %"
                >
                  {stats.histogram.map((count, bin) => (
                    <span
                      key={bin}
                      title={`${bin * 10}–${bin === 9 ? 100 : bin * 10 + 9}%: ${count}`}
                      className={cn(
                        'min-h-0.5 flex-1 rounded-t-sm',
                        top !== null && bin * 10 >= top ? 'bg-success' : 'bg-primary',
                      )}
                      style={{ height: `${(100 * count) / highest}%` }}
                    />
                  ))}
                </div>
                <div className="text-muted-foreground flex justify-between text-xs">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </figure>
              <div className="ring-border/70 grid gap-2 rounded-md p-4 ring-1">
                <h3 className="text-[0.875rem] font-semibold">Questions to look at</h3>
                <DataTable<Item>
                  bare
                  columns={[
                    {
                      header: 'Question',
                      cell: (item) => (
                        <span className="grid min-w-48">
                          <span className="line-clamp-2 font-medium">{item.title}</span>
                          <span className="text-muted-foreground text-xs">
                            {[ITEM_LABEL[item.type], item.sectionTitle, ...item.cos].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      ),
                    },
                    {
                      header: 'Correct',
                      cell: (item) => (
                        <span className="whitespace-nowrap">
                          <b className={cn('tabular-nums', item.difficulty === 'very hard' && 'text-destructive')}>
                            {item.correctPct}%
                          </b>{' '}
                          <span className="text-muted-foreground">{item.difficulty}</span>
                        </span>
                      ),
                    },
                    {
                      header: 'Discrimination',
                      cell: (item) =>
                        item.discrimination === null ? (
                          <span className="text-muted-foreground">Too few</span>
                        ) : (
                          <span className="whitespace-nowrap">
                            <b
                              className={cn(
                                'tabular-nums',
                                item.discriminationLabel === 'weak' && 'text-destructive',
                                item.discriminationLabel === 'strong' && 'text-success',
                              )}
                            >
                              {item.discrimination.toFixed(2)}
                            </b>{' '}
                            <span className="text-muted-foreground">{item.discriminationLabel}</span>
                          </span>
                        ),
                    },
                    {
                      header: 'Most picked wrong',
                      cell: (item) =>
                        item.wrongPick ? (
                          <span>
                            {item.wrongPick.text} ({item.wrongPick.pct}%)
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        ),
                    },
                  ]}
                  rows={stats.items.slice((page - 1) * pageSize, page * pageSize)}
                  rowKey={(item) => item.key}
                  total={stats.items.length}
                  page={page}
                  pageSize={pageSize}
                  query={{}}
                  path={base}
                  empty="No marked questions yet."
                />
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Correct: the share who earned all its marks. Discrimination: how much more often the top 27 % got it
                  right than the bottom 27 % (from −1 to 1; under 0.2 is weak).
                </p>
              </div>
            </div>
          </>
        )}
      </Section>
    </>
  );
}
