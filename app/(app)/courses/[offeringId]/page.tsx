import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRightIcon,
  CalendarDotsIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  GridFourIcon,
  InfoIcon,
  PlayCircleIcon,
  RocketLaunchIcon,
  TargetIcon,
} from '@phosphor-icons/react/ssr';
import Loading from '../../loading';
import { Checklist } from '@/components/checklist';
import { CoPoMatrix } from '@/components/co-po-matrix';
import { EmptyState } from '@/components/data-table';
import { LinkSpinner } from '@/components/link-spinner';
import { RichTextView } from '@/components/rich-text-view';
import { Fact, Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { getMyProgress, type LearnerProgress } from '@/lib/data/content';
import { getOfferingCourse, type OfferingCourse } from '@/lib/data/courses';
import { creditTotal, formatCredits } from '@/lib/domain/catalog';
import {
  getCourseSetup,
  getPublishedPlan,
  getWorkspace,
  type CoursePlan,
  type CourseSetup,
} from '@/lib/data/workspace';
import { cn } from '@/lib/cn';
import { COURSE_TYPE_LABEL, formatDay, formatDate, formatPct } from '@/lib/format';

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
      {setup && <Setup setup={setup} base={base} canTeach={workspace.canTeach} course={course} />}
      {progress && <MyProgress progress={progress} base={base} />}
      <PlanSection plan={plan} course={course} canTeach={workspace.canTeach} base={base} />
      <Syllabus course={course} />
      <About course={course} />
      {course.mode === 'credit' && <Outcomes course={course} />}
    </div>
  );
}

// The teacher's path, in the order students need it. Each step says where it is done; the catalogue course is kept
// by its coordinator (CRS-07), so a teacher who is not the coordinator waits for that step.
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
  return (
    <Checklist
      icon={<RocketLaunchIcon weight="duotone" />}
      title="Get this course ready"
      readyTitle="This course is ready"
      hint={canTeach ? 'Follow them in order; each one links to where it is done.' : undefined}
      steps={[
        {
          title: 'Catalogue course ready',
          done: ready === course.readiness.length,
          detail:
            ready === course.readiness.length
              ? 'Outcomes, syllabus and session plan are in place'
              : `${ready} of ${course.readiness.length} parts ready: outcomes, mapping, syllabus, books, session plan`,
          href: course.canEdit ? `/catalog/${course.id}` : null,
          action: 'Complete it',
          waiting: 'Waiting for the course coordinator',
        },
        {
          ...setup.plan,
          title: 'Write the course plan',
          detail: setup.plan.done ? setup.plan.detail : 'Describe how the course will run.',
          href: link(`${base}/plan#plan`),
          action: 'Write plan',
        },
        {
          ...setup.calendar,
          title: 'Schedule the sessions',
          detail: setup.calendar.done ? setup.calendar.detail : 'Date each session, or start from the session plan.',
          href: link(`${base}/plan#calendar`),
          action: 'Add sessions',
        },
        {
          ...setup.published,
          title: 'Publish to students',
          detail: setup.published.done ? setup.published.detail : 'Students are notified and emailed the plan.',
          href: link(`${base}/plan#publish`),
          action: 'Publish',
        },
        {
          ...setup.content,
          title: 'Add and publish lessons',
          detail: setup.content.done ? setup.content.detail : 'Upload lecture videos, PDFs or links.',
          href: link(`${base}/content`),
          action: 'Add lessons',
        },
      ]}
    />
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
  course: OfferingCourse;
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

function Syllabus({ course }: { course: OfferingCourse }) {
  const books = [...course.textbooks, ...course.references];
  return (
    <Section
      icon={<FileTextIcon weight="duotone" />}
      title="Syllabus"
      description="The modules this course covers, in order, with their practicals, the projects and the books."
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
      {course.modules.length === 0 && books.length === 0 ? (
        !course.syllabusFileKey && (
          <EmptyState
            icon={<FileTextIcon weight="duotone" />}
            text="The syllabus has not been added to this course yet."
          />
        )
      ) : (
        <div className="grid gap-3">
          {course.modules.map((m, i) => (
            <details key={m.id} className="surface p-4" open={i === 0}>
              <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  {i + 1}. {m.title}
                </span>
                {m.hours && <span className="text-muted-foreground text-sm tabular-nums">{m.hours} hours</span>}
              </summary>
              {m.topics && <p className="mt-3 text-sm whitespace-pre-line">{m.topics}</p>}
              {m.practicals.length > 0 && (
                <ul className="mt-3 list-disc pl-5 text-sm">
                  {m.practicals.map((p) => (
                    <li key={p}>Practical: {p}</li>
                  ))}
                </ul>
              )}
            </details>
          ))}
          {course.projects.length > 0 && (
            <div className="surface p-4">
              <h3 className="text-sm font-semibold">Projects</h3>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {course.projects.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {books.length > 0 && (
            <div className="surface p-4">
              <h3 className="text-sm font-semibold">Books</h3>
              <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm">
                {books.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

function About({ course }: { course: OfferingCourse }) {
  return (
    <Section
      icon={<InfoIcon weight="duotone" />}
      title={`${course.code} · ${course.title}`}
      description="The catalogue course this offering runs."
    >
      <dl className="surface grid gap-4 p-5 sm:grid-cols-3">
        <Fact label="Credits">
          {formatCredits(course.credits)}{' '}
          <span className="text-muted-foreground font-normal">({creditTotal(course.credits)} in all)</span>
        </Fact>
        <Fact label="Type">{course.type ? COURSE_TYPE_LABEL[course.type] : '—'}</Fact>
        <Fact label="Course coordinator">{course.coordinator?.name ?? 'Not assigned'}</Fact>
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

function Outcomes({ course }: { course: OfferingCourse }) {
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
                  <span className="flex flex-wrap gap-1.5">
                    {co.bloomLevels.map((level) => (
                      <Badge key={level} variant="secondary" className="w-fit capitalize">
                        {level}
                      </Badge>
                    ))}
                  </span>
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
          description="How strongly each course outcome supports each programme outcome (1 low, 3 high). Hover a code for its title."
        >
          <CoPoMatrix cos={course.cos} outcomes={course.outcomes} cells={course.cells} />
        </Section>
      )}
    </>
  );
}
