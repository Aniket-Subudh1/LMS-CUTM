import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpenIcon, CheckCircleIcon, TargetIcon, WarningIcon } from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import { z } from 'zod';
import Loading from '../../loading';
import { FilterForm } from '@/components/filter-form';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { PrintButton } from '@/components/print-button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  getAttainmentFilters,
  getProgramAttainment,
  type AttainmentFilters,
  type ProgramAttainment,
} from '@/lib/data/attainment-views';
import { cn } from '@/lib/cn';
import { formatMarks } from '@/lib/format';
import { objectId } from '@/lib/schemas/common';
import { OUTCOME_CODES } from '@/lib/schemas/structure';

export const metadata: Metadata = { title: 'Attainment' };

const Search = z.object({
  program: objectId.optional().catch(undefined),
  batch: objectId.optional().catch(undefined),
  term: objectId.optional().catch(undefined),
});

export default function AttainmentReportPage({ searchParams }: PageProps<'/reports/attainment'>) {
  return (
    <Suspense fallback={<Loading />}>
      <AttainmentReport searchParams={searchParams} />
    </Suspense>
  );
}

// M09 T4 (CPP-09, 07 §5, mock-up A5): a programme's batch, from its courses' latest attainment, worked out when opened
// (M09 decision 4).
async function AttainmentReport({ searchParams }: { searchParams: PageProps<'/reports/attainment'>['searchParams'] }) {
  const { program, batch, term } = Search.parse(await searchParams);
  const filters = await getAttainmentFilters({ programId: program, batchId: batch, termId: term });
  const report =
    filters.programId && filters.batchId
      ? await getProgramAttainment({
          programId: filters.programId,
          batchId: filters.batchId,
          termId: filters.termId ?? undefined,
        })
      : null;
  return (
    <PageHeader
      icon={<PageIcon name="chart" />}
      title="Programme attainment"
      description="Each PO and PSO of a programme’s batch, from its courses’ latest attainment. Worked out each time you open it."
      actions={report && report.courses.length > 0 && <PrintButton />}
    >
      {filters.programmes.length > 0 && <Filters filters={filters} />}
      {report ? (
        <Report report={report} termChosen={filters.termId !== null} />
      ) : (
        <Message
          text={
            filters.programmes.length > 0
              ? 'This programme has no batches yet.'
              : 'There is no programme to show. A head of department sees their own department’s programmes; ask an administrator if your account has no department.'
          }
        />
      )}
    </PageHeader>
  );
}

