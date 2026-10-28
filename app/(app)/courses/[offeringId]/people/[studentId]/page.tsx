import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeftIcon, ArrowRightIcon, SparkleIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../../../loading';
import { BarChart } from '@/components/bar-chart';
import { EngagementMark } from '@/components/engagement-mark';
import { PageIcon } from '@/components/page-icon';
import { Section } from '@/components/section';
import { TrendChart } from '@/components/trend-chart';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/cn';
import {
  explainStudentEngagement,
  getStudentEngagement,
  type StudentEngagementView,
} from '@/lib/data/engagement-views';
import { istDateToDate } from '@/lib/domain/time';
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatPct,
  SIGNAL_LABEL,
  statusTone,
  TREND_LABEL,
} from '@/lib/format';
import { ENGAGEMENT_SIGNALS, type EngagementSignal } from '@/lib/schemas/engagement';

export const metadata: Metadata = { title: 'Student engagement' };

const Search = z.object({ explain: z.literal('1').optional().catch(undefined) });

export default function StudentEngagementPage({
  params,
  searchParams,
}: PageProps<'/courses/[offeringId]/people/[studentId]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <StudentEngagement params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// M10 T5 (ENG-02): one student's engagement and the records behind it, for whoever teaches or oversees the class.
async function StudentEngagement({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/people/[studentId]'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/people/[studentId]'>['searchParams'];
}) {
  const { offeringId, studentId } = await params;
  const { explain } = Search.parse(await searchParams);
  const view = await getStudentEngagement(offeringId, studentId);
  const { student, live } = view;
  const here = `/courses/${offeringId}/people/${studentId}`;
  const period = `${formatDate(istDateToDate(view.window.firstDay))} – ${formatDate(istDateToDate(view.window.lastDay))}`;
  const summary = explain && live ? await explainStudentEngagement(view) : null;
  return (
    <div className="grid gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/courses/${offeringId}/people`}>
            <ArrowLeftIcon /> People
          </Link>
        </Button>
      </div>
      <section className="surface grid gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <h2 className="text-[1.0625rem] font-semibold tracking-tight">{student.name}</h2>
            <p className="text-muted-foreground text-[0.8125rem]">
              {student.rollNo} · {student.email}
            </p>
          </div>
          {live ? (
            <EngagementMark score={live.score} band={live.band} trend={live.trend} />
          ) : (
            <Badge variant={statusTone(student.status)}>{student.status}</Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {live
            ? `The last ${view.window.days} days, ${period}, worked out now from the records below.`
            : 'Dropped from the class, so not counted. Their records up to then are below.'}
          {view.snapshot &&
            ` Last night's score${view.snapshot.score === null ? '' : `, ${view.snapshot.score},`} is the one the People list shows (${formatDateTime(view.snapshot.computedAt)}).`}
        </p>
      </section>

      {live && <Signals view={view} live={live} here={here} explaining={Boolean(explain)} />}

      {summary && (
        <Alert>
          <SparkleIcon />
          <AlertTitle>AI-generated summary — based only on the numbers above</AlertTitle>
          <AlertDescription className="whitespace-pre-line">{summary.text ?? summary.reason}</AlertDescription>
        </Alert>
      )}

      <Section
        icon={<PageIcon name="chart" className="size-8" />}
        title="Daily activity"
        description="Minutes of video and live class on each day of the period."
      >
        <BarChart
          data={view.daily.map((d) => ({ label: String(Number(d.day.slice(8))), value: d.minutes }))}
          max={Math.max(60, ...view.daily.map((d) => d.minutes))}
          ticks={[0, Math.max(60, ...view.daily.map((d) => d.minutes))]}
          name="Active minutes"
          unit=" min"
          summary={`${view.daily.reduce((sum, d) => sum + d.minutes, 0)} minutes in all, on ${view.daily.filter((d) => d.minutes > 0).length} of ${view.daily.length} days, ${period}.`}
        />
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          icon={<PageIcon name="attendance" className="size-8" />}
          title="Live classes"
          description="The classes in this period with attendance taken."
        >
          {view.classes.length === 0 ? (
            <p className="text-muted-foreground text-[0.8125rem]">No live class with attendance in this period.</p>
          ) : (
            <ul className="divide-border/70 grid divide-y text-[0.8125rem]">
              {view.classes.map((c) => (
                <li key={c.at.toISOString()} className="flex items-center justify-between gap-3 py-2">
                  <span className="grid min-w-0">
                    <span className="truncate font-medium">{c.title}</span>
                    <span className="text-muted-foreground text-xs">{formatDateTime(c.at)}</span>
                  </span>
                  <Badge variant={c.present ? 'success' : 'danger'}>{c.present ? 'present' : 'absent'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          icon={<PageIcon name="assignment" className="size-8" />}
          title="Assessments"
          description="The assessments that closed in this period, and when they were handed in."
        >
          {view.assessments.length === 0 ? (
            <p className="text-muted-foreground text-[0.8125rem]">No assessment closed in this period.</p>
          ) : (
            <ul className="divide-border/70 grid divide-y text-[0.8125rem]">
              {view.assessments.map((a) => {
                const state = !a.handedInAt ? 'missing' : a.handedInAt <= a.closesAt ? 'on time' : 'late';
                return (
                  <li
                    key={`${a.title}-${a.closesAt.toISOString()}`}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="grid min-w-0">
                      <span className="truncate font-medium">{a.title}</span>
                      <span className="text-muted-foreground text-xs">
                        Closed {formatDateTime(a.closesAt)}
                        {a.handedInAt && ` · handed in ${formatDateTime(a.handedInAt)}`}
                      </span>
                    </span>
                    <Badge variant={state === 'on time' ? 'success' : state === 'late' ? 'warning' : 'outline'}>
                      {state === 'missing' ? 'not handed in' : state}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <Section
        icon={<PageIcon name="video" className="size-8" />}
        title="Videos"
        description="How much of each published video they have watched, since the course began."
      >
        {view.videos.length === 0 ? (
          <p className="text-muted-foreground text-[0.8125rem]">No video lesson is published yet.</p>
        ) : (
          <ul className="grid gap-2.5 text-[0.8125rem] sm:grid-cols-2">
            {view.videos.map((v, i) => {
              const pct = Math.round((100 * v.watchedSec) / v.durationSec);
              return (
                <li key={`${i}-${v.title}`} className="grid gap-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate">{v.title}</span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {formatDuration(v.watchedSec)} of {formatDuration(v.durationSec)}
                    </span>
                  </span>
                  <Progress
                    value={pct}
                    className="bg-muted h-1.5"
                    aria-label={`${v.title}: ${formatPct(pct)} watched`}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {(view.marks || view.project) && (
        <div className="grid gap-5 lg:grid-cols-2">
          {view.marks && (
            <Section
              icon={<PageIcon name="evaluation" className="size-8" />}
              title="Internal marks"
              description="Their latest published results and the internal marks worked out from them."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href={`/courses/${offeringId}/marks`}>
                    Marks <ArrowRightIcon />
                  </Link>
                </Button>
              }
            >
              <p className="text-[0.8125rem]">
                {view.marks.internalPct === null
                  ? 'No internal marks yet.'
                  : `${formatPct(Math.round(view.marks.internalPct))} of the internal marks${view.marks.complete ? '' : ' so far (not every part is in yet)'}.`}{' '}
                <span className="text-muted-foreground">Trend: {TREND_LABEL[view.marks.trend].toLowerCase()}.</span>
              </p>
              {view.marks.points.length > 0 && <TrendChart points={view.marks.points} trend={view.marks.trend} wide />}
            </Section>
          )}
          {view.project && (
            <Section
              icon={<PageIcon name="code" className="size-8" />}
              title="Project"
              description="Their team's project, with its commits or its board."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href={`/courses/${offeringId}/projects/${view.project.id}`}>
                    Open project <ArrowRightIcon />
                  </Link>
                </Button>
              }
            >
              <p className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
                <span className="font-medium">{view.project.title}</span>
                <span className="text-muted-foreground">· due {formatDate(view.project.dueOn)}</span>
                <Badge variant={statusTone(view.project.status)}>{view.project.status}</Badge>
              </p>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

// The five signals with the numbers behind each, and the score worked out from them (AC-M10-01).
function Signals({
  view,
  live,
  here,
  explaining,
}: {
  view: StudentEngagementView;
  live: NonNullable<StudentEngagementView['live']>;
  here: string;
  explaining: boolean;
}) {
  const { raw, signals, classP90s } = live;
  const videoSec = raw.videos.reduce((sum, v) => sum + v.durationSec, 0);
  const watchedSec = raw.videos.reduce((sum, v) => sum + Math.min(v.watchedSec, v.durationSec), 0);
  const behind: Record<EngagementSignal, string> = {
    attendance:
      raw.classesHeld === 0
        ? 'No live class with attendance in this period.'
        : `${raw.classesAttended} of ${raw.classesHeld} classes attended.`,
    video:
      videoSec === 0
        ? 'No video lesson is published yet.'
        : `${formatDuration(watchedSec)} of ${formatDuration(videoSec)} of video watched.`,
    timeliness:
      raw.closed === 0
        ? 'No assessment closed in this period.'
        : `${raw.closedOnTime} of ${raw.closed} assessments handed in on time.`,
    practice:
      classP90s.practice === 0
        ? 'Nobody in the class has attempted a quiz or run code in this period.'
        : `${raw.practice} quiz attempts and code runs; the busiest tenth of the class did ${classP90s.practice}.`,
    activity:
      classP90s.activity === 0
        ? 'Nobody in the class has studied in this period.'
        : `Studied on ${raw.activeDays} days; the busiest tenth of the class on ${classP90s.activity}.`,
  };
  const counted = ENGAGEMENT_SIGNALS.filter((s) => signals[s] !== null);
  const weight = counted.reduce((sum, s) => sum + view.weights[s], 0);
  return (
    <Section
      icon={<PageIcon name="people" className="size-8" />}
      title="What the score is made of"
      description="Each signal is a share from 0 to 100%. The score is their average, weighted as Settings says."
      action={
        view.aiReady &&
        live.band &&
        !explaining && (
          <Button asChild variant="outline" size="sm">
            <Link href={`${here}?explain=1`} scroll={false}>
              <SparkleIcon /> Explain with AI
            </Link>
          </Button>
        )
      }
    >
      <ul className="grid gap-3 text-[0.8125rem]">
        {ENGAGEMENT_SIGNALS.map((signal) => {
          const value = signals[signal];
          return (
            <li key={signal} className="grid gap-1.5 sm:grid-cols-[11rem_1fr_9rem] sm:items-center sm:gap-4">
              <span className="font-medium">
                {SIGNAL_LABEL[signal]}{' '}
                <span className="text-muted-foreground text-xs font-normal">
                  · weight {value === null ? 'shared out' : view.weights[signal]}
                </span>
              </span>
              <span className="text-muted-foreground">{behind[signal]}</span>
              <span className={cn('flex items-center gap-2', value === null && 'text-muted-foreground')}>
                <Progress value={value === null ? 0 : 100 * value} className="bg-muted h-1.5 w-20" aria-hidden="true" />
                <span className="tabular-nums">{value === null ? '—' : formatPct(Math.round(100 * value))}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground border-border/70 border-t pt-3 text-xs">
        {live.score === null
          ? 'No signal applies yet, so there is no score.'
          : `Score = (${counted.map((s) => `${view.weights[s]} × ${formatPct(100 * (signals[s] ?? 0))}`).join(' + ')}) ÷ ${weight} = ${live.score}.`}
        {live.previousScore !== null && ` The ${view.window.days} days before: ${live.previousScore}.`}
      </p>
    </Section>
  );
}
