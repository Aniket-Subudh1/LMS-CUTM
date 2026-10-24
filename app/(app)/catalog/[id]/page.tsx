import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowSquareOutIcon, PencilSimpleIcon, SealCheckIcon, WarningIcon } from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../loading';
import { markReviewed, reimportCourse, saveCourse, saveSessionPlan, setCoordinator } from '../actions';
import { CourseFields } from '../course-fields';
import { ActionForm } from '@/components/action-form';
import { Checklist, type ChecklistStep } from '@/components/checklist';
import { CourseOutcomes } from '@/components/course-outcomes';
import { CourseSyllabus } from '@/components/course-syllabus';
import { EmptyState } from '@/components/data-table';
import { FilterForm } from '@/components/filter-form';
import { FormDialog } from '@/components/form-dialog';
import { ListEditor } from '@/components/list-editor';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { Fact, Section } from '@/components/section';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCatalogCourse, listFacultyMatches, type CatalogCourse } from '@/lib/data/courses';
import { creditTotal, formatCredits, type ReadinessKey } from '@/lib/domain/catalog';
import type { ActionResult } from '@/lib/errors';
import { COURSE_TYPE_LABEL, formatDate, statusTone } from '@/lib/format';
import { CATALOG_LIMITS, OUTCOME_CODES } from '@/lib/schemas/structure';

// The session plan's kinds; a theory session is written without a prefix (parseSessionLines).
const SESSION_KIND_CHOICES = [
  { value: 'theory', label: 'Theory', prefix: '' },
  { value: 'practice', label: 'Practice', prefix: 'Practice' },
  { value: 'project', label: 'Project', prefix: 'Project' },
];

export const metadata: Metadata = { title: 'Course' };

const Search = z.object({
  coord: z.string().trim().max(80).optional().catch(undefined),
  // The dialog to show (URL-driven): coordinator, sessions, and those of CourseSyllabus and CourseOutcomes.
  new: z.string().max(60).optional().catch(undefined),
});
const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
// Fixed codes; a programme gives them titles, so the catalogue grid shows the codes alone.
const OUTCOMES = OUTCOME_CODES.map((code) => ({ code, title: '' }));
// Each readiness step opens its editor (FormDialog `openParam`) or scrolls to where it is done.
const EDITOR: Record<ReadinessKey, string> = {
  review: '#review',
  coordinator: '?new=coordinator',
  objectives: '?new=objectives',
  outcomes: '?new=co',
  bloom: '#outcomes',
  mapping: '#mapping',
  syllabus: '?new=module',
  books: '?new=books',
  sessions: '?new=sessions',
};

