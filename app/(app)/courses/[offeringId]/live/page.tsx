import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowCounterClockwiseIcon,
  ArrowRightIcon,
  ArrowSquareOutIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../../loading';
import { cancelSession, deleteSession, restoreSession } from './actions';
import { SessionDialog } from './session-dialog';
import { BarChart } from '@/components/bar-chart';
import { DataTable, EmptyState, PageNav } from '@/components/data-table';
import { DateTile } from '@/components/date-tile';
import { LinkSpinner } from '@/components/link-spinner';
import { PageIcon } from '@/components/page-icon';
import { RowMenu, type RowMenuItem } from '@/components/row-menu';
import { Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/cn';
import { START_EARLY_MS, listSessions, type LiveSessionRow, type PastSession, type SessionList } from '@/lib/data/live';
import { attendancePct } from '@/lib/domain/attendance';
import { istDateToDate, istDayKey, istTimeOfDay } from '@/lib/domain/time';
import { formatDay, formatDuration, formatPct, formatTime } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Live classes' };

// `page` pages the past classes, `up` the upcoming ones.
const Search = z.object({ page: pageParam.catch(1), up: pageParam.catch(1) });
const dayMonth = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
const DAY_MS = 86_400_000;

export default function LivePage({ params, searchParams }: PageProps<'/courses/[offeringId]/live'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Live params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Live({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/live'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/live'>['searchParams'];
}) {
  const { offeringId } = await params;
  const { page, up } = Search.parse(await searchParams);
  const list = await listSessions(offeringId, page, up);
  const base = `/courses/${offeringId}/live`;
  const now = new Date();
  const staff = list.view !== 'student';
  // Round 4 (M03b): upcoming classes beside attendance per class, then the past classes.
  return (
    <div className="grid gap-5">
      {list.mine && <MyAttendance mine={list.mine} />}
      {list.live.map((session) => (
        <LiveNow key={session.id} session={session} list={list} href={`${base}/${session.id}`} />
      ))}
      <div className={cn('grid items-start gap-5', staff && 'xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]')}>
        <Upcoming list={list} offeringId={offeringId} base={base} now={now} page={page} up={up} />
        {staff && <AttendancePerClass list={list} />}
      </div>
      <Past list={list} offeringId={offeringId} base={base} page={page} up={up} />
    </div>
  );
}

function MyAttendance({ mine }: { mine: NonNullable<SessionList['mine']> }) {
  return (
    <section className="surface grid gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="icon-chip size-10 [&_svg]:size-5">
            <PageIcon name="attendance" className="size-8" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Your attendance in live classes</h2>
            <p className="text-muted-foreground text-sm">
              {mine.held === 0
                ? 'Shown once your first class has finished.'
                : `Present in ${mine.attended} of ${mine.held} ${mine.held === 1 ? 'class' : 'classes'}.`}
            </p>
          </div>
        </div>
        {mine.pct !== null && <span className="text-3xl font-semibold tabular-nums">{formatPct(mine.pct)}</span>}
      </div>
      {mine.pct !== null && <Progress value={mine.pct} className="bg-muted h-2.5" aria-label="Live-class attendance" />}
    </section>
  );
}

function LiveNow({ session, list, href }: { session: SessionList['live'][number]; list: SessionList; href: string }) {
  // Students, teachers and admins join (09 §2), in a tab of its own like a video call (M03b); a head of department
  // follows the class from its page. Staff also keep the class page, where attendance is taken.
  const joins = list.view === 'student' || list.canManage;
  return (
    <section className="from-primary flex flex-wrap items-center justify-between gap-4 rounded-lg bg-linear-to-r to-[oklch(0.45_0.2_263)] p-5 text-white sm:p-6">
      <div className="grid gap-1">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-sm bg-white/15 px-2 py-0.5 text-xs font-medium">
          <span className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" />
          Live now
        </span>
        <h2 className="text-lg font-semibold">{session.title}</h2>
        <p className="text-sm text-white/80">
          Started {formatTime(session.startedAt ?? session.scheduledStart)}
          {list.view !== 'student' && ` · ${session.inClass} of ${list.enrolled} students in class`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {joins && list.view !== 'student' && (
          <Button asChild variant="ghost" className="text-white hover:bg-white/15 hover:text-white">
            <Link href={href}>
              Attendance <LinkSpinner />
            </Link>
          </Button>
        )}
        <Button asChild className="text-primary bg-white hover:bg-white/90">
          {joins ? (
            <a href={`${href}/room`} target="_blank" rel="noopener">
              Join class <ArrowSquareOutIcon />
            </a>
          ) : (
            <Link href={href}>
              Open <ArrowRightIcon />
              <LinkSpinner />
            </Link>
          )}
        </Button>
      </div>
    </section>
  );
}

// "Today", "Tomorrow" or "In 4 days", by IST calendar day.
function dayWord(start: Date, now: Date) {
  const days = Math.round(
    (istDateToDate(istDayKey(start)).getTime() - istDateToDate(istDayKey(now)).getTime()) / DAY_MS,
  );
  return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
}

function Upcoming({
  list,
  offeringId,
  base,
  now,
  page,
  up,
}: {
  list: SessionList;
  offeringId: string;
  base: string;
  now: Date;
  page: number;
  up: number;
}) {
  return (
    <Section
      icon={<PageIcon name="live" className="size-8" />}
      title="Upcoming classes"
      description={
        list.canManage
          ? 'Students are told when you schedule, change or cancel a class. Start one from 15 minutes before.'
          : 'Classes your teacher has scheduled. You can join once the class starts.'
      }
      action={
        list.canManage && (
          <SessionDialog
            offeringId={offeringId}
            category={list.category}
            thresholdPct={list.thresholdPct}
            next={list.next}
            trigger={
              <Button size="sm">
                <PlusIcon /> Schedule a class
              </Button>
            }
          />
        )
      }
    >
      {list.upcoming.length === 0 ? (
        <EmptyState
          icon={<PageIcon name="live" className="size-8" />}
          text={
            list.canManage
              ? 'No classes scheduled. Schedule the next one — students are told straight away.'
              : 'No classes scheduled yet.'
          }
        />
      ) : (
        <ul className="divide-border/70 grid divide-y">
          {list.upcoming.map((session) => (
            <UpcomingRow key={session.id} session={session} list={list} offeringId={offeringId} base={base} now={now} />
          ))}
        </ul>
      )}
      {list.upcomingTotal > pageSize && (
        <PageNav
          shown={list.upcoming.length}
          total={list.upcomingTotal}
          page={up}
          pageSize={pageSize}
          query={{ page: String(page) }}
          path={base}
          param="up"
          className="border-t pt-3"
        />
      )}
    </Section>
  );
}

function UpcomingRow({
  session,
  list,
  offeringId,
  base,
  now,
}: {
  session: LiveSessionRow;
  list: SessionList;
  offeringId: string;
  base: string;
  now: Date;
}) {
  const cancelled = session.state === 'cancelled';
  const startable = !cancelled && now.getTime() >= session.scheduledStart.getTime() - START_EARLY_MS;
  const ref = { offeringId, sessionId: session.id };
  const mode =
    list.category === 'skill' || session.attendanceMode === 'derived'
      ? 'attendance from time in the room'
      : 'attendance taken in class';
  const items: RowMenuItem[] = cancelled
    ? [
        {
          kind: 'action',
          label: 'Restore',
          icon: <ArrowCounterClockwiseIcon />,
          action: restoreSession,
          fields: ref,
          confirm: {
            title: `Restore “${session.title}”?`,
            message: `It goes back on the timetable for ${formatDay(session.scheduledStart)} and your students are told.`,
            confirmLabel: 'Restore',
          },
        },
        { kind: 'separator' },
        {
          kind: 'action',
          label: 'Delete',
          icon: <TrashIcon />,
          destructive: true,
          action: deleteSession,
          fields: ref,
          confirm: {
            title: `Delete “${session.title}”?`,
            message: 'The cancelled class is removed for good. It never ran, so no attendance is lost.',
            confirmLabel: 'Delete class',
            destructive: true,
          },
        },
      ]
    : [
        {
          kind: 'link',
          label: startable ? 'Start class' : 'Open class page',
          href: `${base}/${session.id}`,
          icon: <PlayIcon />,
        },
        { kind: 'separator' },
        {
          kind: 'action',
          label: 'Cancel class',
          icon: <XIcon />,
          action: cancelSession,
          fields: ref,
          confirm: {
            title: 'Cancel this class?',
            message: `“${session.title}” on ${formatDay(session.scheduledStart)} is cancelled and your students are told. You can restore it while its time is ahead.`,
            confirmLabel: 'Cancel class',
          },
        },
        { kind: 'disabled', label: 'Delete', icon: <TrashIcon />, reason: 'Cancel it first, so students are told.' },
      ];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
      <DateTile date={session.scheduledStart} tone={cancelled ? 'past' : 'live'} withMonth />
      <span className="grid min-w-44 flex-1 gap-0.5">
        <Link
          href={`${base}/${session.id}`}
          className={cn(
            'text-[0.8125rem] font-semibold hover:underline',
            cancelled && 'text-muted-foreground line-through',
          )}
        >
          {session.title}
        </Link>
        <span className="text-muted-foreground text-xs">
          {formatTime(session.scheduledStart)} – {formatTime(session.scheduledEnd)}
          {list.canManage && ` · ${mode}`}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <Badge variant={cancelled ? 'outline' : startable && list.canManage ? 'success' : 'secondary'}>
          {cancelled
            ? 'Cancelled'
            : startable && list.canManage
              ? 'You can start it now'
              : dayWord(session.scheduledStart, now)}
        </Badge>
        {list.canManage && startable && (
          <Button asChild size="sm">
            <Link href={`${base}/${session.id}`}>
              <PlayIcon /> Start class
              <LinkSpinner />
            </Link>
          </Button>
        )}
        {list.canManage && !cancelled && (
          <SessionDialog
            offeringId={offeringId}
            category={list.category}
            thresholdPct={list.thresholdPct}
            session={{
              id: session.id,
              title: session.title,
              day: istDayKey(session.scheduledStart),
              startTime: istTimeOfDay(session.scheduledStart),
              lengthMin: Math.round((session.scheduledEnd.getTime() - session.scheduledStart.getTime()) / 60_000),
              attendanceMode: session.attendanceMode,
            }}
            trigger={
              <Button variant="outline" size="sm">
                <PencilSimpleIcon /> Edit
              </Button>
            }
          />
        )}
        {list.canManage && <RowMenu label={session.title} items={items} />}
      </span>
    </li>
  );
}

// M03b T6: the share of students present in each held class of the past page shown below, oldest first, with the
// average over them and the number of classes held. Built from rows already loaded; no extra query.
function AttendancePerClass({ list }: { list: SessionList }) {
  const held = list.past.filter((s) => s.state === 'ended' && s.recorded > 0).reverse();
  const present = held.reduce((sum, s) => sum + s.present, 0);
  const recorded = held.reduce((sum, s) => sum + s.recorded, 0);
  const average = attendancePct(present, recorded);
  const data = held.map((s) => ({
    label: dayMonth.format(s.scheduledStart),
    value: attendancePct(s.present, s.recorded),
  }));
  const lowest = held.reduce<PastSession | null>(
    (low, s) =>
      low && (attendancePct(low.present, low.recorded) ?? 0) <= (attendancePct(s.present, s.recorded) ?? 0) ? low : s,
    null,
  );
  return (
    <Section
      icon={<PageIcon name="attendance" className="size-8" />}
      title="Attendance per class"
      description={
        held.length === 0
          ? 'Shown once a class has ended and its attendance is worked out.'
          : `Students present in each of the ${held.length === 1 ? 'class' : `${held.length} classes`} listed below.`
      }
    >
      {held.length > 0 && average !== null && (
        <>
          <BarChart
            data={data}
            max={100}
            ticks={[0, 50, 100]}
            unit="%"
            name="Students present"
            summary={`${formatPct(average)} present on average${lowest ? `; the lowest was ${formatPct(attendancePct(lowest.present, lowest.recorded) ?? 0)} on ${dayMonth.format(lowest.scheduledStart)}` : ''}.`}
          />
          <dl className="grid grid-cols-2 gap-3">
            <div className="bg-muted/60 grid gap-0.5 rounded-md px-3 py-2.5">
              <dt className="text-muted-foreground order-2 text-xs">average present</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatPct(average)}</dd>
            </div>
            <div className="bg-muted/60 grid gap-0.5 rounded-md px-3 py-2.5">
              <dt className="text-muted-foreground order-2 text-xs">
                {list.held === 1 ? 'class held' : 'classes held'}
              </dt>
              <dd className="text-lg font-semibold tabular-nums">{list.held}</dd>
            </div>
          </dl>
        </>
      )}
    </Section>
  );
}

// The state of a past class in words, for staff (T9).
function staffState(session: PastSession): { label: string; tone: 'success' | 'warning' | 'secondary' | 'outline' } {
  if (session.state === 'cancelled') return { label: 'Cancelled', tone: 'outline' };
  if (session.state === 'not_held') return { label: 'Not held', tone: 'outline' };
  if (!session.finalized) return { label: 'Working out', tone: 'secondary' };
  if (session.attendanceMode === 'derived') return { label: 'Automatic', tone: 'secondary' };
  return session.manual > 0 ? { label: 'Taken', tone: 'success' } : { label: 'Not taken', tone: 'warning' };
}

function studentState(session: PastSession): { label: string; tone: 'success' | 'danger' | 'secondary' | 'outline' } {
  if (session.state === 'cancelled') return { label: 'Cancelled', tone: 'outline' };
  if (session.state === 'not_held') return { label: 'Not held', tone: 'outline' };
  if (session.mine?.status === 'present') return { label: 'Present', tone: 'success' };
  if (session.mine?.status === 'absent') return { label: 'Absent', tone: 'danger' };
  return { label: 'Being worked out', tone: 'secondary' };
}

function heldFor(session: LiveSessionRow) {
  return session.startedAt && session.endedAt
    ? formatDuration((session.endedAt.getTime() - session.startedAt.getTime()) / 1000)
    : '—';
}

function Past({
  list,
  offeringId,
  base,
  page,
  up,
}: {
  list: SessionList;
  offeringId: string;
  base: string;
  page: number;
  up: number;
}) {
  const title = (s: PastSession) => (
    <Link href={`${base}/${s.id}`} className="font-medium hover:underline">
      {s.title}
    </Link>
  );
  const columns: { header: string; cell: (s: PastSession) => ReactNode; className?: string }[] =
    list.view === 'student'
      ? [
          { header: 'Date', cell: (s) => <span className="whitespace-nowrap">{formatDay(s.scheduledStart)}</span> },
          { header: 'Class', cell: title },
          {
            header: 'Your attendance',
            cell: (s) => {
              const { label, tone } = studentState(s);
              return <Badge variant={tone}>{label}</Badge>;
            },
          },
          {
            header: 'Time in class',
            cell: (s) =>
              s.mine?.presenceSec ? <span className="tabular-nums">{formatDuration(s.mine.presenceSec)}</span> : '—',
          },
        ]
      : [
          { header: 'Date', cell: (s) => <span className="whitespace-nowrap">{formatDay(s.scheduledStart)}</span> },
          { header: 'Class', cell: title },
          { header: 'Held for', cell: (s) => <span className="tabular-nums">{heldFor(s)}</span> },
          {
            header: 'Present',
            cell: (s) => <span className="tabular-nums">{s.recorded > 0 ? `${s.present} of ${s.recorded}` : '—'}</span>,
          },
          {
            header: 'Attendance',
            cell: (s) => {
              const { label, tone } = staffState(s);
              return <Badge variant={tone}>{label}</Badge>;
            },
          },
          ...(list.canManage
            ? [
                {
                  header: '',
                  className: 'w-10',
                  cell: (s: PastSession) => <PastMenu session={s} offeringId={offeringId} base={base} />,
                },
              ]
            : []),
        ];
  return (
    <Section
      icon={<PageIcon name="session" className="size-8" />}
      title="Past classes"
      description={
        list.view === 'student'
          ? 'Your attendance in each class.'
          : 'Attendance for each class. Open one to see every student or change a mark.'
      }
    >
      <DataTable
        columns={columns}
        rows={list.past}
        rowKey={(s) => s.id}
        total={list.total}
        page={page}
        pageSize={pageSize}
        query={up > 1 ? { up: String(up) } : {}}
        path={base}
        empty="No past classes yet."
        bare
      />
    </Section>
  );
}

// M03b T6: a class that never ran (cancelled, or not held by its end) can be deleted; one that ran keeps its record.
function PastMenu({ session, offeringId, base }: { session: PastSession; offeringId: string; base: string }) {
  const neverRan = session.state === 'cancelled' || session.state === 'not_held';
  return (
    <RowMenu
      label={session.title}
      items={[
        { kind: 'link', label: 'Open class page', href: `${base}/${session.id}`, icon: <ArrowRightIcon /> },
        { kind: 'separator' },
        neverRan
          ? {
              kind: 'action',
              label: 'Delete',
              icon: <TrashIcon />,
              destructive: true,
              action: deleteSession,
              fields: { offeringId, sessionId: session.id },
              confirm: {
                title: `Delete “${session.title}”?`,
                message: 'The class never ran, so no attendance is lost. It is removed for good.',
                confirmLabel: 'Delete class',
                destructive: true,
              },
            }
          : {
              kind: 'disabled',
              label: 'Delete',
              icon: <TrashIcon />,
              reason: 'A class that ran is kept with its attendance.',
            },
      ]}
    />
  );
}
