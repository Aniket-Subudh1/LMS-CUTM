import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowsClockwiseIcon,
  ChartLineUpIcon,
  CheckCircleIcon,
  LockSimpleIcon,
  TrendDownIcon,
  UsersThreeIcon,
  WarningIcon,
} from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import { z } from 'zod';
import Loading from '../../../loading';
import { requestRecompute } from './actions';
import { ActionForm } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { PageIcon } from '@/components/page-icon';
import { Section } from '@/components/section';
import { TrendChart } from '@/components/trend-chart';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { getMarksSheet, getMyMarks, type MarksSheet, type MyMarks } from '@/lib/data/marks';
import { getWorkspace } from '@/lib/data/workspace';
import { cn } from '@/lib/cn';
import { formatDateTime, formatMarks, formatPct, MODE_LABEL, TREND_LABEL } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';
import type { Trend } from '@/lib/schemas/marks';

export const metadata: Metadata = { title: 'Marks' };

const Search = z.object({
  page: pageParam.catch(1),
  q: z.string().trim().max(80).optional().catch(undefined),
  show: z.enum(['dropping', 'incomplete']).optional().catch(undefined),
});

export default function MarksPage({ params, searchParams }: PageProps<'/courses/[offeringId]/marks'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Marks params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// M06 T4 (CE-09, DSH-02): the class's internal marks for its teachers and the head of department (mock-up M1 A), or a
// student's own (M3).
async function Marks({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/marks'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/marks'>['searchParams'];
}) {
  const { offeringId } = await params;
  const workspace = await getWorkspace(offeringId);
  if (workspace.access === 'learn') return <MyMarksView marks={await getMyMarks(offeringId)} />;
  const { page, q, show } = Search.parse(await searchParams);
  const sheet = await getMarksSheet(offeringId, { q, show }, page);
  return <ClassMarks offeringId={offeringId} sheet={sheet} page={page} q={q} show={show} />;
}

const TONE: Record<Trend, string> = {
  rising: 'text-success',
  dropping: 'text-destructive',
  steady: 'text-muted-foreground',
  insufficient: 'text-muted-foreground',
};

function TrendBadge({ trend }: { trend: Trend }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[0.6875rem] font-medium whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current',
        TONE[trend],
      )}
    >
      {TREND_LABEL[trend]}
    </span>
  );
}

const marksOrDash = (value: number | null | undefined) =>
  value === null || value === undefined ? <span className="text-muted-foreground">—</span> : formatMarks(value);

