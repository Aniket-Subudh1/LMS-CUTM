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
import { StudentList } from '@/components/assessment-lists';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getRecordsGrid, listOfferingAssessments, type RecordCell } from '@/lib/data/assessments';
import { getWorkspace } from '@/lib/data/workspace';
import { formatDateTime, MODE_LABEL } from '@/lib/format';
import { RECORD_MODES } from '@/lib/schemas/assessment';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Records' };

const Search = z.object({
  page: pageParam.catch(1),
  q: z.string().trim().max(80).optional().catch(undefined),
  new: z.enum(RECORD_MODES).optional().catch(undefined),
});

export default function RecordsPage({ params, searchParams }: PageProps<'/courses/[offeringId]/records'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Records params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// T7 (REC-01–REC-04): learning and lab records are assessments of those two modes, built in the same builder. Staff see
// every student against every record; a student sees their own records.
async function Records({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/records'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/records'>['searchParams'];
}) {
  const { offeringId } = await params;
  const { page, q, new: open } = Search.parse(await searchParams);
  const workspace = await getWorkspace(offeringId);
  const base = `/courses/${offeringId}/records`;
  const query: Record<string, string> = q ? { q } : {};
  if (workspace.access === 'learn') {
    const list = await listOfferingAssessments(offeringId, { records: true }, page);
    return (
      <Section
        icon={<PageIcon name="books" className="size-8" />}
        title="Records"
        description="Your lab records and learning record. Write in the editor or upload photos of your notebook."
      >
        <StudentList
          base={`/courses/${offeringId}/assessments`}
          rows={list.view === 'student' ? list.rows : []}
          total={list.total}
          page={page}
          query={{}}
          path={base}
          empty="No records have been set yet."
        />
      </Section>
    );
  }
  const grid = await getRecordsGrid(offeringId, page, q);
  const assessments = `/courses/${offeringId}/assessments`;
  const cell = (value: RecordCell | undefined, recordId: string) => {
    if (!value || value.kind === 'not_yet') return <span className="text-muted-foreground">—</span>;
    if (value.kind === 'missing') return <span className="text-muted-foreground">Missing</span>;
    if (value.kind === 'writing') return <Badge variant="secondary">Writing</Badge>;
    const href = `${assessments}/${recordId}/grade/${value.submissionId}`;
    return value.kind === 'graded' ? (
      <Link href={href} className="text-success font-semibold tabular-nums hover:underline">
        {value.total} / {value.maxMarks}
      </Link>
    ) : (
      <Link href={href} className="hover:underline">
        <Badge variant="warning">To grade</Badge>
      </Link>
    );
  };
  return (
    <>
      <Section
        icon={<PageIcon name="books" className="size-8" />}
        title="Records"
        description="Learning and lab records. Open a cell to read and grade it."
        action={
          grid.canTeach && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`${base}?${new URLSearchParams({ ...query, new: 'lab_record' })}`} scroll={false}>
                  <PlusIcon /> New lab record
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href={`${base}?${new URLSearchParams({ ...query, new: 'learning_record' })}`} scroll={false}>
                  <PlusIcon /> New learning record
                </Link>
              </Button>
            </>
          )
        }
      >
        <FilterForm
          action={base}
          submitLabel="Search"
          search={{ name: 'q', label: 'Search students', placeholder: 'Search roll number or name', defaultValue: q }}
        />
        {grid.columns.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed px-4 py-10 text-center text-sm">
            No records yet. Add a lab record for an experiment, or a learning record for the term or the year. Drafts
            appear here once published.
          </p>
        ) : (
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
              ...grid.columns.map((column) => ({
                header: column.title,
                cell: (row: (typeof grid.rows)[number]) => cell(row.cells[column.id], column.id),
              })),
            ]}
            rows={grid.rows}
            rowKey={(row) => row.id}
            total={grid.total}
            page={page}
            pageSize={pageSize}
            query={query}
            path={base}
            empty={q ? 'No student matches. Clear the search.' : 'Nobody is enrolled in this class yet.'}
          />
        )}
        {grid.columns.length > 0 && (
          <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {grid.columns.map((column) => (
              <li key={column.id}>
                <Link href={`${assessments}/${column.id}/edit`} className="hover:text-foreground">
                  {column.title}
                </Link>{' '}
                · {MODE_LABEL[column.mode]} · closes {formatDateTime(column.lateUntil ?? column.closesAt)}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {grid.canTeach && open && <NewAssessmentDialog key={open} offeringId={offeringId} mode={open} />}
    </>
  );
}
