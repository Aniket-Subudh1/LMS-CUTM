import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpenIcon, ChartLineUpIcon, TrendDownIcon, UsersThreeIcon, WarningIcon } from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import { z } from 'zod';
import Loading from '../../loading';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { getEngagementReport, type EngagementReport } from '@/lib/data/engagement-views';
import { cn } from '@/lib/cn';
import { formatPct } from '@/lib/format';
import { objectId, page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Engagement' };

const Search = z.object({
  page: pageParam.catch(1),
  term: objectId.optional().catch(undefined),
  department: objectId.optional().catch(undefined),
  category: z.enum(['ugc', 'skill']).optional().catch(undefined),
});

export default function EngagementReportPage({ searchParams }: PageProps<'/reports/engagement'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Report searchParams={searchParams} />
    </Suspense>
  );
}

const one = (value: number) => String(Math.round(value * 10) / 10);

// M10 T6 (DSH-01, DSH-05): last night's engagement across a term's courses — a head of department's own department,
// any department for an admin — each linking to its People tab (its low band when it has one).
async function Report({ searchParams }: { searchParams: PageProps<'/reports/engagement'>['searchParams'] }) {
  const { page, term, department, category } = Search.parse(await searchParams);
  const report = await getEngagementReport({ termId: term, departmentId: department, category }, page);
  const query = {
    ...(report.termId ? { term: report.termId } : {}),
    ...(report.admin && report.departmentId ? { department: report.departmentId } : {}),
    ...(report.category ? { category: report.category } : {}),
  };
  const { totals } = report;
  const tiles: { icon: Icon; value: string; label: string; tone?: string }[] = [
    { icon: BookOpenIcon, value: String(totals.offerings), label: 'Courses' },
    { icon: UsersThreeIcon, value: String(totals.students), label: 'Active students' },
    {
      icon: ChartLineUpIcon,
      value: totals.averageScore === null ? '—' : one(totals.averageScore),
      label: 'Average score',
    },
    {
      icon: WarningIcon,
      value: String(totals.low),
      label: 'Low engagement',
      tone: totals.low > 0 ? 'text-destructive' : undefined,
    },
    {
      icon: TrendDownIcon,
      value: String(totals.falling),
      label: 'Falling',
      tone: totals.falling > 0 ? 'text-warning' : undefined,
    },
  ];
  return (
    <PageHeader
      icon={<PageIcon name="people" />}
      title="Engagement"
      description={`How much the students of ${report.admin ? 'every department’s' : 'your department’s'} courses are studying, from last night's scores.`}
    >
      <FilterForm action="/reports/engagement">
        <NativeSelect name="term" aria-label="Term" defaultValue={report.termId ?? ''}>
          {report.terms.map((t) => (
            <NativeSelectOption key={t.id} value={t.id}>
              {t.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect name="category" aria-label="Course type" defaultValue={report.category ?? ''}>
          <NativeSelectOption value="">Every course</NativeSelectOption>
          <NativeSelectOption value="ugc">Credit courses</NativeSelectOption>
          <NativeSelectOption value="skill">Non-credit courses</NativeSelectOption>
        </NativeSelect>
        {report.admin && (
          <NativeSelect
            name="department"
            aria-label="Department"
            defaultValue={report.departmentId ?? ''}
            className="max-w-60"
          >
            <NativeSelectOption value="">All departments</NativeSelectOption>
            {report.departments.map((d) => (
              <NativeSelectOption key={d.id} value={d.id}>
                {d.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </FilterForm>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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
      <DataTable
        bare
        columns={columns(report)}
        rows={report.rows}
        rowKey={(row) => row.id}
        total={report.total}
        page={page}
        pageSize={pageSize}
        query={query}
        path="/reports/engagement"
        empty={
          report.admin || report.departmentId
            ? 'No course in this term has started yet.'
            : 'Your account has no department, so there is nothing to show. Ask an administrator to set it.'
        }
      />
    </PageHeader>
  );
}

type Row = EngagementReport['rows'][number];

function columns(report: EngagementReport) {
  const count = (n: number, tone: string) => (
    <span className={cn('tabular-nums', n > 0 ? `${tone} font-medium` : 'text-muted-foreground')}>{n}</span>
  );
  // DSH-05: on non-credit courses, lesson completion (their attendance, SKL-04) and quizzes attempted.
  const skill =
    report.category === 'skill'
      ? [
          {
            header: 'Lessons completed',
            cell: (row: Row) =>
              row.skill?.completedPct == null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className="tabular-nums">{formatPct(Math.round(row.skill.completedPct))}</span>
              ),
          },
          {
            header: 'Quizzes attempted',
            cell: (row: Row) => (
              <span className="tabular-nums">
                {row.skill?.quizzesAttempted == null ? '—' : `${one(row.skill.quizzesAttempted)} each`}
              </span>
            ),
          },
        ]
      : [];
  return [
    {
      header: 'Course',
      cell: (row: Row) => (
        <span className="grid min-w-52">
          <span className="font-semibold">{row.title}</span>
          <span className="text-muted-foreground text-xs">
            {row.faculty.length > 0 ? row.faculty.join(', ') : 'No faculty assigned'}
          </span>
        </span>
      ),
    },
    { header: 'Students', cell: (row: Row) => <span className="tabular-nums">{row.students}</span> },
    {
      header: 'Average score',
      cell: (row: Row) =>
        row.averageScore === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="flex items-center gap-2">
            <Progress value={row.averageScore} className="w-24" aria-label={`Average ${one(row.averageScore)}`} />
            <span className="tabular-nums">{one(row.averageScore)}</span>
          </span>
        ),
    },
    { header: 'High', cell: (row: Row) => count(row.bands.high, 'text-success') },
    { header: 'Medium', cell: (row: Row) => count(row.bands.medium, 'text-warning') },
    { header: 'Low', cell: (row: Row) => count(row.bands.low, 'text-destructive') },
    { header: 'Falling', cell: (row: Row) => count(row.falling, 'text-warning') },
    ...skill,
    {
      header: '',
      className: 'w-20',
      cell: (row: Row) => (
        <Button asChild variant="outline" size="sm">
          <Link
            href={
              row.bands.low > 0
                ? `/courses/${row.id}/people?band=low&status=active`
                : `/courses/${row.id}/people?sort=engagement`
            }
          >
            People
          </Link>
        </Button>
      ),
    },
  ];
}
