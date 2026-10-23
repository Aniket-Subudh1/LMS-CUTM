import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpenIcon, ChartLineUpIcon, TrendDownIcon, UsersThreeIcon } from '@phosphor-icons/react/ssr';
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
import { getCeReport } from '@/lib/data/marks';
import { cn } from '@/lib/cn';
import { formatPct } from '@/lib/format';
import { objectId, page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Continuous evaluation' };

const Search = z.object({
  page: pageParam.catch(1),
  term: objectId.optional().catch(undefined),
  department: objectId.optional().catch(undefined),
});

export default function CeReportPage({ searchParams }: PageProps<'/reports/ce'>) {
  return (
    <Suspense fallback={<Loading />}>
      <CeReport searchParams={searchParams} />
    </Suspense>
  );
}

// M06 T4 (DSH-02, mock-up M5): internal marks across a term's credit courses — a head of department's own department,
// any department for an admin — each linking to its Marks tab.
async function CeReport({ searchParams }: { searchParams: PageProps<'/reports/ce'>['searchParams'] }) {
  const { page, term, department } = Search.parse(await searchParams);
  const report = await getCeReport({ termId: term, departmentId: department }, page);
  // The page links keep the term, and an admin's department.
  const query = {
    ...(report.termId ? { term: report.termId } : {}),
    ...(report.admin && report.departmentId ? { department: report.departmentId } : {}),
  };
  const { totals } = report;
  const tiles: { icon: Icon; value: string; label: string; tone?: string }[] = [
    { icon: BookOpenIcon, value: String(totals.offerings), label: 'Courses' },
    { icon: UsersThreeIcon, value: String(totals.students), label: 'Students' },
    {
      icon: ChartLineUpIcon,
      value: totals.averagePct === null ? '—' : formatPct(Math.round(totals.averagePct * 10) / 10),
      label: 'Average internal',
    },
    {
      icon: TrendDownIcon,
      value: String(totals.dropping),
      label: 'Dropping',
      tone: totals.dropping > 0 ? 'text-destructive' : undefined,
    },
  ];
  return (
    <PageHeader
      icon={<PageIcon name="chart" />}
      title="Continuous evaluation"
      description={`Internal marks of ${report.admin ? 'every department’s' : 'your department’s'} credit courses, from published results, attendance and rubrics.`}
    >
      <FilterForm action="/reports/ce">
        <NativeSelect name="term" aria-label="Term" defaultValue={report.termId ?? ''}>
          {report.terms.map((t) => (
            <NativeSelectOption key={t.id} value={t.id}>
              {t.label}
            </NativeSelectOption>
          ))}
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
      <DataTable
        bare
        columns={[
          {
            header: 'Course',
            cell: (row) => (
              <span className="grid min-w-52">
                <span className="font-semibold">{row.title}</span>
                <span className="text-muted-foreground text-xs">
                  {row.faculty.length > 0 ? row.faculty.join(', ') : 'No faculty assigned'}
                </span>
              </span>
            ),
          },
          { header: 'Students', cell: (row) => <span className="tabular-nums">{row.students}</span> },
          {
            header: 'Average internal',
            cell: (row) =>
              row.averagePct === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className="flex items-center gap-2">
                  <Progress
                    value={row.averagePct}
                    className="w-24"
                    aria-label={`Average ${formatPct(row.averagePct)}`}
                  />
                  <span className="tabular-nums">{formatPct(Math.round(row.averagePct * 10) / 10)}</span>
                </span>
              ),
          },
          {
            header: 'Complete',
            cell: (row) => (
              <span className="tabular-nums">
                {row.completePct === null ? '—' : formatPct(Math.round(row.completePct))}
              </span>
            ),
          },
          {
            header: 'Dropping',
            cell: (row) => (
              <span
                className={cn(
                  'tabular-nums',
                  row.dropping > 0 ? 'text-destructive font-medium' : 'text-muted-foreground',
                )}
              >
                {row.dropping}
              </span>
            ),
          },
          {
            header: '',
            className: 'w-20',
            cell: (row) => (
              <Button asChild variant="outline" size="sm">
                <Link href={`/courses/${row.id}/marks`}>Marks</Link>
              </Button>
            ),
          },
        ]}
        rows={report.rows}
        rowKey={(row) => row.id}
        total={report.total}
        page={page}
        pageSize={pageSize}
        query={query}
        path="/reports/ce"
        empty={
          report.admin || report.departmentId
            ? 'No credit course in this term has started yet.'
            : 'Your account has no department, so there is nothing to show. Ask an administrator to set it.'
        }
      />
    </PageHeader>
  );
}
