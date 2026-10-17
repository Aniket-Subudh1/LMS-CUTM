import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CaretRightIcon,
  CheckIcon,
  FolderPlusIcon,
  PencilSimpleIcon,
  PlusIcon,
} from '@phosphor-icons/react/ssr';
import Loading from '../../../loading';
import { createLesson, moveLesson, moveModule, saveModule, setLessonPublished } from './actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { EmptyState } from '@/components/data-table';
import { FileUpload } from '@/components/file-upload';
import { FormDialog } from '@/components/form-dialog';
import { LinkSpinner } from '@/components/link-spinner';
import { PageHeader } from '@/components/page-header';
import { PageIcon, type PageIconName } from '@/components/page-icon';
import { RichTextEditor } from '@/components/rich-text-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { getContent, type Content, type ContentLesson, type ContentModule } from '@/lib/data/content';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import type { ActionResult } from '@/lib/errors';
import type { LessonKind } from '@/lib/schemas/content';

export const metadata: Metadata = { title: 'Lessons' };

const KIND: Record<LessonKind, { label: string; hint: string; icon: PageIconName }> = {
  video: { label: 'Video', hint: 'A recorded lecture', icon: 'video' },
  document: { label: 'PDF', hint: 'Notes or a handout', icon: 'books' },
  link: { label: 'Link', hint: 'A page on another site', icon: 'globe' },
};

export default function ContentPage({ params }: PageProps<'/courses/[offeringId]/content'>) {
  return (
    <Suspense fallback={<Loading />}>
      <ContentView params={params} />
    </Suspense>
  );
}

async function ContentView({ params }: { params: PageProps<'/courses/[offeringId]/content'>['params'] }) {
  const content = await getContent((await params).offeringId);
  return content.access === 'learn' ? <Learn content={content} /> : <Teach content={content} />;
}

// --- Teacher (and admin, head of department) ---

