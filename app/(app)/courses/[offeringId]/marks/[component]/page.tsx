import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon, LockSimpleIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../../../loading';
import { saveRubricMarks } from '../actions';
import { ActionForm } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { PageIcon } from '@/components/page-icon';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getRubricSheet, type RubricSheet } from '@/lib/data/marks';
import { addedUp } from '@/lib/domain/evaluation';
import { formatMarks, formatPct } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';
import { RUBRIC_COMPONENTS } from '@/lib/schemas/marks';

export const metadata: Metadata = { title: 'Rubric' };

const Search = z.object({
  page: pageParam.catch(1),
  q: z.string().trim().max(80).optional().catch(undefined),
});

export default function RubricPage({ params, searchParams }: PageProps<'/courses/[offeringId]/marks/[component]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Rubric params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const TITLE = { practice: 'Practice rubric', project: 'Project rubric' } as const;
const EXTERNAL = {
  practice: 'The examiner’s marks come from the exam section with the end-semester marks.',
  project: 'The external relevance, report and defence marks come from the exam section.',
} as const;

// M06 T4 (Q-41, mock-up M2 A): the policy's internal rubric for ten students a page, saved together. A head of
// department, or anyone once marks are locked, reads it.
async function Rubric({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/marks/[component]'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/marks/[component]'>['searchParams'];
}) {
  const { offeringId, component: raw } = await params;
  const component = z.enum(RUBRIC_COMPONENTS).safeParse(raw);
  if (!component.success) notFound();
  const { page, q } = Search.parse(await searchParams);
  const sheet = await getRubricSheet(offeringId, component.data, q, page);
  const base = `/courses/${offeringId}/marks/${component.data}`;
  const table = <Grid sheet={sheet} base={base} page={page} q={q} />;
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`/courses/${offeringId}/marks`}>
          <ArrowLeftIcon /> Internal marks
        </Link>
      </Button>
      <Section
        icon={<PageIcon name={component.data === 'practice' ? 'lab' : 'plan'} className="size-8" />}
        title={TITLE[component.data]}
        description={`Out of ${formatMarks(sheet.max)}, by the Examination Policy. ${EXTERNAL[component.data]}`}
      >
        <FilterForm
          action={base}
          submitLabel="Search"
          search={{ name: 'q', label: 'Search students', placeholder: 'Search roll number or name', defaultValue: q }}
        />
        {sheet.fromReviews && (
          <p className="text-muted-foreground text-[0.8125rem]">
            Each criterion is the average of the student’s project reviews. Mark a review on the{' '}
            <Link href={`/courses/${offeringId}/projects`} className="text-primary font-medium hover:underline">
              Projects
            </Link>{' '}
            tab.
          </p>
        )}
        {sheet.locked && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-[0.8125rem]">
            <LockSimpleIcon className="size-4" /> The marks of this class are locked, so the rubric cannot change.
          </p>
        )}
        {sheet.canEdit && sheet.rows.length > 0 ? (
          <ActionForm
            action={saveRubricMarks}
            submitLabel="Save this page"
            successMessage="Saved. The internal marks follow within a minute."
          >
            <input type="hidden" name="offeringId" value={offeringId} />
            <input type="hidden" name="component" value={component.data} />
            <p className="text-muted-foreground -mb-2 text-xs">
              A blank box keeps that student’s {component.data} mark open. Marks take up to two decimals.
            </p>
            {table}
          </ActionForm>
        ) : (
          table
        )}
      </Section>
    </>
  );
}

function Grid({ sheet, base, page, q }: { sheet: RubricSheet; base: string; page: number; q: string | undefined }) {
  return (
    <DataTable
      bare
      columns={[
        {
          header: 'Student',
          cell: (row) => (
            <span className="grid min-w-36">
              <span className="font-semibold">{row.name}</span>
              <span className="text-muted-foreground text-xs tabular-nums">{row.rollNo}</span>
              {sheet.canEdit && <input type="hidden" name="student[]" value={row.id} />}
            </span>
          ),
        },
        ...sheet.criteria.map((criterion) => ({
          header: `${criterion.label} · ${formatMarks(criterion.max)}`,
          // Long criteria wrap onto two lines, so the whole grid fits a laptop screen.
          className: 'min-w-24 whitespace-normal',
          cell: (row: RubricSheet['rows'][number]) => {
            const value = row.marks[criterion.key];
            return (
              <span className="grid gap-1">
                {sheet.canEdit ? (
                  <Input
                    name="mark[]"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={criterion.max}
                    step={0.01}
                    defaultValue={value ?? ''}
                    aria-label={`${row.name}, ${criterion.label}, out of ${formatMarks(criterion.max)}`}
                    className="w-18 text-right tabular-nums"
                  />
                ) : (
                  <span className="tabular-nums">
                    {value === undefined ? <span className="text-muted-foreground">—</span> : formatMarks(value)}
                  </span>
                )}
                {criterion.key === 'practiceRecord' && row.labRecordPct !== null && (
                  <span className="text-muted-foreground text-[0.6875rem] whitespace-nowrap">
                    Lab records {formatPct(Math.round(row.labRecordPct))}
                  </span>
                )}
              </span>
            );
          },
        })),
        {
          header: `Total · ${formatMarks(sheet.max)}`,
          cell: (row) => {
            const total = addedUp(sheet.criteria.map((c) => row.marks[c.key]));
            return <b className="tabular-nums">{total === null ? '—' : formatMarks(total)}</b>;
          },
        },
      ]}
      rows={sheet.rows}
      rowKey={(row) => row.id}
      total={sheet.total}
      page={page}
      pageSize={pageSize}
      query={q ? { q } : {}}
      path={base}
      empty={q ? 'No student matches. Clear the search.' : 'Nobody is enrolled in this class yet.'}
    />
  );
}