function ClassMarks({
  offeringId,
  sheet,
  page,
  q,
  show,
}: {
  offeringId: string;
  sheet: MarksSheet;
  page: number;
  q: string | undefined;
  show: 'dropping' | 'incomplete' | undefined;
}) {
  const base = `/courses/${offeringId}/marks`;
  const query = { ...(q ? { q } : {}), ...(show ? { show } : {}) };
  const { counts } = sheet;
  const tiles: { icon: Icon; value: string; label: string; tone?: string }[] = [
    { icon: UsersThreeIcon, value: String(counts.students), label: 'Students' },
    { icon: CheckCircleIcon, value: `${counts.complete} of ${counts.students}`, label: 'Complete' },
    {
      icon: TrendDownIcon,
      value: String(counts.dropping),
      label: 'Dropping',
      tone: counts.dropping > 0 ? 'text-destructive' : undefined,
    },
    {
      icon: ChartLineUpIcon,
      value: counts.averagePct === null ? '—' : formatPct(counts.averagePct),
      label: 'Average internal',
    },
  ];
  const rubrics = sheet.components.filter((c) => c.key !== 'theory');
  return (
    <Section
      icon={<PageIcon name="chart" className="size-8" />}
      title="Internal marks"
      description="By the Examination Policy, from published results, live-class attendance and the rubrics."
      action={
        <>
          {rubrics.map((c) => (
            <Button key={c.key} asChild variant="outline" size="sm">
              <Link href={`${base}/${c.key}`}>{c.key === 'practice' ? 'Practice rubric' : 'Project rubric'}</Link>
            </Button>
          ))}
          {sheet.canTeach && !sheet.locked && (
            <ActionForm
              action={requestRecompute}
              submitLabel="Work them out again"
              submitVariant="outline"
              submitSize="sm"
              submitIcon={<ArrowsClockwiseIcon />}
            >
              <input type="hidden" name="offeringId" value={offeringId} />
            </ActionForm>
          )}
        </>
      }
    >
      <p className="text-muted-foreground -mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {sheet.computedAt
          ? `Worked out ${formatDateTime(sheet.computedAt)}. They follow every published result, class and rubric within a minute.`
          : 'Not worked out yet. They appear within a minute of the first published result, class or rubric.'}
        {sheet.locked && (
          <span className="text-foreground inline-flex items-center gap-1 font-medium">
            <LockSimpleIcon className="size-3.5" /> Locked: nothing here changes.
          </span>
        )}
      </p>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="ring-border/70 flex items-center gap-3 rounded-md px-3.5 py-3 ring-1">
            <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md">
              <tile.icon className={cn('size-[1.125rem]', tile.tone)} />
            </span>
            <div className="grid min-w-0">
              <dd className={cn('text-lg leading-tight font-semibold tabular-nums', tile.tone)}>{tile.value}</dd>
              <dt className="text-muted-foreground order-first truncate text-xs">{tile.label}</dt>
            </div>
          </div>
        ))}
      </dl>
      {sheet.parts.length > 0 && <WhatCounts sheet={sheet} />}
      <FilterForm
        action={base}
        submitLabel="Search"
        search={{ name: 'q', label: 'Search students', placeholder: 'Search roll number or name', defaultValue: q }}
      >
        <NativeSelect name="show" aria-label="Show" defaultValue={show ?? ''}>
          <NativeSelectOption value="">All students</NativeSelectOption>
          <NativeSelectOption value="dropping">Dropping</NativeSelectOption>
          <NativeSelectOption value="incomplete">Not complete</NativeSelectOption>
        </NativeSelect>
      </FilterForm>
      <DataTable
        bare
        columns={[
          {
            header: 'Student',
            cell: (row) => (
              <span className="grid min-w-36">
                <span className="font-semibold">{row.name}</span>
                <span className="text-muted-foreground text-xs tabular-nums">{row.rollNo}</span>
              </span>
            ),
          },
          ...sheet.parts.map((part) => ({
            header: `${part.label} · ${part.max}`,
            cell: (row: MarksSheet['rows'][number]) => (
              <span className="tabular-nums">{marksOrDash(row.parts[part.key])}</span>
            ),
          })),
          ...sheet.components.map((c) => ({
            header: `${c.key === 'theory' ? 'Theory' : c.key === 'practice' ? 'Practice' : 'Project'} · ${c.max}`,
            cell: (row: MarksSheet['rows'][number]) => (
              <b className="tabular-nums">{marksOrDash(row.components[c.key])}</b>
            ),
          })),
          {
            header: 'Trend',
            cell: (row) =>
              row.trend ? (
                <span className="flex items-center gap-2">
                  <TrendChart points={row.points} trend={row.trend} />
                  <TrendBadge trend={row.trend} />
                </span>
              ) : (
                <span className="text-muted-foreground">Not worked out yet</span>
              ),
          },
        ]}
        rows={sheet.rows}
        rowKey={(row) => row.id}
        total={sheet.total}
        page={page}
        pageSize={pageSize}
        query={query}
        path={base}
        empty={
          q || show ? 'No student matches. Clear the search or the filter.' : 'Nobody is enrolled in this class yet.'
        }
      />
    </Section>
  );
}