export default function CoursePage({ params, searchParams }: PageProps<'/catalog/[id]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Course params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Course({
  params,
  searchParams,
}: {
  params: PageProps<'/catalog/[id]'>['params'];
  searchParams: PageProps<'/catalog/[id]'>['searchParams'];
}) {
  const course = await getCatalogCourse((await params).id);
  const { coord, new: open } = Search.parse(await searchParams);
  const base = `/catalog/${course.id}`;
  const credit = course.mode === 'credit';
  return (
    <>
      <PageHeader
        icon={<PageIcon name="course" />}
        title={`${course.code} · ${course.title}`}
        description={[
          course.type ? COURSE_TYPE_LABEL[course.type] : null,
          `${formatCredits(course.credits)} (${plural(creditTotal(course.credits), 'credit')})`,
          `Coordinator: ${course.coordinator?.name ?? 'not assigned'}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {course.source && (
              <Button asChild variant="outline">
                <a href={course.source.url} target="_blank" rel="noreferrer">
                  <ArrowSquareOutIcon /> Courseware page
                </a>
              </Button>
            )}
            {course.isAdmin && <CoordinatorDialog course={course} search={coord} />}
            {course.isAdmin && (
              <FormDialog
                trigger={
                  <Button variant="outline">
                    <PencilSimpleIcon weight="duotone" /> Edit details
                  </Button>
                }
                icon={<PageIcon name="course" className="size-8" />}
                title={`Edit ${course.code}`}
                description="Offerings keep the credits they were created with; a change applies to new offerings."
                action={saveCourse}
                submitLabel="Save changes"
                successMessage="Course updated."
              >
                <input type="hidden" name="id" value={course.id} />
                <CourseFields course={course} codeLocked={course.offered} />
              </FormDialog>
            )}
          </>
        }
      />
      <div className="grid gap-6">
        <dl className="surface grid grid-cols-2 gap-x-6 gap-y-4 p-5 md:grid-cols-4">
          <Fact label="Credits">
            <span className="flex flex-wrap gap-1.5 font-normal">
              <Badge variant="outline">Theory {course.credits.theory}</Badge>
              <Badge variant="outline">Practice {course.credits.practice}</Badge>
              <Badge variant="outline">Project {course.credits.project}</Badge>
            </span>
          </Fact>
          <Fact label="Kind">
            {credit ? 'Credit course' : 'Non-credit course'}
            <span className="text-muted-foreground block text-xs font-normal">
              {credit ? 'Outcomes, mapping, marks and exams' : 'Videos and quizzes; attendance from lessons'}
            </span>
          </Fact>
          <Fact label="Type">{course.type ? COURSE_TYPE_LABEL[course.type] : 'Not set'}</Fact>
          <Fact label="Status">
            <Badge variant={statusTone(course.status)}>{course.status}</Badge>
          </Fact>
        </dl>

        {course.issues.length > 0 && <Review course={course} />}
        <Readiness course={course} />

        <CourseSyllabus course={course} base={base} open={open} />
        {credit && (
          <div id="outcomes" className="scroll-mt-24">
            <CourseOutcomes course={course} outcomes={OUTCOMES} base={base} open={open} />
          </div>
        )}
        <SessionPlan course={course} />
        <Programmes course={course} />
      </div>
    </>
  );
}

function Readiness({ course }: { course: CatalogCourse }) {
  const bloomed = course.cos.filter((co) => co.bloomLevels.length > 0).length;
  const mapped = new Set(Object.keys(course.cells).map((key) => key.split(':')[0])).size;
  const books = course.textbooks.length + course.references.length;
  const step: Record<ReadinessKey, { title: string; done: string; todo: string; action: string }> = {
    review: {
      title: 'Check the imported content',
      done: 'Reviewed',
      todo: `${plural(course.issues.length, 'note')} from the import to check`,
      action: 'Review',
    },
    coordinator: {
      title: 'Course coordinator',
      done: course.coordinator?.name ?? '',
      todo: 'The faculty member who keeps this course up to date',
      action: 'Assign',
    },
    objectives: {
      title: 'Objectives',
      done: plural(course.objectives.length, 'objective'),
      todo: 'What the course sets out to do',
      action: 'Add objectives',
    },
    outcomes: {
      title: 'Course outcomes',
      done: plural(course.cos.length, 'outcome'),
      todo: 'What a student can do after the course',
      action: 'Add outcomes',
    },
    bloom: {
      title: 'Bloom levels',
      done: 'Every outcome has a level',
      todo: `${bloomed} of ${course.cos.length} outcomes have a confirmed level`,
      action: 'Confirm levels',
    },
    mapping: {
      title: 'CO–PO mapping',
      done: 'Every outcome is mapped',
      todo: `${mapped} of ${course.cos.length} outcomes mapped to PO or PSO`,
      action: 'Map outcomes',
    },
    syllabus: {
      title: 'Syllabus',
      done: [plural(course.modules.length, 'module'), course.syllabusFileKey ? 'PDF' : null]
        .filter(Boolean)
        .join(' + '),
      todo: 'Modules with their topics and hours',
      action: 'Add syllabus',
    },
    books: {
      title: 'Books',
      done: plural(books, 'book'),
      todo: 'Textbooks and references',
      action: 'Add books',
    },
    sessions: {
      title: 'Session plan',
      done: plural(course.sessionPlan.length, 'session'),
      todo: 'One line per class; teachers start their calendars from it',
      action: 'Add sessions',
    },
  };
  const steps: ChecklistStep[] = course.readiness.map(({ key, done }) => {
    const canDo = key === 'coordinator' ? course.isAdmin : course.canEdit;
    return {
      title: step[key].title,
      detail: done ? step[key].done : step[key].todo,
      done,
      href: canDo ? EDITOR[key] : null,
      action: step[key].action,
      waiting: key === 'coordinator' ? 'An administrator assigns it' : 'Waiting for the course coordinator',
    };
  });
  return (
    <Checklist
      icon={<PageIcon name="overview" className="size-8" />}
      title="Course readiness"
      readyTitle="This course is complete"
      steps={steps}
      hint={course.canEdit ? 'Each step opens the place where it is done.' : undefined}
    />
  );
}

function Review({ course }: { course: CatalogCourse }) {
  return (
    <Alert id="review" className="scroll-mt-24">
      <WarningIcon weight="duotone" />
      <AlertTitle>Check what the import could not settle</AlertTitle>
      <AlertDescription className="grid gap-3">
        <ul className="list-disc space-y-1 pl-5">
          {course.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
        {course.source && (
          <p>
            Imported from{' '}
            <a href={course.source.url} target="_blank" rel="noreferrer" className="text-primary underline">
              its courseware page
            </a>{' '}
            on {formatDate(course.source.importedAt)}. Compare, correct below, then mark it reviewed.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {course.canEdit && (
            <ActionForm
              action={markReviewed}
              submitLabel="Mark reviewed"
              submitSize="sm"
              submitIcon={<SealCheckIcon weight="duotone" />}
              successMessage="Marked reviewed."
            >
              <input type="hidden" name="courseId" value={course.id} />
            </ActionForm>
          )}
          {course.isAdmin && course.source && (
            <FormDialog
              trigger={
                <Button variant="outline" size="sm">
                  Replace with courseware content
                </Button>
              }
              icon={<ArrowSquareOutIcon weight="duotone" />}
              title="Replace with courseware content?"
              description="The course page is read again and its outcomes, mapping, syllabus, books and sessions replace what was edited here. Outcomes keep their codes."
              action={reimportCourse}
              submitLabel="Replace"
              submitVariant="destructive"
              successMessage="Started. Opening the import…"
            >
              <input type="hidden" name="courseId" value={course.id} />
            </FormDialog>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

// An "Edit" button and dialog for the course's editors (the coordinator and admins); nothing for anyone else.
function Editor({
  course,
  param,
  icon,
  title,
  description,
  size,
  action,
  submitLabel,
  children,
}: {
  course: CatalogCourse;
  param: string;
  icon: ReactNode;
  title: string;
  description: string;
  size?: 'wide' | 'full';
  action: (input: FormData) => Promise<ActionResult<unknown>>;
  submitLabel: string;
  children: ReactNode;
}) {
  if (!course.canEdit) return null;
  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="sm">
          <PencilSimpleIcon weight="duotone" /> Edit
        </Button>
      }
      size={size}
      icon={icon}
      title={title}
      description={description}
      openParam={param}
      action={action}
      submitLabel={submitLabel}
      successMessage="Saved."
    >
      <input type="hidden" name="courseId" value={course.id} />
      {children}
    </FormDialog>
  );
}

function SessionPlan({ course }: { course: CatalogCourse }) {
  return (
    <Section
      icon={<PageIcon name="session" className="size-8" />}
      title="Session plan"
      description="The classes in order. A teacher fills an offering's calendar from it by choosing the first date and the weekdays."
      action={
        <Editor
          course={course}
          param="sessions"
          icon={<PageIcon name="session" className="size-8" />}
          title="Session plan"
          description="The sessions in order, each a theory, practice or project session."
          size="wide"
          action={saveSessionPlan}
          submitLabel="Save session plan"
        >
          <ListEditor
            name="sessions"
            label="Sessions"
            noun="session"
            initial={course.sessionPlan.map((s) => ({ text: s.topic, kind: s.kind }))}
            kinds={SESSION_KIND_CHOICES}
            max={CATALOG_LIMITS.sessions}
            maxLength={CATALOG_LIMITS.sessionTopic}
          />
        </Editor>
      }
    >
      {course.sessionPlan.length === 0 ? (
        <EmptyState icon={<PageIcon name="session" className="size-8" />} text="No sessions yet." />
      ) : (
        <ol className="surface grid gap-1.5 p-4 text-sm">
          {course.sessionPlan.map((s, i) => (
            <li key={i} className="flex items-baseline gap-3">
              <span className="text-muted-foreground w-7 shrink-0 text-right text-xs tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1">{s.topic}</span>
              {s.kind !== 'theory' && <Badge variant="outline">{capitalize(s.kind)}</Badge>}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function Programmes({ course }: { course: CatalogCourse }) {
  return (
    <Section
      icon={<PageIcon name="programmes" className="size-8" />}
      title="Used in programmes"
      description="The programmes whose curriculum lists this course."
    >
      {course.programmes.length === 0 ? (
        <EmptyState
          icon={<PageIcon name="programmes" className="size-8" />}
          text="No programme lists this course yet."
        />
      ) : (
        <ul className="surface grid gap-2 p-4 text-sm">
          {course.programmes.map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2">
              {course.isAdmin ? (
                <Link href={`/admin/programs/${p.id}`} className="font-medium hover:underline">
                  {p.code} · {p.name}
                </Link>
              ) : (
                <span className="font-medium">
                  {p.code} · {p.name}
                </span>
              )}
              <span className="text-muted-foreground">{p.basket ?? 'No basket'}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// The coordinator picker: search faculty by name (a GET step that keeps the dialog open), then pick one.
async function CoordinatorDialog({ course, search }: { course: CatalogCourse; search?: string }) {
  const matches = search ? await listFacultyMatches(search) : [];
  const current = course.coordinator;
  return (
    <FormDialog
      trigger={
        <Button variant="outline">
          <PageIcon name="profile" className="size-8" /> Coordinator
        </Button>
      }
      icon={<PageIcon name="profile" className="size-8" />}
      title="Course coordinator"
      description="The faculty member who keeps this course's outcomes, mapping, syllabus and sessions up to date."
      openParam="coordinator"
      preface={
        <FilterForm action={`/catalog/${course.id}`} submitLabel="Find" plain>
          <input type="hidden" name="new" value="coordinator" />
          <label className="grid min-w-56 flex-1 gap-1.5 text-sm font-medium">
            Faculty name or email
            <Input name="coord" defaultValue={search} placeholder="Goutam" minLength={2} required />
          </label>
        </FilterForm>
      }
      action={setCoordinator}
      submitLabel="Save coordinator"
      successMessage="Coordinator saved."
    >
      <input type="hidden" name="courseId" value={course.id} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Choose</legend>
        {current && !matches.some((m) => m.id === current.id) && (
          <Choice value={current.id} checked label={current.name} detail="Current coordinator" />
        )}
        {matches.map((m) => (
          <Choice key={m.id} value={m.id} checked={m.id === current?.id} label={m.name} detail={m.email} />
        ))}
        {search && matches.length === 0 && (
          <p className="text-muted-foreground text-sm">No faculty member matches “{search}”.</p>
        )}
        <Choice value="" checked={!current} label="No coordinator" detail="Only administrators can edit the course" />
      </fieldset>
    </FormDialog>
  );
}

function Choice({ value, checked, label, detail }: { value: string; checked: boolean; label: string; detail: string }) {
  return (
    <label className="ring-border/80 has-checked:ring-primary/40 has-checked:bg-primary/4 flex cursor-pointer items-center gap-3 rounded-md px-4 py-2.5 ring-1">
      <input
        type="radio"
        name="coordinatorId"
        value={value}
        defaultChecked={checked}
        className="accent-primary size-4"
      />
      <span className="grid">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">{detail}</span>
      </span>
    </label>
  );
}
