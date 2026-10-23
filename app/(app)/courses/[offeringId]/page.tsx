import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRightIcon, PlayIcon, VideoCameraIcon } from '@phosphor-icons/react/ssr';
import Loading from '../../loading';
import { Checklist } from '@/components/checklist';
import { BloomChip } from '@/components/bloom-chip';
import { DateTile } from '@/components/date-tile';
import { LessonThumb } from '@/components/lesson-thumb';
import { LinkSpinner } from '@/components/link-spinner';
import { PageIcon } from '@/components/page-icon';
import { ProgressRing } from '@/components/progress-ring';
import { Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { getMyProgress, type LearnerProgress } from '@/lib/data/content';
import { getOfferingCourse, type OfferingCourse } from '@/lib/data/courses';
import {
  getClassProgress,
  getCourseSetup,
  getNextUp,
  getWorkspace,
  type ClassProgress,
  type CourseSetup,
  type NextUp,
} from '@/lib/data/workspace';
import type { ReadinessKey } from '@/lib/domain/catalog';
import { formatPct, formatTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Course overview' };

export default function OverviewPage({ params }: PageProps<'/courses/[offeringId]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Overview params={params} />
    </Suspense>
  );
}

// Design "Frame A" Overview (17 Oct 2026): a few cards that each lead somewhere, instead of one long page. The full
// syllabus and the CO-PO mapping have their own tabs.
async function Overview({ params }: { params: PageProps<'/courses/[offeringId]'>['params'] }) {
  const { offeringId } = await params;
  const [workspace, course, setup, progress, nextUp, cls] = await Promise.all([
    getWorkspace(offeringId),
    getOfferingCourse(offeringId),
    getCourseSetup(offeringId),
    getMyProgress(offeringId),
    getNextUp(offeringId),
    getClassProgress(offeringId),
  ]);
  const base = `/courses/${offeringId}`;
  const learner = workspace.access === 'learn';
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 gap-4">
        {learner && progress && <Resume progress={progress} base={base} />}
        {learner && progress && <MyProgress progress={progress} />}
        {setup && <Setup setup={setup} base={base} canTeach={workspace.canTeach} course={course} />}
        {cls && <ClassCard cls={cls} />}
      </div>
      <div className="grid min-w-0 gap-4">
        <UpNextCard nextUp={nextUp} base={base} learner={learner} canTeach={workspace.canTeach} />
        {course.mode === 'credit' && <WhatYoullLearn course={course} learner={learner} base={base} />}
      </div>
    </div>
  );
}

// The teacher's path, in the order students need it. The catalogue course is kept by its coordinator (CRS-07), so a
// teacher who is not the coordinator waits for that step.
function Setup({
  setup,
  base,
  canTeach,
  course,
}: {
  setup: CourseSetup;
  base: string;
  canTeach: boolean;
  course: OfferingCourse;
}) {
  const ready = course.readiness.filter((step) => step.done).length;
  const link = (href: string) => (canTeach ? href : null);
  // The first missing part opens where it is done: the Syllabus and Outcomes tabs (M03b), or the catalogue page for
  // what only it holds (the import review, the coordinator, the course's session plan).
  const missing = course.readiness.find((step) => !step.done)?.key;
  const where: Record<ReadinessKey, string> = {
    review: `/catalog/${course.id}#review`,
    coordinator: `/catalog/${course.id}`,
    objectives: `${base}/syllabus?new=objectives`,
    outcomes: `${base}/outcomes?new=co`,
    bloom: `${base}/outcomes`,
    mapping: `${base}/outcomes#mapping`,
    syllabus: `${base}/syllabus?new=module`,
    books: `${base}/syllabus?new=books`,
    sessions: `/catalog/${course.id}?new=sessions`,
  };
  return (
    <Checklist
      icon={<PageIcon name="overview" className="size-8" />}
      title="Get this course ready"
      readyTitle="This course is ready"
      hint={canTeach ? 'Each step opens where it is done.' : undefined}
      steps={[
        {
          title: 'Catalogue course ready',
          done: ready === course.readiness.length,
          detail:
            ready === course.readiness.length
              ? 'Outcomes, syllabus and session plan are in place'
              : `${ready} of ${course.readiness.length} parts ready`,
          href: course.canEdit ? (missing ? where[missing] : `${base}/syllabus`) : null,
          action: 'Complete it',
          waiting: 'Waiting for the course coordinator',
        },
        {
          ...setup.plan,
          title: 'Write the course plan',
          detail: setup.plan.done ? setup.plan.detail : 'Describe how the course will run.',
          href: link(`${base}/plan`),
          action: 'Write plan',
        },
        {
          ...setup.calendar,
          title: 'Schedule the sessions',
          detail: setup.calendar.done ? setup.calendar.detail : 'Date each session, or start from the session plan.',
          href: link(`${base}/plan`),
          action: 'Add sessions',
        },
        {
          ...setup.published,
          title: 'Publish to students',
          detail: setup.published.done ? setup.published.detail : 'Students are notified and emailed the plan.',
          href: link(`${base}/plan`),
          action: 'Publish',
        },
        {
          ...setup.content,
          title: 'Add and publish lessons',
          detail: setup.content.done ? setup.content.detail : 'Upload lecture videos, PDF notes or links.',
          href: link(`${base}/content`),
          action: 'Add lessons',
        },
      ]}
    />
  );
}

