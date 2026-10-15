import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRightIcon,
  CalendarDotsIcon,
  CheckIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  GridFourIcon,
  InfoIcon,
  PlayCircleIcon,
  RocketLaunchIcon,
  TargetIcon,
} from '@phosphor-icons/react/ssr';
import Loading from '../../loading';
import { CoPoMatrix } from '@/components/co-po-matrix';
import { EmptyState } from '@/components/data-table';
import { LinkSpinner } from '@/components/link-spinner';
import { RichTextView } from '@/components/rich-text-view';
import { Fact, Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { getMyProgress, type LearnerProgress } from '@/lib/data/content';
import { getOfferingCourse, type CourseDetail } from '@/lib/data/courses';
import {
  getCourseSetup,
  getPublishedPlan,
  getWorkspace,
  type CoursePlan,
  type CourseSetup,
} from '@/lib/data/workspace';
import { cn } from '@/lib/cn';
import { formatDay, formatDate, formatPct } from '@/lib/format';

export const metadata: Metadata = { title: 'Course overview' };

export default function OverviewPage({ params }: PageProps<'/courses/[offeringId]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: PageProps<'/courses/[offeringId]'>['params'] }) {
  const { offeringId } = await params;
  const [workspace, course, plan, setup, progress] = await Promise.all([
    getWorkspace(offeringId),
    getOfferingCourse(offeringId),
    getPublishedPlan(offeringId),
    getCourseSetup(offeringId),
    getMyProgress(offeringId),
  ]);
  const base = `/courses/${offeringId}`;
  return (
    <div className="grid gap-6">
      {setup && (
        <Setup
          setup={setup}
          base={base}
          canTeach={workspace.canTeach}
          courseId={course.id}
          isAdmin={workspace.access === 'oversee' && workspace.canTeach}
        />
      )}
      {progress && <MyProgress progress={progress} base={base} />}
      <PlanSection plan={plan} course={course} canTeach={workspace.canTeach} base={base} />
      <Syllabus course={course} />
      <About course={course} />
      {course.category === 'ugc' && <Outcomes course={course} />}
    </div>
  );
}

// The teacher's path through M02, in the order students need it. Each step says where it is done.
function Setup({
  setup,
  base,
  canTeach,
  courseId,
  isAdmin,
}: {
  setup: CourseSetup;
  base: string;
  canTeach: boolean;
  courseId: string;
  isAdmin: boolean;
}) {
  const steps = [
    {
      ...setup.syllabus,
      title: 'Syllabus',
      todo: isAdmin
        ? 'Add the syllabus to the catalogue course.'
        : 'The administrator adds it to the catalogue course.',
      href: isAdmin ? `/admin/courses/${courseId}` : null,
      action: 'Add syllabus',
    },
    {
      ...setup.plan,
      title: 'Write the course plan',
      todo: 'Describe how the course will run.',
      href: `${base}/plan#plan`,
      action: 'Write plan',
    },
    {
      ...setup.calendar,
      title: 'Schedule the sessions',
      todo: 'List each class date and its topic.',
      href: `${base}/plan#calendar`,
      action: 'Add sessions',
    },
    {
      ...setup.published,
      title: 'Publish to students',
      todo: 'Students are notified and emailed the plan.',
      href: `${base}/plan#publish`,
      action: 'Publish',
    },
    {
      ...setup.content,
      title: 'Add and publish lessons',
      todo: 'Upload lecture videos, PDFs or links.',
      href: `${base}/content`,
      action: 'Add lessons',
    },
  ];
  const done = steps.filter((step) => step.done).length;
  // The highlighted step is the first unfinished one this viewer can do; the syllabus waits on the administrator.
  const next = steps.findIndex((step) => !step.done && canTeach && step.href);
  return (
    <section className="surface grid gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-chip size-10 [&_svg]:size-5">
            <RocketLaunchIcon weight="duotone" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">
              {done === steps.length ? 'This course is ready' : 'Get this course ready'}
            </h2>
            <p className="text-muted-foreground text-sm">
              {done} of {steps.length} steps done.{' '}
              {done < steps.length && canTeach && 'Follow them in order; each one links to where it is done.'}
            </p>
          </div>
        </div>
        <Progress
          value={(100 * done) / steps.length}
          className="bg-muted h-2 w-full sm:w-48"
          aria-label="Setup progress"
        />
      </div>
      <ol className="grid gap-2">
        {steps.map((step, index) => {
          const current = index === next;
          return (
            <li
              key={step.title}
              className={cn(
                'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-3 ring-1',
                current ? 'bg-primary/4 ring-primary/25' : 'ring-border/80',
              )}
            >
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  step.done
                    ? 'bg-success text-white'
                    : current
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {step.done ? <CheckIcon weight="bold" className="size-3.5" /> : index + 1}
                <span className="sr-only">{step.done ? ' (done)' : ''}</span>
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-sm font-medium">{step.title}</span>
                <span className="text-muted-foreground text-xs">{step.done ? step.detail : step.todo}</span>
              </span>
              {canTeach && step.href ? (
                <Button asChild size="sm" variant={current ? 'default' : 'outline'}>
                  <Link href={step.href}>
                    {step.done ? 'Open' : step.action}
                    <LinkSpinner />
                  </Link>
                </Button>
              ) : (
                !step.done &&
                canTeach && <span className="text-muted-foreground text-xs">Waiting for the administrator</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function MyProgress({ progress, base }: { progress: LearnerProgress; base: string }) {
  const pct = progress.published === 0 ? 0 : (100 * progress.completed) / progress.published;
  return (
    <section className="surface grid gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-chip size-10 [&_svg]:size-5">
            <PlayCircleIcon weight="duotone" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">Your progress</h2>
            <p className="text-muted-foreground text-sm">
              {progress.published === 0
                ? 'Your teacher has not published any lessons yet.'
                : `${progress.completed} of ${progress.published} lessons complete.`}
            </p>
          </div>
        </div>
        {progress.next && (
          <Button asChild>
            <Link href={`${base}/content/${progress.next.id}`}>
              {progress.completed === 0 ? 'Start' : 'Continue'}: {progress.next.title}
              <ArrowRightIcon />
              <LinkSpinner />
            </Link>
          </Button>
        )}
      </div>
      <Progress value={pct} className="bg-muted h-2.5" aria-label="Lessons complete" />
      <dl className="grid gap-4 sm:grid-cols-3">
        <Fact label="Lessons complete">
          {progress.completed} / {progress.published}
        </Fact>
        <Fact label="Time watched">{progress.watchedMin} min</Fact>
        {/* SKL-04: on a skill course, attendance is the share of published lessons completed. */}
        {progress.attendancePct !== null && <Fact label="Attendance">{formatPct(progress.attendancePct)}</Fact>}
      </dl>
    </section>
  );
}

function PlanSection({
  plan,
  course,
  canTeach,
  base,
}: {
  plan: CoursePlan | null;
  course: CourseDetail;
  canTeach: boolean;
  base: string;
}) {
  const codes = new Map(course.cos.map((co) => [co.id, co.code]));
  const next = plan?.calendar.find((row) => !row.past);
  return (
    <Section
      icon={<CalendarDotsIcon weight="duotone" />}
      title="Course plan"
      description={
        plan?.publishedAt
          ? `Version ${plan.version}, published ${formatDate(plan.publishedAt)}.`
          : 'How the course will run, session by session.'
      }
      action={
        canTeach && (
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}/plan`}>
              Edit plan
              <LinkSpinner />
            </Link>
          </Button>
        )
      }
    >
      {!plan ? (
        <EmptyState
          icon={<CalendarDotsIcon weight="duotone" />}
          text={
            canTeach
              ? 'Not published yet. Write the plan, schedule the sessions and publish it from the Course plan tab.'
              : 'Your teacher has not published the course plan yet. You will get a notification and an email when they do.'
          }
        />
      ) : (
        <>
          {plan.doc && (
            <div className="surface p-5">
              <RichTextView doc={plan.doc} />
            </div>
          )}
          <ol className="grid gap-2">
            {plan.calendar.map((row, index) => (
              <li
                key={row.id}
                className={cn(
                  'flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-4 py-3 ring-1',
                  row === next ? 'bg-primary/4 ring-primary/25' : 'ring-border/80',
                  row.past && 'text-muted-foreground',
                )}
              >
                <span className="text-muted-foreground w-6 text-xs tabular-nums">{index + 1}</span>
                <span className="w-24 shrink-0 text-sm font-medium tabular-nums">{formatDay(row.date)}</span>
                <span className="min-w-0 flex-1 text-sm">{row.topic}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {row === next && <Badge>Next</Badge>}
                  {row.coIds.map((id) => (
                    <Badge key={id} variant="outline">
                      {codes.get(id)}
                    </Badge>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Section>
  );
}

function Syllabus({ course }: { course: CourseDetail }) {
  return (
    <Section
      icon={<FileTextIcon weight="duotone" />}
      title="Syllabus"
      description="The units and topics this course covers."
      action={
        course.syllabusFileKey && (
          <Button asChild variant="outline" size="sm">
            <a href={`/api/files/${course.syllabusFileKey}`} target="_blank" rel="noreferrer">
              <DownloadSimpleIcon />
              Download syllabus (PDF)
            </a>
          </Button>
        )
      }
    >
      {course.syllabusText ? (
        <div className="surface p-5">
          <RichTextView doc={course.syllabusText} />
        </div>
      ) : (
        !course.syllabusFileKey && (
          <EmptyState
            icon={<FileTextIcon weight="duotone" />}
            text="The syllabus has not been added to this course yet."
          />
        )
      )}
    </Section>
  );
}

function About({ course }: { course: CourseDetail }) {
  return (
    <Section
      icon={<InfoIcon weight="duotone" />}
      title={`${course.code} · ${course.title}`}
      description="The catalogue course this offering runs."
    >
      <dl className="surface grid gap-4 p-5 sm:grid-cols-3">
        <Fact label="Credits">{course.credits}</Fact>
        <Fact label="Components">
          <span className="capitalize">{course.components.join(', ')}</span>
        </Fact>
        <Fact label="Programme">{course.programCode}</Fact>
      </dl>
      {course.objectives.length > 0 && (
        <div className="surface p-5">
          <h3 className="text-sm font-semibold">Objectives</h3>
          <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-sm">
            {course.objectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function Outcomes({ course }: { course: CourseDetail }) {
  return (
    <>
      <Section
        icon={<TargetIcon weight="duotone" />}
        title="Course outcomes"
        description="What a student can do after this course."
      >
        {course.cos.length === 0 ? (
          <EmptyState text="No course outcomes have been defined yet." icon={<TargetIcon weight="duotone" />} />
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-3">
            {course.cos.map((co) => (
              <li key={co.id} className="surface flex gap-3 p-4">
                <span className="icon-chip h-8 min-w-12 px-2 text-xs font-semibold">{co.code}</span>
                <span className="grid content-start gap-1.5 text-sm">
                  {co.statement}
                  <Badge variant="secondary" className="w-fit capitalize">
                    {co.bloomLevel}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {course.cos.length > 0 && (
        <Section
          icon={<GridFourIcon weight="duotone" />}
          title="CO–PO–PSO mapping"
          description="How strongly each course outcome supports each programme outcome (1 low, 3 high)."
        >
          <CoPoMatrix cos={course.cos} outcomes={course.outcomes} cells={course.cells} mode="levels" />
        </Section>
      )}
    </>
  );
}
