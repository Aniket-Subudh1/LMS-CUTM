import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  EyeIcon,
  HourglassIcon,
  ListChecksIcon,
  PencilSimpleIcon,
  PlayIcon,
  StopIcon,
  XIcon,
} from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../../../loading';
import { cancelSession, endSession, markAttendance, startSession } from '../actions';
import { SessionDialog } from '../session-dialog';
import { ActionForm } from '@/components/action-form';
import { AutoRefresh } from '@/components/auto-refresh';
import { DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { LiveRoom } from '@/components/live-room';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { Fact, Section } from '@/components/section';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getAttendanceSheet,
  getSession,
  type AttendanceSheet,
  type SessionDetail,
  type SessionState,
  type SheetRow,
} from '@/lib/data/live';
import { istDayKey, istTimeOfDay } from '@/lib/domain/time';
import { formatDay, formatDuration, formatPct, formatTime, statusTone } from '@/lib/format';
import { page as pageParam } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Live class' };

const Search = z.object({ page: pageParam.catch(1) });
const MINUTE_MS = 60_000;

const STATE_LABEL: Record<SessionState, string> = {
  upcoming: 'Scheduled',
  live: 'Live',
  ended: 'Ended',
  cancelled: 'Cancelled',
  not_held: 'Not held',
};

export default function LiveSessionPage({ params, searchParams }: PageProps<'/courses/[offeringId]/live/[sessionId]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <LiveSessionView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function LiveSessionView({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/live/[sessionId]'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/live/[sessionId]'>['searchParams'];
}) {
  const { offeringId, sessionId } = await params;
  const { page } = Search.parse(await searchParams);
  const detail = await getSession(offeringId, sessionId);
  const { session } = detail;
  const staff = detail.view !== 'student';
  const sheet = staff && session.startedAt ? await getAttendanceSheet(offeringId, sessionId, page) : null;
  const ref = (
    <>
      <input type="hidden" name="offeringId" value={offeringId} />
      <input type="hidden" name="sessionId" value={sessionId} />
    </>
  );
  // AC-M03-06: a skill course never shows the attendance list to mark.
  const marks = detail.canManage && detail.category === 'ugc' && sheet !== null;
  const now = new Date();
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`/courses/${offeringId}/live`}>
          <ArrowLeftIcon /> All live classes
        </Link>
      </Button>
      <PageHeader
        icon={<PageIcon name="session" />}
        title={session.title}
        description={describe(detail)}
        actions={
          <>
            <Badge variant={statusTone(session.state)}>{STATE_LABEL[session.state]}</Badge>
            {detail.canManage && session.state === 'upcoming' && (
              <>
                <SessionDialog
                  offeringId={offeringId}
                  category={detail.category}
                  thresholdPct={detail.thresholdPct}
                  session={{
                    id: session.id,
                    title: session.title,
                    day: istDayKey(session.scheduledStart),
                    startTime: istTimeOfDay(session.scheduledStart),
                    lengthMin: Math.round(
                      (session.scheduledEnd.getTime() - session.scheduledStart.getTime()) / MINUTE_MS,
                    ),
                    attendanceMode: session.attendanceMode,
                  }}
                  trigger={
                    <Button variant="outline">
                      <PencilSimpleIcon /> Edit
                    </Button>
                  }
                />
                <ActionForm
                  action={cancelSession}
                  submitLabel="Cancel class"
                  submitVariant="outline"
                  submitIcon={<XIcon />}
                  confirm={{
                    title: 'Cancel this class?',
                    message: 'It is removed from the timetable and your students are told.',
                  }}
                >
                  {ref}
                </ActionForm>
              </>
            )}
            {marks && sheet && session.state !== 'cancelled' && (
              <AttendanceDialog detail={detail} sheet={sheet} live={session.state === 'live'}>
                {ref}
              </AttendanceDialog>
            )}
            {detail.canManage && session.state === 'live' && (
              <ActionForm
                action={endSession}
                submitLabel="End class"
                submitVariant="destructive"
                submitIcon={<StopIcon />}
                confirm={{
                  title: 'End the class for everyone?',
                  message:
                    'Everyone leaves the room and attendance is worked out from the time each student spent in it.',
                }}
              >
                {ref}
              </ActionForm>
            )}
          </>
        }
      />
      <div className="grid gap-6">
        {session.state === 'upcoming' &&
          (staff ? (
            <ReadyToStart detail={detail} canStart={now >= detail.canStartAt}>
              {ref}
            </ReadyToStart>
          ) : (
            <Waiting detail={detail} now={now} />
          ))}
        {session.state === 'live' &&
          (detail.join ? (
            <LiveRoom
              sessionId={session.id}
              serverUrl={detail.join.serverUrl}
              token={detail.join.token}
              trackFocus={detail.view === 'student'}
            />
          ) : (
            <Alert>
              <EyeIcon />
              <AlertTitle>You are following this class without joining it</AlertTitle>
              <AlertDescription>
                Only the course&apos;s teachers and its students join the room. Attendance below updates when you reload
                the page.
              </AlertDescription>
            </Alert>
          ))}
        {session.state === 'ended' && (staff ? <Summary detail={detail} /> : <MyResult detail={detail} />)}
        {(session.state === 'cancelled' || session.state === 'not_held') && (
          <section className="surface grid place-items-center gap-2 p-10 text-center">
            <span className="icon-chip size-12 [&_svg]:size-7">
              <PageIcon name="missing" className="size-10" />
            </span>
            <h2 className="text-lg font-semibold">
              {session.state === 'cancelled' ? 'This class was cancelled' : 'This class was not held'}
            </h2>
            <p className="text-muted-foreground text-sm">It does not count towards anyone&apos;s attendance.</p>
          </section>
        )}
        {sheet && (
          <AttendanceList detail={detail} sheet={sheet} page={page} path={`/courses/${offeringId}/live/${sessionId}`} />
        )}
      </div>
    </>
  );
}