function Filters({ filters }: { filters: AttainmentFilters }) {
  return (
    <FilterForm action="/reports/attainment">
      <NativeSelect name="program" aria-label="Programme" defaultValue={filters.programId ?? ''} className="max-w-72">
        {filters.programmes.map((p) => (
          <NativeSelectOption key={p.id} value={p.id}>
            {p.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {filters.batches.length > 0 && (
        <NativeSelect name="batch" aria-label="Batch" defaultValue={filters.batchId ?? ''}>
          {filters.batches.map((b) => (
            <NativeSelectOption key={b.id} value={b.id}>
              {b.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      <NativeSelect name="term" aria-label="Term" defaultValue={filters.termId ?? ''}>
        <NativeSelectOption value="">All terms</NativeSelectOption>
        {filters.terms.map((t) => (
          <NativeSelectOption key={t.id} value={t.id}>
            {t.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </FilterForm>
  );
}

const Message = ({ text }: { text: string }) => (
  <p className="text-muted-foreground rounded-md border border-dashed px-4 py-10 text-center text-sm">{text}</p>
);

function Report({ report, termChosen }: { report: ProgramAttainment; termChosen: boolean }) {
  if (report.tooMany) {
    return <Message text="This batch has more than 200 credit courses across every term. Pick a term." />;
  }
  if (report.courses.length === 0) {
    return (
      <Message
        text={termChosen ? 'This batch has no credit course in this term.' : 'This batch has no credit course yet.'}
      />
    );
  }
  const { target } = report;
  const valued = report.outcomes.filter((o) => o.value !== null);
  const met = valued.filter((o) => (o.value ?? 0) >= target).length;
  const tiles: { icon: Icon; label: string; value: string; tone?: string }[] = [
    { icon: BookOpenIcon, label: 'Courses', value: String(report.courses.length) },
    {
      icon: CheckCircleIcon,
      label: 'Worked out',
      value: `${report.courses.filter((c) => c.outcomes).length} of ${report.courses.length}`,
    },
    { icon: TargetIcon, label: 'Outcomes met', value: `${met} of ${valued.length}` },
    {
      icon: WarningIcon,
      label: 'Below the target',
      value: String(valued.length - met),
      tone: valued.length > met ? 'text-warning' : undefined,
    },
  ];
  const head = 'text-muted-foreground h-9 px-2 text-center text-[0.6875rem] font-medium tracking-wide uppercase';
  const none = (
    <span className="text-muted-foreground" aria-label="no course maps to it">
      —
    </span>
  );
  return (
    <>
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
      {/* `relative` keeps the scroll box's contents inside it on a phone, as MatrixFrame does. */}
      <div className="ring-border/70 relative overflow-x-auto rounded-md ring-1">
        <table className="w-full border-collapse text-[0.8125rem]">
          <thead>
            <tr className="border-b">
              <th className={cn(head, 'bg-card sticky left-0 z-10 px-3 text-left')}>Course</th>
              {OUTCOME_CODES.map((code) => (
                <th key={code} className={cn(head, code.startsWith('PSO') && 'text-teal')}>
                  <abbr title={report.program.titles[code] || code} className="no-underline">
                    {code}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr]:border-border/70 [&>tr]:border-b">
            {report.courses.map((course) => (
              <tr key={course.courseId}>
                <th scope="row" className="bg-card sticky left-0 z-10 min-w-56 px-3 py-2.5 text-left font-normal">
                  <span className="block font-semibold">
                    {course.code} · {course.title}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {course.terms}
                    {course.sections > 1 && ` · ${course.sections} sections`}
                  </span>
                </th>
                {course.outcomes ? (
                  OUTCOME_CODES.map((code) => {
                    const value = course.outcomes?.find((o) => o.code === code)?.value ?? null;
                    return (
                      <td key={code} className="px-2 py-2.5 text-center tabular-nums">
                        {value === null ? none : formatMarks(value)}
                      </td>
                    );
                  })
                ) : (
                  <td colSpan={OUTCOME_CODES.length} className="text-muted-foreground px-2 py-2.5">
                    Not worked out yet ·{' '}
                    <Link
                      href={`/courses/${course.offeringId}/outcomes`}
                      className="text-foreground underline underline-offset-2"
                    >
                      open its Outcomes tab
                    </Link>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-border/70 border-b">
              <th
                scope="row"
                className="bg-primary/10 text-primary sticky left-0 z-10 px-3 py-2.5 text-left font-semibold"
              >
                Programme
              </th>
              {report.outcomes.map((o) => (
                <td key={o.code} className="bg-primary/5 px-2 py-2.5 text-center font-semibold tabular-nums">
                  {o.value === null ? none : formatMarks(o.value)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="bg-card sticky left-0 z-10 px-3 py-2 text-left text-xs font-medium">
                Against the target ({target})
              </th>
              {report.outcomes.map((o) => (
                <td
                  key={o.code}
                  className={cn(
                    'px-2 py-2 text-center text-xs font-medium',
                    o.value !== null && (o.value >= target ? 'text-success' : 'text-warning'),
                  )}
                >
                  {o.value === null ? '' : o.value >= target ? 'Met' : 'Below'}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        A course taught in several sections counts once, as the mean of its sections. The programme’s value is the mean
        of the courses that map to that outcome; “—” where none does.
      </p>
    </>
  );
}