function ClassCard({ cls }: { cls: ClassProgress }) {
  const tallest = Math.max(1, ...cls.buckets);
  const labels = ['Under 25%', '25–50%', '50–75%', '75% and more'];
  return (
    <Section
      icon={<PageIcon name="dashboard" className="size-8" />}
      title="How the class is doing"
      description={
        cls.published === 0
          ? 'Students appear here once lessons are published.'
          : `Share of the ${cls.published} published lessons each of ${cls.students} students has finished.`
      }
    >
      {cls.published > 0 && (
        <>
          <ol className="flex h-36 items-end gap-3 border-b px-1" aria-label="Students by lessons finished">
            {cls.buckets.map((count, i) => (
              <li key={labels[i]} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-xs font-semibold tabular-nums">{count}</span>
                <span
                  className="bg-primary w-full max-w-14 rounded-t-lg rounded-b-sm"
                  style={{ height: `${Math.max(4, (100 * count) / tallest)}%` }}
                />
                <span className="sr-only">
                  {count} students finished {labels[i]}
                </span>
              </li>
            ))}
          </ol>
          <div aria-hidden="true" className="text-muted-foreground -mt-3 flex gap-3 px-1 text-center text-xs">
            {labels.map((label) => (
              <span key={label} className="flex-1">
                {label}
              </span>
            ))}
          </div>
        </>
      )}
      <dl className="grid grid-cols-3 gap-2">
        <Stat label="average finished" value={formatPct(Math.round(cls.averagePct))} />
        <Stat
          label="live attendance"
          value={cls.attendancePct === null ? '—' : formatPct(Math.round(cls.attendancePct))}
        />
        <Stat label="yet to finish a lesson" value={String(cls.notStarted)} />
      </dl>
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/70 flex flex-col-reverse rounded-md px-3 py-2.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Resume({ progress, base }: { progress: LearnerProgress; base: string }) {
  const next = progress.next;
  if (!next) {
    return (
      <section className="surface flex items-center gap-4 p-5">
        <PageIcon name="lessons" className="size-12" />
        <p className="text-muted-foreground text-sm">
          {progress.published === 0
            ? 'Your teacher has not published any lessons yet. You will be notified when they do.'
            : 'You have finished every published lesson. Well done.'}
        </p>
      </section>
    );
  }
  const starting = progress.completed === 0 && next.progressPct === 0;
  return (
    <section className="surface flex flex-wrap items-center gap-4 p-3 sm:flex-nowrap sm:p-4">
      <LessonThumb kind="video" thumb={next.thumb} className="w-full sm:w-56" />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <p className="text-primary text-xs font-semibold">{starting ? 'Start here' : 'Continue where you left off'}</p>
        <h2 className="text-lg leading-snug font-semibold tracking-tight text-balance">{next.title}</h2>
        {next.progressPct > 0 && <Progress value={next.progressPct} className="bg-muted h-1.5" aria-label="Watched" />}
        <div className="mt-1">
          <Button asChild>
            <Link href={`${base}/content/${next.id}`}>
              <PlayIcon weight="fill" /> {starting ? 'Start' : 'Resume'}
              <LinkSpinner />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function MyProgress({ progress }: { progress: LearnerProgress }) {
  const pct = progress.published === 0 ? 0 : (100 * progress.completed) / progress.published;
  return (
    <Section
      icon={<PageIcon name="dashboard" className="size-8" />}
      title="Your progress"
      description={`${progress.completed} of ${progress.published} lessons done · ${progress.watchedMin} min watched${progress.attendancePct !== null ? ` · attendance ${formatPct(Math.round(progress.attendancePct))}` : ''}.`}
      action={<ProgressRing value={pct} label={`${Math.round(pct)}% of the lessons done`} />}
    >
      <ol className="grid gap-2.5">
        {progress.modules.map((m, i) => (
          <li key={m.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_6rem_2.5rem] items-center gap-3 text-sm">
            <span className="bg-muted text-muted-foreground grid size-6 place-items-center rounded-md text-xs font-bold">
              {i + 1}
            </span>
            <span className="truncate">{m.title}</span>
            <span className="bg-muted h-1.5 overflow-hidden rounded-full">
              <span
                className="bg-success block h-full rounded-full"
                style={{ width: `${m.total ? (100 * m.done) / m.total : 0}%` }}
              />
            </span>
            <span className="text-muted-foreground text-right text-xs tabular-nums">
              {m.done}/{m.total}
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function UpNextCard({
  nextUp,
  base,
  learner,
  canTeach,
}: {
  nextUp: NextUp;
  base: string;
  learner: boolean;
  canTeach: boolean;
}) {
  const { live, session } = nextUp;
  return (
    <Section
      icon={<PageIcon name="session" className="size-8" />}
      title="Up next"
      description="The next live class and the next session of the course plan."
    >
      {!live && !session ? (
        <p className="text-muted-foreground text-sm">
          Nothing scheduled yet.{' '}
          {canTeach && (
            <>
              <Link href={`${base}/live`} className="text-primary font-medium hover:underline">
                Schedule a class
              </Link>{' '}
              or{' '}
              <Link href={`${base}/plan`} className="text-primary font-medium hover:underline">
                add sessions to the plan
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <ul className="grid divide-y">
          {live && (
            <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <DateTile date={live.start} />
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="truncate">Live class · {live.title}</span>
                  {live.status === 'live' && <Badge variant="danger">Live now</Badge>}
                </span>
                <span className="text-muted-foreground text-xs">
                  {formatTime(live.start)} – {formatTime(live.end)}
                </span>
              </div>
              <Button asChild size="sm" variant={live.status === 'live' ? 'default' : 'outline'}>
                <Link href={`${base}/live/${live.id}`}>
                  <VideoCameraIcon />
                  {live.status === 'live' ? (learner ? 'Join' : 'Open') : 'Details'}
                  <LinkSpinner />
                </Link>
              </Button>
            </li>
          )}
          {session && (
            <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <DateTile date={session.date} tone="plan" />
              <div className="grid min-w-0 flex-1 gap-1">
                <span className="truncate text-sm font-semibold">{session.topic}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">Course plan</span>
                  {session.cos.map((code) => (
                    <span key={code} className="bg-primary/10 text-primary rounded-md px-1.5 text-xs font-semibold">
                      {code}
                    </span>
                  ))}
                </span>
              </div>
            </li>
          )}
        </ul>
      )}
    </Section>
  );
}

function WhatYoullLearn({ course, learner, base }: { course: OfferingCourse; learner: boolean; base: string }) {
  const shown = course.cos.slice(0, 4);
  return (
    <Section
      icon={<PageIcon name="outcomes" className="size-8" />}
      title={learner ? 'What you will learn' : 'What students will learn'}
      description={
        course.cos.length === 0
          ? 'The course outcomes have not been written yet.'
          : `The course outcomes${course.cos.length > shown.length ? `, ${shown.length} of ${course.cos.length}` : ''}.`
      }
    >
      {shown.length > 0 && (
        <ul className="grid gap-2">
          {shown.map((co) => (
            <li key={co.id} className="ring-border/80 flex items-start gap-3 rounded-md px-3 py-2.5 text-sm ring-1">
              <span className="bg-primary/10 text-primary shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold">
                {co.code}
              </span>
              <span className="min-w-0 flex-1 leading-relaxed">{co.statement}</span>
              {co.bloomLevels[0] && <BloomChip level={co.bloomLevels[0]} />}
            </li>
          ))}
        </ul>
      )}
      {course.cos.length > 0 && (
        <Link
          href={`${base}/outcomes`}
          className="text-primary flex items-center gap-1 text-sm font-medium hover:underline"
        >
          All outcomes and the mapping <ArrowRightIcon />
        </Link>
      )}
    </Section>
  );
}
