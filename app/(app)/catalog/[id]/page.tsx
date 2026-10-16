import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowSquareOutIcon,
  BookBookmarkIcon,
  BookOpenTextIcon,
  CalendarDotsIcon,
  ClipboardTextIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  GraduationCapIcon,
  GridFourIcon,
  ListChecksIcon,
  PencilSimpleIcon,
  SealCheckIcon,
  TargetIcon,
  UserCircleGearIcon,
  WarningIcon,
} from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../loading';
import {
  markReviewed,
  reimportCourse,
  saveBooks,
  saveCoMap,
  saveCos,
  saveCourse,
  saveObjectives,
  saveSessionPlan,
  saveSyllabus,
  setCoordinator,
} from '../actions';
import { CourseFields } from '../course-fields';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { Checklist, type ChecklistStep } from '@/components/checklist';
import { CoPoEditor } from '@/components/co-po-editor';
import { CoPoMatrix } from '@/components/co-po-matrix';
import { EmptyState } from '@/components/data-table';
import { FileUpload } from '@/components/file-upload';
import { FilterForm } from '@/components/filter-form';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { Fact, Section } from '@/components/section';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getCatalogCourse, listFacultyMatches, type CatalogCourse } from '@/lib/data/courses';
import { creditTotal, formatCredits, formatSessionLines, type ReadinessKey } from '@/lib/domain/catalog';
import type { ActionResult } from '@/lib/errors';
import { COURSE_TYPE_LABEL, formatDate, statusTone } from '@/lib/format';
import { BLOOM_LEVELS, CATALOG_LIMITS, OUTCOME_CODES } from '@/lib/schemas/structure';

export const metadata: Metadata = { title: 'Course' };

