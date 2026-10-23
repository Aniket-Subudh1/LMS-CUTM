import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PlusIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../../loading';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { NewAssessmentDialog } from '@/components/new-assessment-dialog';
import { PageIcon } from '@/components/page-icon';
import { Section } from '@/components/section';
import { AssessmentMenu, ModeChip, STATE_LABEL, StudentList } from '@/components/assessment-lists';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { listOfferingAssessments, type AssessmentList } from '@/lib/data/assessments';
import { formatDateTime, formatDuration, MODE_LABEL, statusTone } from '@/lib/format';
import { ASSESSMENT_MODES, ASSESSMENT_STATES } from '@/lib/schemas/assessment';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Assessments' };

const Search = z.object({
  page: pageParam.catch(1),
  q: z.string().trim().max(80).optional().catch(undefined),
  mode: z.enum(ASSESSMENT_MODES).optional().catch(undefined),
  state: z.enum(ASSESSMENT_STATES).optional().catch(undefined),
  // The New assessment dialog with its type chosen (M04 decision 2).
  new: z.enum(ASSESSMENT_MODES).optional().catch(undefined),
});

export default function AssessmentsPage({ params, searchParams }: PageProps<'/courses/[offeringId]/assessments'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Assessments params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Assessments({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/assessments'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/assessments'>['searchParams'];
}) {
  const { offeringId } = await params;
  const { page, q, mode, state, new: open } = Search.parse(await searchParams);
  const list = await listOfferingAssessments(offeringId, { q, mode, state }, page);
  const base = `/courses/${offeringId}/assessments`;
  const query = { ...(q ? { q } : {}), ...(mode ? { mode } : {}), ...(state ? { state } : {}) };
  const filtered = Boolean(q || mode || state);
  const toolbar = (
    <FilterForm
      action={base}
      submitLabel="Search"
      search={{ name: 'q', label: 'Search assessments', placeholder: 'Search assessments', defaultValue: q }}
    >
      <NativeSelect name="mode" aria-label="Type" defaultValue={mode ?? ''}>
        <NativeSelectOption value="">All types</NativeSelectOption>
        {ASSESSMENT_MODES.map((m) => (
          <NativeSelectOption key={m} value={m}>
            {MODE_LABEL[m]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect name="state" aria-label="Status" defaultValue={state ?? ''}>
        <NativeSelectOption value="">Any status</NativeSelectOption>
        {list.view === 'teacher' && <NativeSelectOption value="draft">Draft</NativeSelectOption>}
        <NativeSelectOption value="upcoming">Not open yet</NativeSelectOption>
        <NativeSelectOption value="open">Open</NativeSelectOption>
        <NativeSelectOption value="closed">Closed</NativeSelectOption>
        <NativeSelectOption value="results">Results published</NativeSelectOption>
      </NativeSelect>
    </FilterForm>
  );
  if (list.view === 'student') {
    return (
      <Section
        icon={<PageIcon name="evaluation" className="size-8" />}
        title="Assessments"
        description="Your quizzes, tests and assignments. Marks appear when your teacher publishes them."
      >
        {toolbar}
        <StudentList
          base={base}
          rows={list.rows}
          total={list.total}
          page={page}
          query={query}
          path={base}
          empty={filtered ? 'Nothing matches. Clear the search or the filters.' : 'Nothing has been published yet.'}
        />
      </Section>
    );
  }
  return (
    <>
      <Section
        icon={<PageIcon name="evaluation" className="size-8" />}
        title="Assessments"
        description="Quizzes, tests, assignments and records. Students are told when you publish one."
        action={
          list.canTeach && (
            <Button asChild size="sm">
              <Link href={`${base}?${new URLSearchParams({ ...query, new: 'quiz' })}`} scroll={false}>
                <PlusIcon /> New assessment
              </Link>
            </Button>
          )
        }
      >
        {toolbar}
        <TeacherTable list={list} offeringId={offeringId} page={page} query={query} filtered={filtered} />
      </Section>
      {list.canTeach && open && <NewAssessmentDialog key={open} offeringId={offeringId} mode={open} />}
    </>
  );
}

type TeacherList = Extract<AssessmentList, { view: 'teacher' }>;
type TeacherRow = TeacherList['rows'][number];

function TeacherTable({
  list,
  offeringId,
  page,
  query,
  filtered,
}: {
  list: TeacherList;
  offeringId: string;
  page: number;
  query: Record<string, string>;
  filtered: boolean;
}) {
  const base = `/courses/${offeringId}/assessments`;
  return (
    <DataTable
      bare
      columns={[
        {
          header: 'Assessment',
          cell: (row: TeacherRow) => (
            <span className="grid min-w-48 gap-1">
              <Link href={`${base}/${row.id}/edit`} className="font-medium hover:underline">
                {row.title}
              </Link>
              <span className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                <ModeChip mode={row.mode} />
                {row.questions} question{row.questions === 1 ? '' : 's'} · {row.maxMarks} marks
              </span>
            </span>
          ),
        },
        {
          header: 'Window',
          cell: (row: TeacherRow) => (
            <span className="grid gap-0.5">
              <span className="whitespace-nowrap">
                {formatDateTime(row.opensAt)} – {formatDateTime(row.closesAt)}
              </span>
              <span className="text-muted-foreground text-xs">
                {row.durationMin ? formatDuration(row.durationMin * 60) : 'No time limit'} · {row.attemptsAllowed}{' '}
                attempt{row.attemptsAllowed === 1 ? '' : 's'}
                {row.attemptsAllowed > 1 ? `, ${row.attemptPolicy} counts` : ''}
                {row.lateUntil ? ` · late until ${formatDateTime(row.lateUntil)}` : ''}
              </span>
            </span>
          ),
        },
        {
          header: 'Status',
          cell: (row: TeacherRow) => <Badge variant={statusTone(row.state)}>{STATE_LABEL[row.state]}</Badge>,
        },
        {
          header: 'Handed in',
          cell: (row: TeacherRow) =>
            row.state === 'draft' || row.state === 'upcoming' ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="grid gap-0.5">
                <span className="tabular-nums">
                  {row.handedIn} of {list.enrolled}
                </span>
                {row.toGrade > 0 ? (
                  <Link href={`${base}/${row.id}/grade`} className="text-warning text-xs font-medium hover:underline">
                    {row.toGrade} to grade
                  </Link>
                ) : (
                  row.handedIn > 0 && <span className="text-muted-foreground text-xs">All graded</span>
                )}
              </span>
            ),
        },
        ...(list.canTeach
          ? [
              {
                header: '',
                className: 'w-10',
                cell: (row: TeacherRow) => <AssessmentMenu row={row} base={`${base}/${row.id}`} />,
              },
            ]
          : []),
      ]}
      rows={list.rows}
      rowKey={(row) => row.id}
      total={list.total}
      page={page}
      pageSize={pageSize}
      query={query}
      path={base}
      empty={
        filtered
          ? 'Nothing matches. Clear the search or the filters.'
          : 'No assessments yet. Create the first quiz or assignment with New assessment.'
      }
    />
  );
}