// What feeds each theory part (Q-41): the assessments set to count toward it, and the classes behind attendance.
function WhatCounts({ sheet }: { sheet: MarksSheet }) {
  const notCounted = sheet.notCounted;
  return (
    <div className="grid gap-2">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sheet.parts.map((part) => (
          <div key={part.key} className="ring-border/70 grid content-start gap-1.5 rounded-md p-3 ring-1">
            <p className="flex items-baseline justify-between gap-2">
              <b className="text-[0.8125rem] font-semibold">{part.label}</b>
              <span className="text-muted-foreground text-xs tabular-nums">out of {part.max}</span>
            </p>
            {part.key === 'attendance' ? (
              <p className="text-muted-foreground text-xs leading-relaxed">
                {sheet.classesHeld === 0
                  ? 'No live class held yet.'
                  : `${sheet.classesHeld} live class${sheet.classesHeld === 1 ? '' : 'es'} held.`}{' '}
                {sheet.bands.map((b) => `${formatPct(b.minPct)} → ${formatMarks(b.marks)}`).join(', ')}.
              </p>
            ) : sheet.counting[part.key].length === 0 ? (
              <p className="text-warning flex gap-1.5 text-xs leading-relaxed">
                <WarningIcon className="mt-0.5 size-3.5 shrink-0" />
                Nothing counts toward it yet. Choose it in an assessment’s settings.
              </p>
            ) : (
              <ul className="text-muted-foreground grid gap-0.5 text-xs">
                {sheet.counting[part.key].map((a) => (
                  <li key={a.id}>
                    {a.title} · {MODE_LABEL[a.mode].toLowerCase()} · {formatMarks(a.maxMarks)} marks
                    {a.state === 'draft' ? ' · draft' : a.state === 'published' ? ' · results not out' : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Each assessment chooses its part in its settings. Several in one part count equally, and a missed one counts 0.
        {notCounted > 0 &&
          ` ${notCounted} published assessment${notCounted === 1 ? ' counts' : 's count'} toward nothing; they show in the trend.`}
      </p>
    </div>
  );
}

function Bar({ label, note, marks, max }: { label: string; note?: string; marks: number | null; max: number }) {
  return (
    <div className="grid gap-1.5">
      <p className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
        <span className="min-w-0">
          {label}
          {note && <span className="text-muted-foreground text-xs"> · {note}</span>}
        </span>
        <b className="shrink-0 tabular-nums">
          {marks === null ? <span className="text-muted-foreground font-normal">—</span> : formatMarks(marks)} /{' '}
          {formatMarks(max)}
        </b>
      </p>
      <Progress value={marks === null ? 0 : (100 * marks) / max} aria-label={`${label}: ${marks ?? 0} of ${max}`} />
    </div>
  );
}

const COMPONENT_LABEL = { theory: 'Theory', practice: 'Practice', project: 'Project' } as const;
const EXTERNAL = {
  theory: 'The end-semester exam adds the rest from the exam section.',
  practice: 'Your teacher’s rubric. The examiner’s marks come from the exam section.',
  project: 'The average of your project reviews. The external marks come from the exam section.',
} as const;

// M3: a student's own marks — each part with the assessments and classes behind it, the rubrics, the total so far and
// their trend. Nothing about classmates (09 §3).
function MyMarksView({ marks }: { marks: MyMarks }) {
  const total = marks.components.reduce((sum, c) => sum + (c.marks ?? 0), 0);
  const max = marks.components.reduce((sum, c) => sum + c.max, 0);
  const theory = marks.components.find((c) => c.key === 'theory');
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid gap-4">
        {theory && (
          <Section
            icon={<PageIcon name="evaluation" className="size-8" />}
            title={`Theory · ${theory.marks === null ? 'not complete yet' : `${formatMarks(theory.marks)} of ${formatMarks(theory.max)}`}`}
            description={EXTERNAL.theory}
          >
            <div className="grid gap-4">
              {marks.parts.map((part) => (
                <Bar
                  key={part.key}
                  label={part.label}
                  marks={part.marks}
                  max={part.max}
                  note={
                    part.key === 'attendance'
                      ? marks.attendance.held === 0
                        ? 'no live class held yet'
                        : `${marks.attendance.attended} of ${marks.attendance.held} classes${marks.attendance.pct === null ? '' : ` · ${formatPct(marks.attendance.pct)}`}`
                      : part.assessments.length === 0
                        ? 'nothing published counts toward it yet'
                        : part.assessments
                            .map(
                              (a) =>
                                `${a.title} ${a.counted === null ? 'missed' : `${formatMarks(a.counted)} / ${formatMarks(a.maxMarks)}`}`,
                            )
                            .join(' · ')
                  }
                />
              ))}
            </div>
          </Section>
        )}
        {marks.rubrics.map((rubric) => {
          const component = marks.components.find((c) => c.key === rubric.component);
          const filled = rubric.criteria.some((c) => c.marks !== null);
          return (
            <Section
              key={rubric.component}
              icon={<PageIcon name={rubric.component === 'practice' ? 'lab' : 'plan'} className="size-8" />}
              title={`${COMPONENT_LABEL[rubric.component]} · ${
                component?.marks === null || component?.marks === undefined
                  ? filled
                    ? 'not complete yet'
                    : 'not filled yet'
                  : `${formatMarks(component.marks)} of ${formatMarks(component.max)}`
              }`}
              description={EXTERNAL[rubric.component]}
            >
              {filled && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {rubric.criteria.map((c) => (
                    <Bar key={c.label} label={c.label} marks={c.marks} max={c.max} />
                  ))}
                </div>
              )}
            </Section>
          );
        })}
      </div>
      <div className="grid gap-4">
        <section className="surface grid gap-2 p-4 sm:p-5">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Internal so far</p>
          <p className="text-3xl font-semibold tabular-nums">
            {formatMarks(total)}{' '}
            <span className="text-muted-foreground text-base font-normal">of {formatMarks(max)}</span>
          </p>
          <p className="text-muted-foreground text-[0.8125rem]">
            {marks.complete
              ? `Complete: ${marks.internalPct === null ? '' : formatPct(marks.internalPct)} of the internal marks.`
              : 'Some parts are still open; they fill in as results are published and rubrics are marked.'}
          </p>
          {marks.computedAt && (
            <p className="text-muted-foreground text-xs">Worked out {formatDateTime(marks.computedAt)}.</p>
          )}
        </section>
        <section className="surface grid gap-2 p-4 sm:p-5">
          <p className="flex items-center justify-between gap-2">
            <b className="text-[0.9375rem] font-semibold">Your trend</b>
            {marks.trend && <TrendBadge trend={marks.trend} />}
          </p>
          {marks.trend ? (
            <TrendChart points={marks.points} trend={marks.trend} wide />
          ) : (
            <p className="text-muted-foreground text-[0.8125rem]">Not worked out yet.</p>
          )}
          <p className="text-muted-foreground text-xs">
            Your latest published results, oldest first. Results that count toward no part show here too.
          </p>
        </section>
      </div>
    </div>
  );
}