const Search = z.object({ coord: z.string().trim().max(80).optional().catch(undefined) });
const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
// Fixed codes; a programme gives them titles, so the catalogue grid shows the codes alone.
const OUTCOMES = OUTCOME_CODES.map((code) => ({ code, title: '' }));
// Each readiness step opens its editor (FormDialog `openParam`) or, for the import review, scrolls to the notes.
const EDITOR: Record<ReadinessKey, string> = {
  review: '#review',
  coordinator: '?new=coordinator',
  objectives: '?new=objectives',
  outcomes: '?new=outcomes',
  bloom: '?new=outcomes',
  mapping: '?new=mapping',
  syllabus: '?new=syllabus',
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
  const { coord } = Search.parse(await searchParams);
  const credit = course.mode === 'credit';
  return (
    <>
      <PageHeader
        icon={<BookOpenTextIcon weight="duotone" />}
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
                icon={<BookOpenTextIcon weight="duotone" />}
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

        <Objectives course={course} />
        {credit && <Outcomes course={course} />}
        {credit && course.cos.length > 0 && <Mapping course={course} />}
        <Syllabus course={course} />
        {credit && <Books course={course} />}
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
      icon={<ListChecksIcon weight="duotone" />}
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

function Objectives({ course }: { course: CatalogCourse }) {
  return (
    <Section
      icon={<ClipboardTextIcon weight="duotone" />}
      title="Objectives"
      description="What the course sets out to do."
      action={
        <Editor
          course={course}
          param="objectives"
          icon={<ClipboardTextIcon weight="duotone" />}
          title="Objectives"
          description={`One objective per line, at most ${CATALOG_LIMITS.objectives}.`}
          size="wide"
          action={saveObjectives}
          submitLabel="Save objectives"
        >
          <Field name="objectives" label="Objectives">
            <Textarea name="objectives" rows={8} defaultValue={course.objectives.join('\n')} />
          </Field>
        </Editor>
      }
    >
      {course.objectives.length === 0 ? (
        <EmptyState icon={<ClipboardTextIcon weight="duotone" />} text="No objectives yet." />
      ) : (
        <ol className="surface grid list-decimal gap-2 p-5 pl-10 text-sm">
          {course.objectives.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function Outcomes({ course }: { course: CatalogCourse }) {
  const rows = [
    ...course.cos,
    ...Array.from({ length: Math.min(3, CATALOG_LIMITS.cos - course.cos.length) }, () => null),
  ];
  return (
    <Section
      icon={<TargetIcon weight="duotone" />}
      title="Course outcomes"
      description="What a student can do after the course, each at one to three Bloom levels."
      action={
        <Editor
          course={course}
          param="outcomes"
          icon={<TargetIcon weight="duotone" />}
          title="Course outcomes"
          description="Edit, add or remove outcomes and tick their Bloom levels. A level marked “suggested” was guessed from the first verb; saving confirms it."
          size="wide"
          action={saveCos}
          submitLabel="Save outcomes"
        >
          <input type="hidden" name="rows" value={rows.length} />
          <ol className="grid gap-4">
            {rows.map((co, i) => {
              const ticked = co?.bloomLevels.length ? co.bloomLevels : co?.suggestedBloom ? [co.suggestedBloom] : [];
              return (
                <li key={co?.id ?? `new-${i}`} className="ring-border/80 grid gap-3 rounded-xl p-4 ring-1">
                  {co && <input type="hidden" name={`coId_${i}`} value={co.id} />}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{co?.code ?? 'New outcome'}</span>
                    {co && (
                      <label className="text-muted-foreground flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name={`remove_${i}`}
                          value="true"
                          className="accent-destructive size-4"
                        />
                        Remove
                      </label>
                    )}
                  </div>
                  <Field name={`statement_${i}`} label="Statement">
                    <Textarea
                      name={`statement_${i}`}
                      rows={2}
                      maxLength={CATALOG_LIMITS.coStatement}
                      defaultValue={co?.statement}
                      placeholder={co ? undefined : 'Start with a verb: Explain…, Design…, Analyse…'}
                    />
                  </Field>
                  <fieldset className="grid gap-1.5">
                    <legend className="text-muted-foreground mb-1.5 text-xs">
                      Bloom levels
                      {co && !co.bloomLevels.length && co.suggestedBloom && ' · suggested from the verb'}
                    </legend>
                    <div className="flex flex-wrap gap-1.5">
                      {BLOOM_LEVELS.map((level) => (
                        <label
                          key={level}
                          className="ring-border has-checked:bg-primary/10 has-checked:text-primary has-checked:ring-primary/40 flex cursor-pointer items-center rounded-lg px-2.5 py-1 text-sm capitalize ring-1 transition-colors"
                        >
                          <input
                            type="checkbox"
                            name={`bloom_${i}[]`}
                            value={level}
                            defaultChecked={ticked.includes(level)}
                            className="sr-only"
                          />
                          {level}
                        </label>
                      ))}
                    </div>
                    <FieldErrors name={`bloom_${i}`} />
                  </fieldset>
                </li>
              );
            })}
          </ol>
          {rows.length < CATALOG_LIMITS.cos && (
            <p className="text-muted-foreground text-xs">Need more rows? Save, and empty ones appear again.</p>
          )}
        </Editor>
      }
    >
      {course.cos.length === 0 ? (
        <EmptyState icon={<TargetIcon weight="duotone" />} text="No course outcomes yet." />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-3">
          {course.cos.map((co) => (
            <li key={co.id} className="surface flex gap-3 p-4">
              <span className="icon-chip h-8 min-w-12 px-2 text-xs font-semibold">{co.code}</span>
              <span className="grid content-start gap-2 text-sm">
                {co.statement}
                <span className="flex flex-wrap gap-1.5">
                  {co.bloomLevels.map((level) => (
                    <Badge key={level} variant="secondary">
                      {capitalize(level)}
                    </Badge>
                  ))}
                  {co.bloomLevels.length === 0 && (
                    <Badge variant="warning">
                      {co.suggestedBloom ? `Suggested: ${capitalize(co.suggestedBloom)}` : 'No level yet'}
                    </Badge>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Mapping({ course }: { course: CatalogCourse }) {
  return (
    <Section
      icon={<GridFourIcon weight="duotone" />}
      title="CO–PO mapping"
      description="How strongly each outcome supports the programme outcomes PO1–PO12 and PSO1–PSO3 (1 slight, 3 high)."
      action={
        <Editor
          course={course}
          param="mapping"
          icon={<GridFourIcon weight="duotone" />}
          title="CO–PO mapping"
          description="Each programme titles the codes in its own words; the codes are the same everywhere."
          size="full"
          action={saveCoMap}
          submitLabel="Save mapping"
        >
          <CoPoEditor cos={course.cos} outcomes={OUTCOMES} cells={course.cells} />
          <FieldErrors name="cell[]" />
        </Editor>
      }
    >
      <CoPoMatrix cos={course.cos} outcomes={OUTCOMES} cells={course.cells} />
    </Section>
  );
}

function Syllabus({ course }: { course: CatalogCourse }) {
  const rows = [
    ...course.modules,
    ...Array.from({ length: Math.min(2, CATALOG_LIMITS.modules - course.modules.length) }, () => null),
  ];
  return (
    <Section
      icon={<FileTextIcon weight="duotone" />}
      title="Syllabus"
      description="The modules in teaching order, their practicals, the course's projects and the official PDF."
      action={
        <>
          {course.syllabusFileKey && (
            <Button asChild variant="outline" size="sm">
              <a href={`/api/files/${course.syllabusFileKey}`} target="_blank" rel="noreferrer">
                <DownloadSimpleIcon /> PDF
              </a>
            </Button>
          )}
          <Editor
            course={course}
            param="syllabus"
            icon={<FileTextIcon weight="duotone" />}
            title="Syllabus"
            description="Modules in teaching order. Hours as 6 or 4+0+2 (theory + practice + project)."
            size="wide"
            action={saveSyllabus}
            submitLabel="Save syllabus"
          >
            <input type="hidden" name="rows" value={rows.length} />
            <ol className="grid gap-4">
              {rows.map((m, i) => (
                <li key={m?.id ?? `new-${i}`} className="ring-border/80 grid gap-3 rounded-xl p-4 ring-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{m ? `Module ${i + 1}` : 'New module'}</span>
                    {m && (
                      <label className="text-muted-foreground flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name={`remove_${i}`}
                          value="true"
                          className="accent-destructive size-4"
                        />
                        Remove
                      </label>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                    <Field name={`title_${i}`} label="Title">
                      <Input name={`title_${i}`} maxLength={CATALOG_LIMITS.moduleTitle} defaultValue={m?.title} />
                    </Field>
                    <Field name={`hours_${i}`} label="Hours">
                      <Input name={`hours_${i}`} maxLength={CATALOG_LIMITS.moduleHours} defaultValue={m?.hours ?? ''} />
                    </Field>
                  </div>
                  <Field name={`topics_${i}`} label="Topics">
                    <Textarea name={`topics_${i}`} rows={3} defaultValue={m?.topics} />
                  </Field>
                  <Field name={`practicals_${i}`} label="Practicals" hint="One per line.">
                    <Textarea name={`practicals_${i}`} rows={2} defaultValue={m?.practicals.join('\n')} />
                  </Field>
                </li>
              ))}
            </ol>
            <Field name="projects" label="Projects" hint="One per line: the projects students choose from.">
              <Textarea name="projects" rows={4} defaultValue={course.projects.join('\n')} />
            </Field>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Official syllabus PDF (optional)</span>
              {course.syllabusFileKey && (
                <label className="text-muted-foreground flex items-center gap-2 text-sm">
                  <input type="checkbox" name="removeFile" value="true" className="accent-primary size-4" />
                  Remove the current PDF
                </label>
              )}
              <FileUpload name="syllabusFile" purpose="syllabus" contextId={course.id} />
              <FieldErrors name="syllabusFile[]" />
            </div>
          </Editor>
        </>
      }
    >
      {course.modules.length === 0 && course.projects.length === 0 ? (
        <EmptyState icon={<FileTextIcon weight="duotone" />} text="No modules yet." />
      ) : (
        <div className="grid gap-3">
          {course.modules.map((m, i) => (
            <details key={m.id} className="surface group p-4" open={i === 0}>
              <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  {i + 1}. {m.title}
                </span>
                {m.hours && <span className="text-muted-foreground text-sm tabular-nums">{m.hours} hours</span>}
              </summary>
              {m.topics && <p className="mt-3 text-sm whitespace-pre-line">{m.topics}</p>}
              {m.practicals.length > 0 && (
                <>
                  <p className="text-muted-foreground mt-3 text-xs font-medium tracking-wide uppercase">Practicals</p>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {m.practicals.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </>
              )}
            </details>
          ))}
          {course.projects.length > 0 && (
            <div className="surface p-4">
              <p className="font-medium">Projects</p>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {course.projects.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

function Books({ course }: { course: CatalogCourse }) {
  return (
    <Section
      icon={<BookBookmarkIcon weight="duotone" />}
      title="Books"
      description="Textbooks students need, and further reading."
      action={
        <Editor
          course={course}
          param="books"
          icon={<BookBookmarkIcon weight="duotone" />}
          title="Books"
          description="One book per line."
          size="wide"
          action={saveBooks}
          submitLabel="Save books"
        >
          <Field name="textbooks" label="Textbooks">
            <Textarea name="textbooks" rows={4} defaultValue={course.textbooks.join('\n')} />
          </Field>
          <Field name="references" label="References">
            <Textarea name="references" rows={4} defaultValue={course.references.join('\n')} />
          </Field>
        </Editor>
      }
    >
      {course.textbooks.length + course.references.length === 0 ? (
        <EmptyState icon={<BookBookmarkIcon weight="duotone" />} text="No books yet." />
      ) : (
        <div className="surface grid gap-4 p-5 text-sm md:grid-cols-2">
          {(
            [
              ['Textbooks', course.textbooks],
              ['References', course.references],
            ] as const
          ).map(
            ([label, books]) =>
              books.length > 0 && (
                <div key={label}>
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
                  <ul className="mt-2 grid list-disc gap-1.5 pl-5">
                    {books.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              ),
          )}
        </div>
      )}
    </Section>
  );
}

function SessionPlan({ course }: { course: CatalogCourse }) {
  return (
    <Section
      icon={<CalendarDotsIcon weight="duotone" />}
      title="Session plan"
      description="The classes in order. A teacher fills an offering's calendar from it by choosing the first date and the weekdays."
      action={
        <Editor
          course={course}
          param="sessions"
          icon={<CalendarDotsIcon weight="duotone" />}
          title="Session plan"
          description="One session per line, in order. Put “Practice:” or “Project:” in front of practice and project sessions."
          size="wide"
          action={saveSessionPlan}
          submitLabel="Save session plan"
        >
          <Field name="sessions" label="Sessions">
            <Textarea
              name="sessions"
              rows={14}
              defaultValue={formatSessionLines(course.sessionPlan)}
              placeholder={'Index of a point with respect to a closed curve\nProject: Study on residues'}
            />
          </Field>
        </Editor>
      }
    >
      {course.sessionPlan.length === 0 ? (
        <EmptyState icon={<CalendarDotsIcon weight="duotone" />} text="No sessions yet." />
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
      icon={<GraduationCapIcon weight="duotone" />}
      title="Used in programmes"
      description="The programmes whose curriculum lists this course."
    >
      {course.programmes.length === 0 ? (
        <EmptyState icon={<GraduationCapIcon weight="duotone" />} text="No programme lists this course yet." />
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
          <UserCircleGearIcon weight="duotone" /> Coordinator
        </Button>
      }
      icon={<UserCircleGearIcon weight="duotone" />}
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
    <label className="ring-border/80 has-checked:ring-primary/40 has-checked:bg-primary/4 flex cursor-pointer items-center gap-3 rounded-xl px-4 py-2.5 ring-1">
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
