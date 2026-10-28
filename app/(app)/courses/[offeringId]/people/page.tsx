import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  DownloadSimpleIcon,
  FileArrowUpIcon,
  UserMinusIcon,
  UserPlusIcon,
} from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../../loading';
import { addStudent, changeEnrollments, setEnrollmentStatus } from '../../actions';
import { requestEngagement } from './actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { DataTable } from '@/components/data-table';
import { EngagementMark } from '@/components/engagement-mark';
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
import type { EngagementSignals } from '@/lib/domain/engagement';
import { istDateToDate } from '@/lib/domain/time';
import {
  BAND_LABEL,
  ENGAGEMENT_TREND_LABEL,
  formatDate,
  formatDateTime,
  formatPct,
  initials,
  SIGNAL_LABEL,
  statusTone,
} from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';
import {
  ENGAGEMENT_BANDS,
  ENGAGEMENT_SIGNALS,
  ENGAGEMENT_TRENDS,
  EngagementBand,
  EngagementTrend,
} from '@/lib/schemas/engagement';

export const metadata: Metadata = { title: 'People' };

const Search = z.object({
  page: pageParam.catch(1),
  q: z.string().trim().max(80).optional().catch(undefined),
  status: z.enum(['active', 'dropped']).optional().catch(undefined),
  // M10 T4: the nightly engagement snapshot's band and trend, and the lowest score first.
  band: EngagementBand.optional().catch(undefined),
  trend: EngagementTrend.optional().catch(undefined),
  sort: z.literal('engagement').optional().catch(undefined),
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
  const { page, q, status, band, trend, sort, new: open } = Search.parse(await searchParams);
  const [workspace, roster] = await Promise.all([
    getWorkspace(offeringId),
    listRoster(offeringId, page, { q, status, band, trend, sort }),
  ]);
  const base = `/courses/${offeringId}/people`;
  const filters = {
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
    ...(band ? { band } : {}),
    ...(trend ? { trend } : {}),
    ...(sort ? { sort } : {}),
  };
  const query = { ...filters, ...(page > 1 ? { page: String(page) } : {}) };
  // A dialog opens over the list as it is: closing it leaves the search, filter and page in place.
  const dialog = (name: string) => `${base}?${new URLSearchParams({ ...query, new: name })}`;
  const { counts } = roster;
  const tiles: { icon: ReactNode; value: number; label: string; tone?: string; href?: string }[] = [
    { icon: <PageIcon name="students" className="size-7" />, value: counts.enrolled, label: 'Enrolled' },
    { icon: <PageIcon name="complete" className="size-7" />, value: counts.active, label: 'Active' },
    { icon: <PageIcon name="dropping" className="size-7" />, value: counts.dropped, label: 'Dropped' },
    ...(counts.short === null || roster.minPct === null
      ? []
      : [
          {
            icon: <PageIcon name="attendance" className="size-7" />,
            value: counts.short,
            label: `Below ${formatPct(roster.minPct)} attendance`,
            tone: counts.short > 0 ? 'text-warning' : undefined,
          },
        ]),
    // AC-M10-02: one click lists the students in the low band.
    ...(roster.engagementAt
      ? [
          {
            icon: <PageIcon name="engagement" className="size-7" />,
            value: counts.lowEngagement,
            label: 'Low engagement',
            tone: counts.lowEngagement > 0 ? 'text-destructive' : undefined,
            href: `${base}?${new URLSearchParams({ band: 'low', status: 'active' })}`,
          },
        ]
      : []),
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
        <dl
          className={cn(
            'grid grid-cols-2 gap-3',
            tiles.length >= 5 ? 'lg:grid-cols-5' : tiles.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
          )}
        >
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className={cn(
                'ring-border/70 relative flex items-center gap-3 rounded-md px-3.5 py-3 ring-1',
                tile.href && 'hover:bg-muted/50 transition-colors',
              )}
            >
              <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md">
                {tile.icon}
              </span>
              <div className="grid min-w-0">
                <dd className={cn('text-lg leading-tight font-semibold tabular-nums', tile.tone)}>{tile.value}</dd>
                <dt className="text-muted-foreground order-first truncate text-xs">
                  {tile.href ? (
                    <Link href={tile.href} className="after:absolute after:inset-0 after:rounded-md">
                      {tile.label}
                    </Link>
                  ) : (
                    tile.label
                  )}
                </dt>
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
          <NativeSelect name="band" aria-label="Engagement" defaultValue={band ?? ''}>
            <NativeSelectOption value="">Any engagement</NativeSelectOption>
            {ENGAGEMENT_BANDS.map((b) => (
              <NativeSelectOption key={b} value={b}>
                {BAND_LABEL[b]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect name="trend" aria-label="Trend" defaultValue={trend ?? ''}>
            <NativeSelectOption value="">Any trend</NativeSelectOption>
            {ENGAGEMENT_TRENDS.map((t) => (
              <NativeSelectOption key={t} value={t}>
                {ENGAGEMENT_TREND_LABEL[t]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect name="sort" aria-label="Order" defaultValue={sort ?? ''}>
            <NativeSelectOption value="">By roll number</NativeSelectOption>
            <NativeSelectOption value="engagement">Lowest engagement first</NativeSelectOption>
          </NativeSelect>
        </FilterForm>
        <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
          <p>
            {roster.engagementAt
              ? `Engagement looks at the last ${roster.engagementDays} days, worked out ${formatDateTime(roster.engagementAt)}. Open a student to see the numbers behind it.`
              : 'Engagement is worked out each night; it shows here after the first run.'}
          </p>
          {workspace.canTeach && (
            <ActionForm
              action={requestEngagement}
              submitLabel="Work it out again"
              submitVariant="outline"
              submitSize="sm"
              submitIcon={<ArrowClockwiseIcon />}
              successMessage="Queued. The new scores show here within a minute."
            >
              <input type="hidden" name="offeringId" value={offeringId} />
            </ActionForm>
          )}
        </div>
        <DataTable
          columns={columns(roster, workspace)}
          rows={roster.rows}
          rowKey={(s) => s.id}
          total={roster.total}
          page={page}
          pageSize={pageSize}
          query={filters}
          path={base}
          empty={
            Object.keys(filters).length > 0
              ? 'No student matches. Clear the search or the filters.'
              : 'Nobody is enrolled in this class yet.'
          }
          bare
        />
      </Section>

      <Section
        icon={<PageIcon name="faculty" className="size-8" />}
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
  // M10 T4 (ENG-02, DSH-01): the nightly snapshot's score, band and trend, and its five signals.
  const engagement: Column[] = [
    {
      header: 'Engagement',
      cell: (s) =>
        s.engagement ? (
          <EngagementMark score={s.engagement.score} band={s.engagement.band} trend={s.engagement.trend} />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: 'Signals',
      cell: (s) =>
        s.engagement ? (
          <span className="flex items-end gap-1" aria-label={signalSummary(s.engagement.signals)} role="img">
            {ENGAGEMENT_SIGNALS.map((signal) => {
              const value = s.engagement?.signals[signal] ?? null;
              return (
                <span
                  key={signal}
                  title={`${SIGNAL_LABEL[signal]}: ${value === null ? 'does not apply' : formatPct(Math.round(100 * value))}`}
                  className="bg-muted relative h-5 w-1.5 overflow-hidden rounded-sm"
                >
                  {value !== null && (
                    <span className="bg-primary absolute inset-x-0 bottom-0" style={{ height: `${100 * value}%` }} />
                  )}
                </span>
              );
            })}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    ...(publishedLessons === null
      ? [
          {
            header: 'Last active',
            cell: (s: RosterRow) =>
              s.lastActiveDay ? (
                <span className="whitespace-nowrap">{formatDate(istDateToDate(s.lastActiveDay))}</span>
              ) : (
                'Not yet'
              ),
          },
        ]
      : []),
  ];
  return [
    {
      header: 'Student',
      cell: (s) => (
        <Link
          href={`/courses/${workspace.id}/people/${s.studentId}`}
          className={cn('group flex min-w-48 items-center gap-3', s.status === 'dropped' && 'opacity-60')}
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-primary text-[0.6875rem] font-semibold">
              {initials(s.name)}
            </AvatarFallback>
          </Avatar>
          <span className="grid min-w-0">
            <span className="truncate font-semibold group-hover:underline">{s.name}</span>
            <span className="text-muted-foreground truncate text-xs">{s.email}</span>
          </span>
        </Link>
      ),
    },
    { header: 'Roll no.', cell: (s) => <span className="whitespace-nowrap tabular-nums">{s.rollNo}</span> },
    ...engagement,
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

const signalSummary = (signals: EngagementSignals) =>
  ENGAGEMENT_SIGNALS.map((signal) => {
    const value = signals[signal];
    return `${SIGNAL_LABEL[signal]} ${value === null ? 'does not apply' : formatPct(Math.round(100 * value))}`;
  }).join(', ');

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
      icon={<PageIcon name="students" className="size-8" />}
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