function describe({ session, category, view }: SessionDetail) {
  const when = `${formatDay(session.scheduledStart)} · ${formatTime(session.scheduledStart)} – ${formatTime(session.scheduledEnd)}`;
  if (view === 'student' || category === 'skill') return when;
  return `${when} · ${session.attendanceMode === 'manual' ? 'You take attendance' : 'Automatic attendance'}`;
}

function ReadyToStart({
  detail,
  canStart,
  children,
}: {
  detail: SessionDetail;
  canStart: boolean;
  children: ReactNode;
}) {
  return (
    <Section
      icon={<PlayIcon weight="duotone" />}
      title={canStart ? 'Ready to start' : `You can start from ${formatTime(detail.canStartAt)}`}
      description="Your students are told the moment you start, and can join from the course or their dashboard."
      action={
        detail.canManage &&
        (canStart ? (
          <ActionForm action={startSession} submitLabel="Start class" submitIcon={<PlayIcon />}>
            {children}
          </ActionForm>
        ) : (
          <Button disabled>
            <PlayIcon /> Start class
          </Button>
        ))
      }
    >
      <ul className="text-muted-foreground grid gap-2 text-sm leading-relaxed">
        <li>
          <span className="text-foreground font-medium">Use a laptop with Chrome, Edge or Firefox,</span> and allow the
          microphone (and camera) when the browser asks.
        </li>
        <li>
          <span className="text-foreground font-medium">Share your screen</span> from the bar at the bottom of the room.
        </li>
        <li>
          <span className="text-foreground font-medium">Attendance:</span>{' '}
          {detail.category === 'skill' || detail.session.attendanceMode === 'derived'
            ? `automatic — present after ${formatPct(detail.thresholdPct)} of the class in the room.`
            : 'take it during the class with “Take attendance”. Students who joined are ticked for you.'}
        </li>
      </ul>
    </Section>
  );
}

