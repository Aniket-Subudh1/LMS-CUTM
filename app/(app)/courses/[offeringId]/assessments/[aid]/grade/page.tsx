import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  PaperPlaneTiltIcon,
  UsersThreeIcon,
  WarningIcon,
} from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import { z } from 'zod';
import Loading from '../../../../../loading';
import { publishResults } from '../../actions';
import { STATE_LABEL } from '../../student-list';
import { ActionForm } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { PageIcon } from '@/components/page-icon';
import { Section } from '@/components/section';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { listSubmissions, type HandIns } from '@/lib/data/assessments';
import { formatDateTime, initials, statusTone } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Hand-ins' };

const Search = z.object({
  page: pageParam.catch(1),
  q: z.string().trim().max(80).optional().catch(undefined),
  status: z.enum(['to_grade', 'graded', 'in_progress']).optional().catch(undefined),
  late: z.enum(['late', 'on_time']).optional().catch(undefined),
});

const STATUS: Record<HandIns['rows'][number]['status'], { label: string; tone: string }> = {
  in_progress: { label: 'In progress', tone: 'in_progress' },
  submitted: { label: 'To grade', tone: 'to_grade' },
  graded: { label: 'Graded', tone: 'graded' },
};

export default function HandInsPage({
  params,
  searchParams,
}: PageProps<'/courses/[offeringId]/assessments/[aid]/grade'>) {
  return (
    <Suspense fallback={<Loading />}>
      <HandInsView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// T6: the hand-ins, the oldest first, with counts and a search; results are published from here once the window has
// closed and every hand-in is marked (AC-M04-06).
async function HandInsView({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/assessments/[aid]/grade'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/assessments/[aid]/grade'>['searchParams'];
}) {
  const { offeringId, aid } = await params;
  const { page, q, status, late } = Search.parse(await searchParams);
  const list = await listSubmissions(
    offeringId,
    aid,
    { q, status, late: late === undefined ? undefined : late === 'late' },
    page,
  );
  const base = `/courses/${offeringId}/assessments/${aid}/grade`;
  const query = { ...(q ? { q } : {}), ...(status ? { status } : {}), ...(late ? { late } : {}) };
  const { counts, assessment: a } = list;
  const tiles: { icon: Icon; value: number; label: string }[] = [
    { icon: UsersThreeIcon, value: counts.enrolled, label: 'Enrolled' },
    { icon: PaperPlaneTiltIcon, value: counts.handedIn, label: 'Handed in' },
    { icon: CheckCircleIcon, value: counts.graded, label: 'Graded' },
    { icon: ClockIcon, value: counts.late, label: 'Late' },
  ];
  const ready = a.status === 'published' && a.state === 'closed';
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`/courses/${offeringId}/assessments/${aid}/edit`}>
          <ArrowLeftIcon /> {a.title}
        </Link>
      </Button>
      <Section
        icon={<PageIcon name="badge" className="size-8" />}
        title="Hand-ins"
        description="Grade each one. Students see marks only when you publish the results."
        action={
          a.status === 'results_published' ? (
            <Badge variant="success">Results published</Badge>
          ) : (
            <>
              {counts.toGrade > 0 && (
                <span className="text-warning inline-flex items-center gap-1.5 text-xs font-medium">
                  <WarningIcon className="size-4" />
                  {counts.toGrade} still need{counts.toGrade === 1 ? 's' : ''} grading
                </span>
              )}
              {list.canTeach && ready ? (
                <ActionForm
                  action={publishResults}
                  submitLabel="Publish results"
                  submitSize="sm"
                  submitIcon={<PaperPlaneTiltIcon />}
                  confirm={{
                    title: `Publish the results of “${a.title}”?`,
                    message: 'Students who handed in see their marks and your comments, and are told.',
                  }}
                >
                  <input type="hidden" name="offeringId" value={offeringId} />
                  <input type="hidden" name="assessmentId" value={aid} />
                </ActionForm>
              ) : (
                <Badge variant={statusTone(a.state)}>{STATE_LABEL[a.state]}</Badge>
              )}
            </>
          )
        }
      >
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="ring-border/70 flex items-center gap-3 rounded-md px-3.5 py-3 ring-1">
              <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md">
                <tile.icon className="size-4.5" />
              </span>
              <div className="grid min-w-0">
                <dd className="text-lg leading-tight font-semibold tabular-nums">{tile.value}</dd>
                <dt className="text-muted-foreground order-first truncate text-xs">{tile.label}</dt>
              </div>
            </div>
          ))}
        </dl>
        {a.status === 'published' && !ready && (
          <p className="text-muted-foreground text-[0.8125rem]">
            Results can be published once it closes and every hand-in is graded.{' '}
            {counts.inProgress > 0 && `${counts.inProgress} still writing.`}
          </p>
        )}
        <FilterForm
          action={base}
          submitLabel="Search"
          search={{
            name: 'q',
            label: 'Search students',
            placeholder: 'Search roll number, name or email',
            defaultValue: q,
          }}
        >
          <NativeSelect name="status" aria-label="Status" defaultValue={status ?? ''}>
            <NativeSelectOption value="">All hand-ins</NativeSelectOption>
            <NativeSelectOption value="to_grade">To grade</NativeSelectOption>
            <NativeSelectOption value="graded">Graded</NativeSelectOption>
            <NativeSelectOption value="in_progress">Still writing</NativeSelectOption>
          </NativeSelect>
          <NativeSelect name="late" aria-label="Late" defaultValue={late ?? ''}>
            <NativeSelectOption value="">Late or on time</NativeSelectOption>
            <NativeSelectOption value="late">Late</NativeSelectOption>
            <NativeSelectOption value="on_time">On time</NativeSelectOption>
          </NativeSelect>
        </FilterForm>
        <DataTable
          bare
          columns={[
            {
              header: 'Student',
              cell: (row) => (
                <span className="flex min-w-48 items-center gap-3">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-[0.6875rem] font-semibold">
                      {initials(row.student.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid min-w-0">
                    <span className="truncate font-semibold">{row.student.name}</span>
                    <span className="text-muted-foreground truncate text-xs">{row.student.email}</span>
                  </span>
                </span>
              ),
            },
            {
              header: 'Roll no.',
              cell: (row) => <span className="whitespace-nowrap tabular-nums">{row.student.rollNo}</span>,
            },
            { header: 'Attempt', cell: (row) => <span className="tabular-nums">{row.attemptNo}</span> },
            {
              header: 'Handed in',
              cell: (row) => (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="whitespace-nowrap">{row.submittedAt ? formatDateTime(row.submittedAt) : '—'}</span>
                  {row.late && <Badge variant="warning">Late</Badge>}
                  {row.autoSubmitted && <Badge variant="secondary">By the timer</Badge>}
                </span>
              ),
            },
            {
              header: 'Status',
              cell: (row) => <Badge variant={statusTone(STATUS[row.status].tone)}>{STATUS[row.status].label}</Badge>,
            },
            {
              header: 'Total',
              cell: (row) =>
                row.total === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <b className="whitespace-nowrap tabular-nums">
                    {row.total} / {a.maxMarks}
                  </b>
                ),
            },
            {
              header: '',
              className: 'w-20',
              cell: (row) =>
                row.status === 'in_progress' ? null : (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`${base}/${row.id}`}>
                      {row.status === 'submitted' && list.canTeach ? 'Grade' : 'Open'}
                    </Link>
                  </Button>
                ),
            },
          ]}
          rows={list.rows}
          rowKey={(row) => row.id}
          total={list.total}
          page={page}
          pageSize={pageSize}
          query={query}
          path={base}
          empty={
            q || status || late ? 'Nothing matches. Clear the search or the filters.' : 'Nobody has handed in yet.'
          }
        />
      </Section>
    </>
  );
}
