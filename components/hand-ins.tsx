import Link from 'next/link';
import { notFound } from 'next/navigation';
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
import { publishResults } from '@/app/(app)/courses/[offeringId]/assessments/actions';
import { ActionForm } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { PageIcon } from '@/components/page-icon';
import { Section } from '@/components/section';
import { STATE_LABEL } from '@/components/assessment-lists';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { listSubmissions, type HandIns } from '@/lib/data/assessments';
import { assessmentPath } from '@/lib/domain/test-links';
import { formatDateTime, initials, statusTone } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

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

// T6: the hand-ins, the oldest first, with counts and a search; results are published from here once the window has
// closed and every hand-in is marked (AC-M04-06). Shared by a course's assessments and standalone tests (M04b).
export async function HandInsView({
  params,
  searchParams,
}: {
  params: Promise<{ offeringId?: string; aid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { offeringId, aid } = await params;
  const { page, q, status, late } = Search.parse(await searchParams);
  const list = await listSubmissions(aid, { q, status, late: late === undefined ? undefined : late === 'late' }, page);
  if (list.path !== assessmentPath(offeringId ?? null, aid)) notFound();
  const base = `${list.path}/grade`;
  const query = { ...(q ? { q } : {}), ...(status ? { status } : {}), ...(late ? { late } : {}) };
  const { counts, assessment: a } = list;
  const tiles: { icon: Icon; value: number; label: string }[] = [
    { icon: UsersThreeIcon, value: counts.enrolled, label: offeringId ? 'Enrolled' : 'Joined' },
    { icon: PaperPlaneTiltIcon, value: counts.handedIn, label: 'Handed in' },
    { icon: CheckCircleIcon, value: counts.graded, label: 'Graded' },
    { icon: ClockIcon, value: counts.late, label: 'Late' },
  ];
  const ready = a.status === 'published' && a.state === 'closed';
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`${list.path}/edit`}>
          <ArrowLeftIcon /> {a.title}
        </Link>
      </Button>
      <Section
        icon={<PageIcon name="badge" className="size-8" />}
        title="Hand-ins"
        description="Grade each one. People see marks only when you publish the results."
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
                    message: 'Everyone who handed in sees their marks and your comments, and is told.',
                  }}
                >
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
            label: 'Search people',
            placeholder: offeringId ? 'Search roll number, name or email' : 'Search name or email',
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
              header: offeringId ? 'Student' : 'Name',
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
            ...(offeringId
              ? [
                  {
                    header: 'Roll no.',
                    cell: (row: HandIns['rows'][number]) => (
                      <span className="whitespace-nowrap tabular-nums">{row.student.rollNo}</span>
                    ),
                  },
                ]
              : []),
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
