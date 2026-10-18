import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DatabaseIcon, PlusIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../loading';
import { AssessmentMenu, ModeChip, STATE_LABEL, StudentList } from '@/components/assessment-lists';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { NewAssessmentDialog } from '@/components/new-assessment-dialog';
import { PageIcon } from '@/components/page-icon';
import { Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { listTests, type TestList } from '@/lib/data/assessments';
import { formatDateTime, formatDuration, MODE_LABEL, statusTone } from '@/lib/format';
import { ASSESSMENT_MODES, ASSESSMENT_STATES } from '@/lib/schemas/assessment';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Tests' };

const Search = z.object({
  page: pageParam.catch(1),
  view: z.enum(['own', 'take']).optional().catch(undefined),
  q: z.string().trim().max(80).optional().catch(undefined),
  mode: z.enum(ASSESSMENT_MODES).optional().catch(undefined),
  state: z.enum(ASSESSMENT_STATES).optional().catch(undefined),
  new: z.enum(ASSESSMENT_MODES).optional().catch(undefined),
});

export default function TestsPage({ searchParams }: PageProps<'/tests'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Tests searchParams={searchParams} />
    </Suspense>
  );
}

// TP-02: tests outside any course. Staff make and run their own; everyone sees the tests a share link let them into.
async function Tests({ searchParams }: { searchParams: PageProps<'/tests'>['searchParams'] }) {
  const { page, view, q, mode, state, new: open } = Search.parse(await searchParams);
  const list = await listTests(view ?? 'own', { q, mode, state }, page);
  const query = {
    ...(view ? { view } : {}),
    ...(q ? { q } : {}),
    ...(mode ? { mode } : {}),
    ...(state ? { state } : {}),
  };
  const filtered = Boolean(q || mode || state);
  const showPicker = list.canCreate && (
    <NativeSelect name="view" aria-label="Show" defaultValue={list.view}>
      <NativeSelectOption value="own">Tests you run</NativeSelectOption>
      <NativeSelectOption value="take">Tests to take</NativeSelectOption>
    </NativeSelect>
  );
  if (list.view === 'take') {
    return (
      <Section
        icon={<PageIcon name="evaluation" className="size-8" />}
        title="My tests"
        description="Tests a link has let you into. Open one to check your device and start when it opens."
      >
        {showPicker && (
          <FilterForm action="/tests" submitLabel="Show">
            {showPicker}
          </FilterForm>
        )}
        <StudentList
          base="/tests"
          rows={list.rows}
          total={list.total}
          page={page}
          query={query}
          path="/tests"
          empty="No tests yet. Open the link you were sent to join one."
        />
      </Section>
    );
  }
  return (
    <>
      <Section
        icon={<PageIcon name="evaluation" className="size-8" />}
        title="Tests"
        description="Tests outside a course, such as recruitment, placement or entrance tests. Share them by link."
        action={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/tests/bank">
                <DatabaseIcon /> Your question bank
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/tests?${new URLSearchParams({ ...query, new: 'quiz' })}`} scroll={false}>
                <PlusIcon /> New test
              </Link>
            </Button>
          </>
        }
      >
        <FilterForm
          action="/tests"
          submitLabel="Search"
          search={{ name: 'q', label: 'Search tests', placeholder: 'Search tests', defaultValue: q }}
        >
          {showPicker}
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
            <NativeSelectOption value="draft">Draft</NativeSelectOption>
            <NativeSelectOption value="upcoming">Not open yet</NativeSelectOption>
            <NativeSelectOption value="open">Open</NativeSelectOption>
            <NativeSelectOption value="closed">Closed</NativeSelectOption>
            <NativeSelectOption value="results">Results published</NativeSelectOption>
          </NativeSelect>
        </FilterForm>
        <OwnTable list={list} page={page} query={query} filtered={filtered} />
      </Section>
      {open && <NewAssessmentDialog key={open} offeringId={null} mode={open} />}
    </>
  );
}

type OwnList = Extract<TestList, { view: 'own' }>;
type OwnRow = OwnList['rows'][number];

function OwnTable({
  list,
  page,
  query,
  filtered,
}: {
  list: OwnList;
  page: number;
  query: Record<string, string>;
  filtered: boolean;
}) {
  return (
    <DataTable
      bare
      columns={[
        {
          header: 'Test',
          cell: (row: OwnRow) => (
            <span className="grid min-w-48 gap-1">
              <Link href={`/tests/${row.id}/edit`} className="font-medium hover:underline">
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
          cell: (row: OwnRow) => (
            <span className="grid gap-0.5">
              <span className="whitespace-nowrap">
                {formatDateTime(row.opensAt)} – {formatDateTime(row.closesAt)}
              </span>
              <span className="text-muted-foreground text-xs">
                {row.durationMin ? formatDuration(row.durationMin * 60) : 'No time limit'}
              </span>
            </span>
          ),
        },
        {
          header: 'Status',
          cell: (row: OwnRow) => <Badge variant={statusTone(row.state)}>{STATE_LABEL[row.state]}</Badge>,
        },
        {
          header: 'People',
          cell: (row: OwnRow) =>
            row.state === 'draft' ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="grid gap-0.5">
                <span className="tabular-nums">
                  {row.handedIn} handed in · {row.joined} joined
                </span>
                {row.toGrade > 0 && (
                  <Link href={`/tests/${row.id}/grade`} className="text-warning text-xs font-medium hover:underline">
                    {row.toGrade} to grade
                  </Link>
                )}
              </span>
            ),
        },
        {
          header: '',
          className: 'w-10',
          cell: (row: OwnRow) => <AssessmentMenu row={row} base={`/tests/${row.id}`} />,
        },
      ]}
      rows={list.rows}
      rowKey={(row) => row.id}
      total={list.total}
      page={page}
      pageSize={pageSize}
      query={query}
      path="/tests"
      empty={
        filtered
          ? 'Nothing matches. Clear the search or the filters.'
          : 'No tests yet. Make the first one with New test, then share its link.'
      }
    />
  );
}
