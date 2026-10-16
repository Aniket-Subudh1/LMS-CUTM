import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRightIcon,
  BroadcastIcon,
  CalendarDotsIcon,
  ChartBarIcon,
  ClockCounterClockwiseIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlusIcon,
  XIcon,
} from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../../loading';
import { cancelSession } from './actions';
import { SessionDialog } from './session-dialog';
import { ActionForm } from '@/components/action-form';
import { DataTable, EmptyState } from '@/components/data-table';
import { LinkSpinner } from '@/components/link-spinner';
import { PageHeader } from '@/components/page-header';
import { Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { START_EARLY_MS, listSessions, type LiveSessionRow, type PastSession, type SessionList } from '@/lib/data/live';
import { istDateToDate, istDayKey, istTimeOfDay } from '@/lib/domain/time';
import { formatDay, formatDuration, formatPct, formatTime } from '@/lib/format';
import { page as pageParam, pageSize } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Live classes' };

const Search = z.object({ page: pageParam.catch(1) });
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
  const { page } = Search.parse(await searchParams);
  const list = await listSessions(offeringId, page);
  const base = `/courses/${offeringId}/live`;
  const now = new Date();
  return (
    <>
      <PageHeader
        icon={<BroadcastIcon weight="duotone" />}
        title="Live classes"
        description={
          list.view === 'student'
            ? 'Join your classes here and see your attendance.'
            : list.canManage
              ? 'Schedule classes, start them from here and see who attended.'
              : 'The classes of this course and their attendance.'
        }
        actions={
          list.canManage && (
            <SessionDialog
              offeringId={offeringId}
              category={list.category}
              thresholdPct={list.thresholdPct}
              next={list.next}
              trigger={
                <Button>
                  <PlusIcon /> Schedule a class
                </Button>
              }
            />
          )
        }
      />
      <div className="grid gap-6">
        {list.mine && <MyAttendance mine={list.mine} />}
        {list.live.map((session) => (
          <LiveNow key={session.id} session={session} list={list} href={`${base}/${session.id}`} />
        ))}
        <Upcoming list={list} offeringId={offeringId} base={base} now={now} />
        <Past list={list} base={base} page={page} />
      </div>
    </>
  );
}

function MyAttendance({ mine }: { mine: NonNullable<SessionList['mine']> }) {
  return (
    <section className="surface grid gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="icon-chip size-10 [&_svg]:size-5">
            <ChartBarIcon weight="duotone" />
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
  const label = list.view === 'student' ? 'Join class' : list.view === 'teacher' ? 'Go to class' : 'Open';
  return (
    <section className="from-primary flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-linear-to-r to-[oklch(0.45_0.2_263)] p-5 text-white sm:p-6">
      <div className="grid gap-1">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium">
          <span className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" />
          Live now
        </span>
        <h2 className="text-lg font-semibold">{session.title}</h2>
        <p className="text-sm text-white/80">
          Started {formatTime(session.startedAt ?? session.scheduledStart)}
          {list.view !== 'student' && ` · ${session.inClass} of ${list.enrolled} students in class`}
        </p>
      </div>
      <Button asChild className="text-primary bg-white hover:bg-white/90">
        <Link href={href}>
          {label} <ArrowRightIcon />
          <LinkSpinner />
        </Link>
      </Button>
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

function Upcoming({ list, offeringId, base, now }: { list: SessionList; offeringId: string; base: string; now: Date }) {
  return (
    <Section
      icon={<CalendarDotsIcon weight="duotone" />}
      title="Upcoming"
      description={
        list.canManage
          ? 'You can start a class from 15 minutes before its time.'
          : 'Classes your teacher has scheduled. You can join once the class starts.'
      }
    >
      {list.upcoming.length === 0 ? (
        <EmptyState
          icon={<CalendarDotsIcon weight="duotone" />}
          text={
            list.canManage
              ? 'No classes scheduled. Schedule the next one — students are told straight away.'
              : 'No classes scheduled yet.'
          }
        />
      ) : (
        <ul className="grid gap-2">
          {list.upcoming.map((session) => (
            <UpcomingRow key={session.id} session={session} list={list} offeringId={offeringId} base={base} now={now} />
          ))}
        </ul>
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
  const startable = now.getTime() >= session.scheduledStart.getTime() - START_EARLY_MS;
  const [weekday, day, month] = formatDay(session.scheduledStart).replace(',', '').split(' ');
  const when = startable && list.canManage ? 'You can start it now' : dayWord(session.scheduledStart, now);
  return (
    <li className="ring-border/80 flex flex-wrap items-center gap-4 rounded-xl px-4 py-3 ring-1">
      <span className="bg-primary/8 text-primary grid w-14 shrink-0 place-items-center rounded-xl py-1.5 leading-tight">
        <span className="text-[11px] font-semibold uppercase">{weekday}</span>
        <span className="text-base font-semibold">{day}</span>
        <span className="text-[11px]">{month}</span>
      </span>
      <span className="grid min-w-48 flex-1">
        <Link href={`${base}/${session.id}`} className="font-medium hover:underline">
          {session.title}
        </Link>
        <span className="text-muted-foreground text-sm">
          {formatTime(session.scheduledStart)} – {formatTime(session.scheduledEnd)} · {when}
        </span>
      </span>
      {list.canManage && list.category === 'ugc' && (
        <Badge variant="outline">{session.attendanceMode === 'manual' ? 'You take attendance' : 'Automatic'}</Badge>
      )}
      {list.canManage && (
        <span className="flex flex-wrap items-center gap-2">
          {startable && (
            <Button asChild size="sm">
              <Link href={`${base}/${session.id}`}>
                <PlayIcon /> Start class
                <LinkSpinner />
              </Link>
            </Button>
          )}
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
          <ActionForm
            action={cancelSession}
            submitLabel="Cancel"
            submitVariant="outline"
            submitSize="sm"
            submitIcon={<XIcon />}
            confirm={{
              title: 'Cancel this class?',
              message: `“${session.title}” on ${formatDay(session.scheduledStart)} is cancelled and your students are told.`,
            }}
          >
            <input type="hidden" name="offeringId" value={offeringId} />
            <input type="hidden" name="sessionId" value={session.id} />
          </ActionForm>
        </span>
      )}
    </li>
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

function Past({ list, base, page }: { list: SessionList; base: string; page: number }) {
  const title = (s: PastSession) => (
    <Link href={`${base}/${s.id}`} className="font-medium hover:underline">
      {s.title}
    </Link>
  );
  const columns: { header: string; cell: (s: PastSession) => ReactNode }[] =
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
              s.mine?.status ? <span className="tabular-nums">{formatDuration(s.mine.presenceSec)}</span> : '—',
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
        ];
  return (
    <Section
      icon={<ClockCounterClockwiseIcon weight="duotone" />}
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
        query={{}}
        path={base}
        empty="No past classes yet."
      />
    </Section>
  );
}