function Waiting({ detail, now }: { detail: SessionDetail; now: Date }) {
  const { session } = detail;
  const soon = session.scheduledStart.getTime() - now.getTime() < 60 * MINUTE_MS;
  return (
    <section className="surface grid place-items-center gap-3 p-8 text-center sm:p-10">
      {soon && <AutoRefresh seconds={20} />}
      <span className="icon-chip size-12 [&_svg]:size-7">
        <PageIcon name="session" className="size-10" />
      </span>
      <h2 className="text-lg font-semibold">
        Starts{' '}
        {istDayKey(session.scheduledStart) === istDayKey(now) ? 'today' : `on ${formatDay(session.scheduledStart)}`} at{' '}
        {formatTime(session.scheduledStart)}
      </h2>
      <p className="text-muted-foreground max-w-md text-sm text-pretty">
        {soon
          ? 'Your teacher opens the class. Keep this page open — it updates by itself, and the class appears here when it starts.'
          : 'Come back a little before the start. You will also get a notification when the class starts.'}
      </p>
      <p className="text-muted-foreground max-w-md text-xs text-pretty">
        You join with your microphone and camera off. Turn them on from the bar at the bottom when your teacher asks.
      </p>
    </section>
  );
}

function Summary({ detail }: { detail: SessionDetail }) {
  const { session, summary, enrolled } = detail;
  if (!session.finalized) {
    return (
      <Alert>
        <HourglassIcon />
        <AlertTitle>Working out attendance</AlertTitle>
        <AlertDescription>This takes a minute after a class ends. Reload the page to see it.</AlertDescription>
      </Alert>
    );
  }
  return (
    <dl className="surface grid grid-cols-2 gap-4 p-5 sm:grid-cols-4 sm:p-6">
      <Fact label="Held">
        {session.startedAt && session.endedAt
          ? `${formatTime(session.startedAt)} – ${formatTime(session.endedAt)} (${formatDuration((session.endedAt.getTime() - session.startedAt.getTime()) / 1000)})`
          : '—'}
      </Fact>
      <Fact label="Present">
        {summary?.present ?? 0} of {enrolled}
      </Fact>
      <Fact label="Average time in class">{formatDuration(summary?.avgPresenceSec ?? 0)}</Fact>
      <Fact label="Average time focused">{formatDuration(summary?.avgFocusedSec ?? 0)}</Fact>
    </dl>
  );
}

// A teacher's mark can arrive before the time in class is worked out, so the result waits for finalization.
function MyResult({ detail }: { detail: SessionDetail }) {
  const mine = detail.session.finalized ? detail.mine : null;
  return (
    <section className="surface grid gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="icon-chip size-10 [&_svg]:size-5">
          <PageIcon name="attendance" className="size-8" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">Your attendance</h2>
        {mine?.status && (
          <Badge variant={mine.status === 'present' ? 'success' : 'danger'} className="capitalize">
            {mine.status}
          </Badge>
        )}
      </div>
      {mine?.status ? (
        <dl className="grid gap-4 sm:grid-cols-2">
          <Fact label="Time in class">{formatDuration(mine.presenceSec)}</Fact>
          <Fact label="Time focused on the class">{formatDuration(mine.focusedSec)}</Fact>
        </dl>
      ) : (
        <p className="text-muted-foreground text-sm">Being worked out. Check back in a few minutes.</p>
      )}
    </section>
  );
}

const minutes = (seconds: number) => (seconds > 0 ? formatDuration(seconds) : '—');

function presenceNote(row: SheetRow, live: boolean) {
  if (live && row.inClass) return 'In class now';
  if (!row.joined) return 'Did not join';
  return live ? 'Left' : 'Joined';
}

