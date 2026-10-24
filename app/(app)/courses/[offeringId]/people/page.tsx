import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  DownloadSimpleIcon,
  FileArrowUpIcon,
  UserMinusIcon,
  UserPlusIcon,
  UsersThreeIcon,
  WarningIcon,
} from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import { z } from 'zod';
import Loading from '../../../loading';
import { addStudent, changeEnrollments, setEnrollmentStatus } from '../../actions';
import { Field, FieldErrors } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { FormDialog } from '@/components/form-dialog';
import { PageIcon } from '@/components/page-icon';
import { RowMenu } from '@/components/row-menu';
import { Section } from '@/components/section';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/cn';
import { getWorkspace, listRoster, type Roster, type RosterRow, type Workspace } from '@/lib/data/workspace';
import { formatDateTime, formatPct, initials, statusTone } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'People' };

const Search = z.object({
  page: pageParam.catch(1),
  q: z.string().trim().max(80).optional().catch(undefined),
  status: z.enum(['active', 'dropped']).optional().catch(undefined),
  // The dialog to show: student, csv (URL-driven, M03b).
  new: z.string().max(20).optional().catch(undefined),
});

export default function PeoplePage({ params, searchParams }: PageProps<'/courses/[offeringId]/people'>) {
  return (
    <Suspense fallback={<Loading />}>
      <People params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// Round 4 (M03b T7): the students with number tiles, a search and status filter, and a ⋮ per row to drop or add again;
// "Add student" and "Upload CSV" for the class's teachers and admins; then who teaches the class.
async function People({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/people'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/people'>['searchParams'];
}) {
  const { offeringId } = await params;
  const { page, q, status, new: open } = Search.parse(await searchParams);
  const [workspace, roster] = await Promise.all([
    getWorkspace(offeringId),
    listRoster(offeringId, page, { q, status }),
  ]);
  const base = `/courses/${offeringId}/people`;
  const query = { ...(q ? { q } : {}), ...(status ? { status } : {}), ...(page > 1 ? { page: String(page) } : {}) };
  // A dialog opens over the list as it is: closing it leaves the search, filter and page in place.
  const dialog = (name: string) => `${base}?${new URLSearchParams({ ...query, new: name })}`;
  const { counts } = roster;
  const tiles: { icon: Icon; value: number; label: string; tone?: string }[] = [
    { icon: UsersThreeIcon, value: counts.enrolled, label: 'Enrolled' },
    { icon: CheckIcon, value: counts.active, label: 'Active' },
    { icon: UserMinusIcon, value: counts.dropped, label: 'Dropped' },
    ...(counts.short === null || roster.minPct === null
      ? []
      : [
          {
            icon: WarningIcon,
            value: counts.short,
            label: `Below ${formatPct(roster.minPct)} attendance`,
            tone: counts.short > 0 ? 'text-warning' : undefined,
          },
        ]),
  ];
  return (
    <div className="grid gap-5">
      <Section
        icon={<PageIcon name="people" className="size-8" />}
        title="Students"
        description={
          workspace.canTeach
            ? 'Everyone enrolled in this class. Add one by roll number or email, or upload a list.'
            : 'Everyone enrolled in this class.'
        }
        action={
          workspace.canTeach && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={dialog('csv')} scroll={false}>
                  <FileArrowUpIcon /> Upload CSV
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href={dialog('student')} scroll={false}>
                  <UserPlusIcon /> Add student
                </Link>
              </Button>
            </>
          )
        }
      >
        <dl className={cn('grid grid-cols-2 gap-3', tiles.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
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
            <NativeSelectOption value="">Any status</NativeSelectOption>
            <NativeSelectOption value="active">Active</NativeSelectOption>
            <NativeSelectOption value="dropped">Dropped</NativeSelectOption>
          </NativeSelect>
        </FilterForm>
        <DataTable
          columns={columns(roster, workspace)}
          rows={roster.rows}
          rowKey={(s) => s.id}
          total={roster.total}
          page={page}
          pageSize={pageSize}
          query={{ ...(q ? { q } : {}), ...(status ? { status } : {}) }}
          path={base}
          empty={
            q || status
              ? 'No student matches. Clear the search or the filter.'
              : 'Nobody is enrolled in this class yet.'
          }
          bare
        />
      </Section>

      <Section
        icon={<PageIcon name="users" className="size-8" />}
        title="Teaching staff"
        description="Who teaches this class. An administrator changes this from Offerings."
      >
        {workspace.faculty.length === 0 ? (
          <p className="text-muted-foreground text-[0.8125rem]">No faculty assigned yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {workspace.faculty.map((person) => (
              <li key={person.id} className="flex min-w-0 items-center gap-3">
                <Avatar className="size-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {initials(person.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="grid min-w-0">
                  <span className="truncate text-[0.8125rem] font-semibold">{person.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {person.coordinator ? 'Faculty · course coordinator' : 'Faculty'} · {person.email}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {workspace.canTeach && open === 'student' && <AddStudentDialog key={open} offeringId={offeringId} />}
      {workspace.canTeach && open === 'csv' && <CsvDialog key={open} offeringId={offeringId} />}
    </div>
  );
}

function columns(roster: Roster, workspace: Workspace) {
  type Column = { header: string; cell: (s: RosterRow) => ReactNode; className?: string };
  const { publishedLessons } = roster;
  // T9 (SKL-02, SKL-04): on a skill course, attendance is completed lessons over published lessons.
  const skill: Column[] =
    publishedLessons === null
      ? []
      : [
          {
            header: 'Lessons done',
            cell: (s) => (
              <span className="tabular-nums">
                {s.skill?.completed ?? 0} / {publishedLessons}
              </span>
            ),
          },
          { header: 'Attendance', cell: (s) => <Share pct={s.skill?.attendancePct ?? null} /> },
          { header: 'Watched', cell: (s) => <span className="tabular-nums">{s.skill?.watchedMin ?? 0} min</span> },
          // SKL-02 (M04 T9): quizzes with at least one attempt, and the average of those with published results.
          {
            header: 'Quizzes attempted',
            cell: (s) => <span className="tabular-nums">{s.skill?.quizzesAttempted ?? 0}</span>,
          },
          { header: 'Quiz average', cell: (s) => <Share pct={s.skill?.quizAvgPct ?? null} /> },
          {
            header: 'Last active',
            cell: (s) =>
              s.skill?.lastActiveAt ? (
                <span className="whitespace-nowrap">{formatDateTime(s.skill.lastActiveAt)}</span>
              ) : (
                'Not yet'
              ),
          },
        ];
  // M03 T9 (ATT-02): on a credit course, each student's share of the finished live classes they attended.
  const live: Column[] =
    publishedLessons === null
      ? [
          {
            header: 'Live attendance',
            cell: (s) => (
              <Share
                pct={s.live?.pct ?? null}
                detail={s.live && s.live.held > 0 ? `${s.live.attended}/${s.live.held}` : undefined}
                short={s.live?.pct != null && roster.minPct !== null && s.live.pct < roster.minPct}
              />
            ),
          },
        ]
      : [];
  return [
    {
      header: 'Student',
      cell: (s) => (
        <span className={cn('flex min-w-48 items-center gap-3', s.status === 'dropped' && 'opacity-60')}>
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-primary text-[0.6875rem] font-semibold">
              {initials(s.name)}
            </AvatarFallback>
          </Avatar>
          <span className="grid min-w-0">
            <span className="truncate font-semibold">{s.name}</span>
            <span className="text-muted-foreground truncate text-xs">{s.email}</span>
          </span>
        </span>
      ),
    },
    { header: 'Roll no.', cell: (s) => <span className="whitespace-nowrap tabular-nums">{s.rollNo}</span> },
    ...live,
    ...skill,
    { header: 'Status', cell: (s) => <Badge variant={statusTone(s.status)}>{s.status}</Badge> },
    ...(workspace.canTeach
      ? [{ header: '', className: 'w-10', cell: (s: RosterRow) => <StudentMenu row={s} offeringId={workspace.id} /> }]
      : []),
  ] satisfies Column[];
}

function Share({ pct, detail, short = false }: { pct: number | null; detail?: string; short?: boolean }) {
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex min-w-32 items-center gap-2">
      <Progress value={pct} className="bg-muted h-1.5 w-16" aria-hidden="true" />
      <span className={cn('tabular-nums', short && 'text-warning font-medium')}>{formatPct(pct)}</span>
      {detail && <span className="text-muted-foreground text-xs tabular-nums">{detail}</span>}
    </span>
  );
}

// Dropping keeps the student's progress and attendance; they can be added again until marks are locked.
function StudentMenu({ row, offeringId }: { row: RosterRow; offeringId: string }) {
  const fields = { offeringId, enrollmentId: row.id };
  return (
    <RowMenu
      label={row.name}
      items={[
        row.status === 'active'
          ? {
              kind: 'action',
              label: 'Drop from the class',
              icon: <UserMinusIcon />,
              destructive: true,
              action: setEnrollmentStatus,
              fields: { ...fields, status: 'dropped' },
              confirm: {
                title: `Drop ${row.name}?`,
                message:
                  'They leave the class now. Their progress and attendance are kept, and you can add them again.',
                confirmLabel: 'Drop',
                destructive: true,
              },
            }
          : {
              kind: 'action',
              label: 'Add again',
              icon: <ArrowCounterClockwiseIcon />,
              action: setEnrollmentStatus,
              fields: { ...fields, status: 'active' },
            },
      ]}
    />
  );
}

function AddStudentDialog({ offeringId }: { offeringId: string }) {
  return (
    <FormDialog
      openParam="student"
      icon={<PageIcon name="users" className="size-8" />}
      title="Add a student"
      description="They see the course at once. A student who was dropped is added again."
      action={addStudent}
      submitLabel="Add student"
      successMessage="Student added."
    >
      <input type="hidden" name="offeringId" value={offeringId} />
      <Field name="who" label="Roll number or email" hint="For example 2501CSE004 or a.student@cutm.ac.in">
        <Input name="who" required maxLength={254} autoComplete="off" />
      </Field>
    </FormDialog>
  );
}

function CsvDialog({ offeringId }: { offeringId: string }) {
  return (
    <FormDialog
      openParam="csv"
      icon={<PageIcon name="imports" className="size-8" />}
      title="Upload a list of changes"
      description="A CSV with the columns rollNo and action (add or drop). If any row is wrong, nothing is changed and every wrong row is listed."
      action={changeEnrollments}
      submitLabel="Apply changes"
      successMessage="Enrolment updated."
    >
      <input type="hidden" name="offeringId" value={offeringId} />
      <Button asChild variant="outline" size="sm" className="w-fit">
        <a href="/samples/enrolment-changes.csv" download>
          <DownloadSimpleIcon /> Download sample CSV
        </a>
      </Button>
      <Field name="file" label="CSV file">
        <Input name="file" type="file" accept=".csv,text/csv" required />
      </Field>
      <FieldErrors name="offeringId" />
    </FormDialog>
  );
}