function Teach({ content }: { content: Content }) {
  const { canTeach } = content;
  const lessons = content.modules.flatMap((m) => m.lessons);
  const published = lessons.filter((l) => l.published).length;
  return (
    <>
      <PageHeader
        icon={<PageIcon name="lessons" />}
        title="Content"
        description={
          lessons.length === 0
            ? 'Organise the course into modules, then add lectures, PDFs and links to each one.'
            : `${content.modules.length} module${content.modules.length === 1 ? '' : 's'} · ${lessons.length} lesson${lessons.length === 1 ? '' : 's'}, ${published} published. Students only see published lessons.`
        }
        actions={
          canTeach && (
            <>
              <ModuleDialog offeringId={content.offeringId} />
              {content.modules.length > 0 && (
                <LessonDialog
                  offeringId={content.offeringId}
                  modules={content.modules}
                  moduleId={content.modules.at(-1)?.id}
                  trigger={
                    <Button>
                      <PlusIcon /> Add lesson
                    </Button>
                  }
                />
              )}
            </>
          )
        }
      />
      {content.modules.length === 0 ? (
        <EmptyState
          icon={<FolderPlusIcon weight="duotone" />}
          text={
            canTeach
              ? 'Start with a module, for example one per unit of the syllabus. Then add lessons to it.'
              : 'The teacher has not added any modules yet.'
          }
        />
      ) : (
        <ol className="grid gap-5">
          {content.modules.map((module, index) => (
            <li key={module.id} className="surface grid gap-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="icon-chip size-10 text-sm font-semibold">{index + 1}</span>
                <div className="grid min-w-40 flex-1 basis-48 gap-0.5">
                  <h2 className="truncate text-lg font-semibold tracking-tight">{module.title}</h2>
                  <p className="text-muted-foreground text-sm">
                    {module.lessons.length === 0
                      ? 'No lessons yet'
                      : `${module.lessons.length} lesson${module.lessons.length === 1 ? '' : 's'}, ${module.lessons.filter((l) => l.published).length} published`}
                  </p>
                </div>
                {canTeach && (
                  <div className="ml-auto flex items-center gap-1.5">
                    <Move
                      action={moveModule}
                      offeringId={content.offeringId}
                      idName="moduleId"
                      id={module.id}
                      up={index > 0}
                      down={index < content.modules.length - 1}
                      noun="module"
                    />
                    <ModuleDialog offeringId={content.offeringId} module={module} />
                    <LessonDialog
                      offeringId={content.offeringId}
                      modules={content.modules}
                      moduleId={module.id}
                      trigger={
                        <Button size="sm">
                          <PlusIcon /> Lesson
                        </Button>
                      }
                    />
                  </div>
                )}
              </div>
              {module.lessons.length > 0 && (
                <ol className="grid gap-2">
                  {module.lessons.map((lesson, i) => (
                    <li
                      key={lesson.id}
                      className="ring-border/80 flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 ring-1"
                    >
                      <LessonIcon kind={lesson.kind} />
                      <Link
                        href={`/courses/${content.offeringId}/content/${lesson.id}`}
                        className="hover:text-primary grid min-w-0 flex-1 gap-0.5 transition-colors"
                      >
                        <span className="truncate text-sm font-medium">{lesson.title}</span>
                        <span className="text-muted-foreground text-xs">{meta(lesson)}</span>
                      </Link>
                      <Badge variant={lesson.published ? 'success' : 'secondary'}>
                        {lesson.published ? 'Published' : 'Draft'}
                      </Badge>
                      {canTeach && (
                        <div className="flex items-center gap-1.5">
                          <Move
                            action={moveLesson}
                            offeringId={content.offeringId}
                            idName="lessonId"
                            id={lesson.id}
                            up={i > 0}
                            down={i < module.lessons.length - 1}
                            noun="lesson"
                          />
                          <ActionForm
                            action={setLessonPublished}
                            submitLabel={lesson.published ? 'Unpublish' : 'Publish'}
                            submitVariant={lesson.published ? 'outline' : 'default'}
                            submitSize="sm"
                          >
                            <input type="hidden" name="offeringId" value={content.offeringId} />
                            <input type="hidden" name="lessonId" value={lesson.id} />
                            <input type="hidden" name="published" value={String(!lesson.published)} />
                          </ActionForm>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function meta(lesson: ContentLesson) {
  const kind = KIND[lesson.kind].label;
  return lesson.durationSec ? `${kind} · ${formatDuration(lesson.durationSec)}` : kind;
}

function LessonIcon({ kind, className }: { kind: LessonKind; className?: string }) {
  return (
    <span className={cn('grid size-9 shrink-0 place-items-center', className)}>
      <PageIcon name={KIND[kind].icon} className="size-8" />
    </span>
  );
}

function Move({
  action,
  offeringId,
  idName,
  id,
  up,
  down,
  noun,
}: {
  action: (input: FormData) => Promise<ActionResult<unknown>>;
  offeringId: string;
  idName: 'moduleId' | 'lessonId';
  id: string;
  up: boolean;
  down: boolean;
  noun: string;
}) {
  return (['up', 'down'] as const).map((direction) =>
    (direction === 'up' ? up : down) ? (
      <ActionForm
        key={direction}
        action={action}
        submitLabel={`Move ${noun} ${direction}`}
        submitVariant="outline"
        submitIcon={direction === 'up' ? <ArrowUpIcon /> : <ArrowDownIcon />}
        iconOnly
      >
        <input type="hidden" name="offeringId" value={offeringId} />
        <input type="hidden" name={idName} value={id} />
        <input type="hidden" name="direction" value={direction} />
      </ActionForm>
    ) : (
      <span key={direction} aria-hidden="true" className="size-8" />
    ),
  );
}

function ModuleDialog({ offeringId, module }: { offeringId: string; module?: ContentModule }) {
  return (
    <FormDialog
      trigger={
        module ? (
          <Button variant="outline" size="icon-sm" aria-label={`Rename ${module.title}`} title="Rename module">
            <PencilSimpleIcon />
          </Button>
        ) : (
          <Button variant="outline">
            <FolderPlusIcon /> Add module
          </Button>
        )
      }
      icon={<FolderPlusIcon weight="duotone" />}
      title={module ? 'Rename module' : 'Add a module'}
      description="A module groups related lessons, for example one unit of the syllabus. Students see modules in this order."
      action={saveModule}
      submitLabel={module ? 'Save' : 'Add module'}
      successMessage={module ? 'Module renamed.' : 'Module added. Now add its first lesson.'}
    >
      <input type="hidden" name="offeringId" value={offeringId} />
      {module && <input type="hidden" name="moduleId" value={module.id} />}
      <Field name="title" label="Module name" hint="Short and specific, such as “Unit 2 · Sorting and searching”.">
        <Input name="title" defaultValue={module?.title} maxLength={160} required />
      </Field>
    </FormDialog>
  );
}

// The lesson type is a set of radio cards; the matching upload or link field shows with CSS, so the form needs
// no script of its own. A draft lesson is invisible to students until it is published.
function LessonDialog({
  offeringId,
  modules,
  moduleId,
  trigger,
}: {
  offeringId: string;
  modules: ContentModule[];
  moduleId?: string;
  trigger: ReactNode;
}) {
  const shown = (kind: LessonKind) =>
    cn(
      'hidden gap-2',
      {
        video: '[form:has([name=kind][value=video]:checked)_&]:grid',
        document: '[form:has([name=kind][value=document]:checked)_&]:grid',
        link: '[form:has([name=kind][value=link]:checked)_&]:grid',
      }[kind],
    );
  return (
    <FormDialog
      trigger={trigger}
      size="wide"
      icon={<PlusIcon weight="duotone" />}
      title="Add a lesson"
      description="Upload a lecture video, attach a PDF or link to a resource. It stays hidden from students until you publish it."
      action={createLesson}
      submitLabel="Add lesson"
      successMessage="Lesson added as a draft. Publish it when students should see it."
    >
      <input type="hidden" name="offeringId" value={offeringId} />
      <Field name="moduleId" label="Module">
        <NativeSelect name="moduleId" defaultValue={moduleId} required>
          {modules.map((m, i) => (
            <NativeSelectOption key={m.id} value={m.id}>
              {i + 1}. {m.title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Lesson type</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(KIND) as LessonKind[]).map((kind) => {
            const { label, hint, icon } = KIND[kind];
            return (
              <label
                key={kind}
                className="ring-border has-checked:ring-primary has-checked:bg-primary/4 has-focus-visible:ring-ring flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ring-1 transition-colors has-checked:ring-2"
              >
                <input type="radio" name="kind" value={kind} defaultChecked={kind === 'video'} className="sr-only" />
                <PageIcon name={icon} className="size-8" />
                <span className="grid">
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-muted-foreground text-xs">{hint}</span>
                </span>
              </label>
            );
          })}
        </div>
        <FieldErrors name="kind" />
      </fieldset>
      <Field name="title" label="Title">
        <Input name="title" maxLength={160} required placeholder="Merge sort, step by step" />
      </Field>
      <div className={shown('video')}>
        <span className="text-sm font-medium">Video file</span>
        <FileUpload name="video" purpose="lesson-video" contextId={offeringId} />
        <p className="text-muted-foreground text-xs">
          A lighter copy for phones on mobile data is made automatically after upload.
        </p>
        <FieldErrors name="video[]" />
      </div>
      <div className={shown('document')}>
        <span className="text-sm font-medium">PDF file</span>
        <FileUpload name="document" purpose="lesson-doc" contextId={offeringId} />
        <FieldErrors name="document[]" />
      </div>
      <div className={shown('link')}>
        <Field name="url" label="Link" hint="The full address, starting with https://">
          <Input name="url" inputMode="url" placeholder="https://" />
        </Field>
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium">
          Description <span className="text-muted-foreground font-normal">(optional)</span>
        </span>
        <RichTextEditor
          name="description"
          placeholder="What students should look for, or what to do after this lesson."
        />
        <FieldErrors name="description" />
      </div>
    </FormDialog>
  );
}

// --- Student ---

function Learn({ content }: { content: Content }) {
  const lessons = content.modules.flatMap((m) => m.lessons);
  const completed = lessons.filter((l) => l.completed).length;
  const next = lessons.find((l) => !l.completed);
  return (
    <>
      <PageHeader
        icon={<PageIcon name="lessons" />}
        title="Lessons"
        description="Work through them in order. Videos complete as you watch; mark PDFs and links done when you finish them."
      />
      {lessons.length === 0 ? (
        <EmptyState
          icon={<PageIcon name="lessons" />}
          text="Your teacher has not published any lessons yet. Check back soon."
        />
      ) : (
        <div className="grid gap-5">
          <section className="surface flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
            <div className="grid min-w-48 flex-1 gap-2">
              <p className="text-sm font-medium">
                {completed} of {lessons.length} complete
              </p>
              <Progress
                value={(100 * completed) / lessons.length}
                className="bg-muted h-2.5"
                aria-label="Lessons complete"
              />
            </div>
            {next && (
              <Button asChild>
                <Link href={`/courses/${content.offeringId}/content/${next.id}`}>
                  {completed === 0 && next.progressPct === 0 ? 'Start' : 'Continue'}: {next.title}
                  <ArrowRightIcon />
                  <LinkSpinner />
                </Link>
              </Button>
            )}
          </section>
          <ol className="grid gap-5">
            {content.modules.map((module, index) => (
              <li key={module.id} className="surface grid gap-3 p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="icon-chip size-10 text-sm font-semibold">{index + 1}</span>
                  <div className="grid min-w-0 flex-1">
                    <h2 className="truncate text-lg font-semibold tracking-tight">{module.title}</h2>
                    <p className="text-muted-foreground text-sm">
                      {module.lessons.filter((l) => l.completed).length} of {module.lessons.length} complete
                    </p>
                  </div>
                </div>
                <ol className="grid gap-2">
                  {module.lessons.map((lesson) => (
                    <li key={lesson.id}>
                      <Link
                        href={`/courses/${content.offeringId}/content/${lesson.id}`}
                        className={cn(
                          'hover:ring-primary/35 group flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 transition-colors',
                          lesson.id === next?.id ? 'bg-primary/4 ring-primary/25' : 'ring-border/80',
                        )}
                      >
                        {lesson.completed ? (
                          <span className="bg-success grid size-9 shrink-0 place-items-center rounded-lg text-white">
                            <CheckIcon weight="bold" className="size-4" />
                            <span className="sr-only">Complete</span>
                          </span>
                        ) : (
                          <LessonIcon kind={lesson.kind} />
                        )}
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span className="truncate text-sm font-medium">{lesson.title}</span>
                          <span className="text-muted-foreground text-xs">
                            {meta(lesson)}
                            {!lesson.completed &&
                              lesson.progressPct > 0 &&
                              ` · ${Math.floor(lesson.progressPct)}% watched`}
                          </span>
                        </span>
                        {lesson.id === next?.id && <Badge>Up next</Badge>}
                        <LinkSpinner />
                        <CaretRightIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