function AttendanceList({
  detail,
  sheet,
  page,
  path,
}: {
  detail: SessionDetail;
  sheet: AttendanceSheet;
  page: number;
  path: string;
}) {
  const live = detail.session.state === 'live';
  const columns: { header: string; cell: (r: SheetRow) => ReactNode }[] = [
    { header: 'Roll no.', cell: (r) => r.rollNo },
    { header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span> },
    {
      header: 'Attendance',
      cell: (r) =>
        r.status ? (
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={r.status === 'present' ? 'success' : 'danger'} className="capitalize">
              {r.status}
            </Badge>
            <span className="text-muted-foreground text-xs">{r.marked ? 'marked by hand' : 'from time in class'}</span>
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">{presenceNote(r, live)}</span>
        ),
    },
    { header: 'Time in class', cell: (r) => <span className="tabular-nums">{minutes(r.presenceSec)}</span> },
    { header: 'Focused', cell: (r) => <span className="tabular-nums">{minutes(r.focusedSec)}</span> },
  ];
  const unmarkedNote =
    detail.category === 'ugc' && detail.session.attendanceMode === 'manual' && sheet.unmarked > 0
      ? live
        ? ` ${sheet.unmarked} ${sheet.unmarked === 1 ? 'student has' : 'students have'} no mark yet; anyone unmarked is recorded absent when the class ends.`
        : ` ${sheet.unmarked} ${sheet.unmarked === 1 ? 'student was' : 'students were'} not marked by hand and are recorded absent.`
      : '';
  return (
    <Section
      icon={<PageIcon name="attendance" className="size-8" />}
      title={live ? 'Attendance so far' : 'Attendance'}
      description={`${sheet.total} ${sheet.total === 1 ? 'student' : 'students'}, by roll number.${unmarkedNote}`}
    >
      <DataTable
        columns={columns}
        rows={sheet.rows}
        rowKey={(r) => r.studentId}
        total={sheet.total}
        page={page}
        pageSize={sheet.pageSize}
        query={{}}
        path={path}
        empty="Nobody is enrolled in this course."
      />
    </Section>
  );
}

function AttendanceDialog({
  detail,
  sheet,
  live,
  children,
}: {
  detail: SessionDetail;
  sheet: AttendanceSheet;
  live: boolean;
  children: ReactNode;
}) {
  const manual = detail.session.attendanceMode === 'manual';
  const first = (sheet.page - 1) * sheet.pageSize + 1;
  return (
    <FormDialog
      trigger={
        <Button variant="outline">
          <ListChecksIcon /> {live ? 'Take attendance' : 'Change attendance'}
        </Button>
      }
      size="wide"
      icon={<PageIcon name="attendance" className="size-8" />}
      title={live ? 'Take attendance' : 'Change attendance'}
      description={
        manual && !detail.session.finalized
          ? 'Students who joined the class are ticked present. Change anyone who is not, then save. Students without a mark are recorded absent when the class ends.'
          : 'Change any student, then save. A mark you set here is kept even if the time in class says otherwise.'
      }
      action={markAttendance}
      submitLabel="Save attendance"
      successMessage="Attendance saved."
    >
      {children}
      <p className="text-muted-foreground text-sm">
        {sheet.total > sheet.pageSize
          ? `Students ${first}–${first + sheet.rows.length - 1} of ${sheet.total}. Save this page, then open the next page of the list.`
          : `${sheet.total} ${sheet.total === 1 ? 'student' : 'students'}${live ? ` · ${detail.inClass} in class now` : ''}`}
      </p>
      <ul className="grid gap-2">
        {sheet.rows.map((row) => (
          <li
            key={row.studentId}
            className="ring-border/80 flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2.5 ring-1"
          >
            <span className="grid min-w-0">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {row.name}
                {live && row.inClass && <Badge variant="success">In class</Badge>}
              </span>
              <span className="text-muted-foreground text-xs">
                {row.rollNo} · {row.joined ? `in class ${formatDuration(row.presenceSec)}` : 'did not join'}
              </span>
            </span>
            <span className="flex gap-2" role="radiogroup" aria-label={`Attendance of ${row.name}`}>
              {(['present', 'absent'] as const).map((status) => (
                <label
                  key={status}
                  className={
                    status === 'present'
                      ? 'ring-border text-muted-foreground has-checked:ring-success/40 has-checked:bg-success/5 has-checked:text-success has-focus-visible:ring-ring flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ring-1'
                      : 'ring-border text-muted-foreground has-checked:ring-destructive/40 has-checked:bg-destructive/5 has-checked:text-destructive has-focus-visible:ring-ring flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ring-1'
                  }
                >
                  <input
                    type="radio"
                    name={`status_${row.studentId}`}
                    value={status}
                    defaultChecked={row.prefill === status}
                    className="accent-current"
                  />
                  {status === 'present' ? 'Present' : 'Absent'}
                </label>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </FormDialog>
  );
}
