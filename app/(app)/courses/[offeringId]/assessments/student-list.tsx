import Link from 'next/link';
import { MODE_ICON } from './new-assessment-dialog';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AssessmentList, AssessmentSummary, DisplayState, MyAttempts } from '@/lib/data/assessments';
import { formatDateTime, formatDue, formatDuration, MODE_LABEL, statusTone } from '@/lib/format';
import { pageSize } from '@/lib/schemas/common';

type Row = Extract<AssessmentList, { view: 'student' }>['rows'][number];

export const STATE_LABEL: Record<DisplayState, string> = {
  draft: 'Draft',
  upcoming: 'Not open yet',
  open: 'Open',
  late: 'Late hand-ins',
  closed: 'Closed',
  results: 'Results published',
};

export function ModeChip({ mode }: { mode: AssessmentSummary['mode'] }) {
  const ModeIcon = MODE_ICON[mode];
  return (
    <span className="bg-muted inline-flex w-fit items-center gap-1 rounded-sm px-1.5 py-px text-[0.6875rem] font-medium">
      <ModeIcon className="size-3" /> {MODE_LABEL[mode]}
    </span>
  );
}

const YOU: Record<MyAttempts['status'], string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Handed in',
  graded: 'Graded',
};

// When it is due, in the words a student needs (the mock-ups' Due column).
export function Due({ row, now }: { row: AssessmentSummary; now: Date }) {
  const end = row.lateUntil ?? row.closesAt;
  const [first, second] =
    row.state === 'upcoming'
      ? [`Opens ${formatDateTime(row.opensAt)}`, `Closes ${formatDateTime(row.closesAt)}`]
      : row.state === 'open'
        ? [formatDue(row.closesAt, now), formatDateTime(row.closesAt)]
        : row.state === 'late'
          ? ['Late hand-ins only', `Until ${formatDateTime(end)}`]
          : ['Closed', formatDateTime(end)];
  return (
    <span className="grid gap-0.5">
      <span className={row.state === 'open' || row.state === 'late' ? 'text-warning font-medium' : undefined}>
        {first}
      </span>
      <span className="text-muted-foreground text-xs">{second}</span>
    </span>
  );
}

// T5, T7: a student's assessments (or records) with their own status, and marks once results are published.
export function StudentList({
  offeringId,
  rows,
  total,
  page,
  query,
  path,
  empty,
}: {
  offeringId: string;
  rows: Row[];
  total: number;
  page: number;
  query: Record<string, string>;
  path: string;
  empty: string;
}) {
  const now = new Date();
  return (
    <DataTable
      bare
      columns={[
        {
          header: 'Assessment',
          cell: (row: Row) => (
            <span className="grid min-w-48 gap-1">
              <Link href={`/courses/${offeringId}/assessments/${row.id}`} className="font-medium hover:underline">
                {row.title}
              </Link>
              <span className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                <ModeChip mode={row.mode} />
                {row.durationMin ? `${formatDuration(row.durationMin * 60)} · ` : ''}
                {row.maxMarks} marks
              </span>
            </span>
          ),
        },
        { header: 'Due', cell: (row: Row) => <Due row={row} now={now} /> },
        {
          header: 'You',
          cell: (row: Row) =>
            row.state === 'upcoming' ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <Badge variant={statusTone(row.mine.status)}>{YOU[row.mine.status]}</Badge>
            ),
        },
        {
          header: 'Marks',
          cell: (row: Row) =>
            row.mine.counted === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <b className="font-semibold whitespace-nowrap tabular-nums">
                {row.mine.counted} / {row.maxMarks}
              </b>
            ),
        },
        {
          header: '',
          className: 'w-24',
          cell: (row: Row) => (
            <Button asChild variant="outline" size="sm">
              <Link href={`/courses/${offeringId}/assessments/${row.id}`}>
                {row.mine.counted !== null ? 'See marks' : row.mine.status === 'in_progress' ? 'Continue' : 'Open'}
              </Link>
            </Button>
          ),
        },
      ]}
      rows={rows}
      rowKey={(row) => row.id}
      total={total}
      page={page}
      pageSize={pageSize}
      query={query}
      path={path}
      empty={empty}
    />
  );
}
