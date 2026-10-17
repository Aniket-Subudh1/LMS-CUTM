import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowSquareOutIcon,
  ArrowsDownUpIcon,
  CaretDownIcon,
  CheckCircleIcon,
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
  FilePdfIcon,
  FolderPlusIcon,
  ImageIcon,
  LinkIcon,
  PaperclipIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
  UploadSimpleIcon,
  VideoCameraIcon,
} from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../../loading';
import {
  createLesson,
  deleteLesson,
  deleteModule,
  moveLessonToModule,
  reorderLessons,
  reorderModules,
  saveModule,
  setLessonPublished,
  setModulePublished,
} from './actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { EmptyState } from '@/components/data-table';
import { FileUpload } from '@/components/file-upload';
import { FormDialog } from '@/components/form-dialog';
import { LessonThumb } from '@/components/lesson-thumb';
import { LinkSpinner } from '@/components/link-spinner';
import { PageIcon } from '@/components/page-icon';
import { ProgressRing } from '@/components/progress-ring';
import { RichTextEditor } from '@/components/rich-text-editor';
import { RowMenu, type RowMenuItem } from '@/components/row-menu';
import { SortableList } from '@/components/sortable-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  getContent,
  getLessonActivity,
  getMyProgress,
  type Content,
  type ContentLesson,
  type ContentModule,
  type LearnerProgress,
  type LessonActivity,
} from '@/lib/data/content';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import { objectId } from '@/lib/schemas/common';
import { MAX_NOTES, type LessonKind } from '@/lib/schemas/content';

export const metadata: Metadata = { title: 'Lessons' };

const KIND: Record<LessonKind, { label: string; add: string }> = {
  video: { label: 'Video', add: 'Video' },
  document: { label: 'PDF notes', add: 'PDF notes' },
  link: { label: 'Link', add: 'Link' },
};

const Search = z.object({
  module: objectId.optional().catch(undefined),
  // The dialog to show: module, module-<id>, lesson-<kind>, move-<lessonId> (URL-driven, M03b).
  new: z.string().max(60).optional().catch(undefined),
});

export default function ContentPage({ params, searchParams }: PageProps<'/courses/[offeringId]/content'>) {
  return (
    <Suspense fallback={<Loading />}>
      <ContentView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ContentView({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/content'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/content'>['searchParams'];
}) {
  const { offeringId } = await params;
  const search = Search.parse(await searchParams);
  const content = await getContent(offeringId);
  if (content.access === 'learn') {
    const progress = await getMyProgress(offeringId);
    if (!progress) return null;
    const selected =
      content.modules.find((m) => m.id === search.module) ??
      content.modules.find((m) => m.id === progress.next?.moduleId) ??
      content.modules[0];
    return <Learn content={content} progress={progress} selected={selected} />;
  }
  const selected = content.modules.find((m) => m.id === search.module) ?? content.modules[0];
  const activity = await getLessonActivity(offeringId, selected?.lessons.map((l) => l.id) ?? []);
  return <Build content={content} selected={selected} activity={activity} open={search.new} />;
}

const meta = (lesson: ContentLesson) =>
  [
    KIND[lesson.kind].label,
    lesson.durationSec ? formatDuration(lesson.durationSec) : null,
    lesson.notes > 0 ? `${lesson.notes} note${lesson.notes === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

const countOf = (module: ContentModule) =>
  module.lessons.length === 0
    ? 'No lessons yet'
    : `${module.lessons.length} lesson${module.lessons.length === 1 ? '' : 's'} · ${module.lessons.filter((l) => l.published).length} published`;

// --- Teacher, administrator; read-only for a head of department (design "Builder A", 17 Oct 2026) ---

function Build({
  content,
  selected,
  activity,
  open,
}: {
  content: Content;
  selected: ContentModule | undefined;
  activity: Map<string, LessonActivity>;
  open: string | undefined;
}) {
  const { offeringId, canTeach, modules } = content;
  const base = `/courses/${offeringId}/content`;
  const here = (dialog?: string) =>
    `${base}?${new URLSearchParams({ ...(selected ? { module: selected.id } : {}), ...(dialog ? { new: dialog } : {}) })}`;

  if (modules.length === 0) {
    return (
      <>
        <EmptyState
          icon={<FolderPlusIcon weight="duotone" />}
          text={
            canTeach
              ? 'Start with a module, for example one per unit of the syllabus. Then add lessons to it.'
              : 'The teacher has not added any modules yet.'
          }
        />
        {canTeach && (
          <div className="mt-4 flex justify-center">
            <Button asChild>
              <Link href={here('module')} scroll={false}>
                <FolderPlusIcon /> Add the first module
              </Link>
            </Button>
          </div>
        )}
        {canTeach && open === 'module' && <ModuleDialog key={open} offeringId={offeringId} />}
      </>
    );
  }

  const moduleLink = (module: ContentModule, index: number) => {
    const active = module.id === selected?.id;
    return (
      <Link
        href={`${base}?module=${module.id}`}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-w-0 items-center gap-3 rounded-md px-2.5 py-2.5 transition-colors',
          active ? 'bg-card ring-border ring-1' : 'hover:bg-muted/70',
        )}
      >
        <span
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-sm text-xs font-semibold tabular-nums',
            active ? 'text-primary font-bold' : 'text-muted-foreground',
          )}
        >
          {index + 1}
        </span>
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="text-[0.8125rem] font-medium text-balance">{module.title}</span>
          <span className="text-muted-foreground text-xs">{countOf(module)}</span>
        </span>
        <LinkSpinner />
      </Link>
    );
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="grid gap-1.5 lg:sticky lg:top-20">
        <div className="flex items-center justify-between px-1.5 pt-0.5">
          <h2 className="text-sm font-semibold">Modules</h2>
          {canTeach && (
            <Button asChild variant="ghost" size="sm" className="text-primary">
              <Link href={here('module')} scroll={false}>
                <PlusIcon /> Add
              </Link>
            </Button>
          )}
        </div>
        {canTeach ? (
          <SortableList
            items={modules.map((m, i) => ({ id: m.id, label: m.title, node: moduleLink(m, i) }))}
            action={reorderModules}
            fields={{ offeringId }}
            noun="module"
          />
        ) : (
          <ol className="grid gap-1">
            {modules.map((m, i) => (
              <li key={m.id}>{moduleLink(m, i)}</li>
            ))}
          </ol>
        )}
      </aside>

      {selected && (
        <ModulePane
          content={content}
          module={selected}
          index={modules.indexOf(selected)}
          activity={activity}
          here={here}
        />
      )}

      {canTeach && open === 'module' && <ModuleDialog key={open} offeringId={offeringId} />}
      {canTeach &&
        modules.map((m) => open === `module-${m.id}` && <ModuleDialog key={open} offeringId={offeringId} module={m} />)}
      {canTeach && selected && open?.startsWith('lesson-') && (
        <LessonDialog
          key={open}
          offeringId={offeringId}
          modules={modules}
          moduleId={selected.id}
          kind={open === 'lesson-document' ? 'document' : open === 'lesson-link' ? 'link' : 'video'}
        />
      )}
      {canTeach &&
        selected?.lessons.map(
          (l) =>
            open === `move-${l.id}` && (
              <MoveDialog key={open} offeringId={offeringId} lesson={l} modules={modules} from={selected.id} />
            ),
        )}
    </div>
  );
}

function ModulePane({
  content,
  module,
  index,
  activity,
  here,
}: {
  content: Content;
  module: ContentModule;
  index: number;
  activity: Map<string, LessonActivity>;
  here: (dialog?: string) => string;
}) {
  const { offeringId, canTeach, modules } = content;
  const lessonPage = (id: string, dialog?: string) =>
    `/courses/${offeringId}/content/${id}${dialog ? `?new=${dialog}` : ''}`;
  const allPublished = module.lessons.length > 0 && module.lessons.every((l) => l.published);
  const lessonIds = module.lessons.map((l) => l.id);

  const row = (lesson: ContentLesson, i: number) => {
    const seen = activity.get(lesson.id);
    const ref = { offeringId, lessonId: lesson.id };
    const items: RowMenuItem[] = [
      { kind: 'link', label: 'Open lesson', href: lessonPage(lesson.id), icon: <ArrowSquareOutIcon /> },
      { kind: 'link', label: 'Edit details', href: lessonPage(lesson.id, 'details'), icon: <PencilSimpleIcon /> },
      ...(lesson.kind === 'link'
        ? []
        : [
            {
              kind: 'link' as const,
              label: lesson.kind === 'video' ? 'Replace video' : 'Replace PDF',
              href: lessonPage(lesson.id, 'file'),
              icon: <UploadSimpleIcon />,
            },
          ]),
      { kind: 'link', label: 'Change thumbnail', href: lessonPage(lesson.id, 'thumb'), icon: <ImageIcon /> },
      { kind: 'link', label: `Notes (${lesson.notes})`, href: lessonPage(lesson.id, 'notes'), icon: <PaperclipIcon /> },
      ...(modules.length > 1
        ? [
            {
              kind: 'link' as const,
              label: 'Move to another module…',
              href: here(`move-${lesson.id}`),
              icon: <ArrowsDownUpIcon />,
            },
          ]
        : []),
      { kind: 'moves' },
      lesson.published
        ? {
            kind: 'action',
            label: 'Unpublish',
            icon: <EyeSlashIcon />,
            action: setLessonPublished,
            fields: { ...ref, published: 'false' },
            confirm: {
              title: `Unpublish “${lesson.title}”?`,
              message: 'Students stop seeing it right away. Their progress on it is kept.',
              confirmLabel: 'Unpublish',
            },
          }
        : {
            kind: 'action',
            label: 'Publish',
            icon: <EyeIcon />,
            action: setLessonPublished,
            fields: { ...ref, published: 'true' },
          },
      { kind: 'separator' },
      lesson.published
        ? { kind: 'disabled', label: 'Delete', icon: <TrashIcon />, reason: 'Unpublish it first.' }
        : seen && seen.opened > 0
          ? {
              kind: 'disabled',
              label: 'Delete',
              icon: <TrashIcon />,
              reason: 'Students have opened it. Keep it unpublished instead.',
            }
          : {
              kind: 'action',
              label: 'Delete',
              icon: <TrashIcon />,
              destructive: true,
              action: deleteLesson,
              fields: ref,
              confirm: {
                title: `Delete “${lesson.title}”?`,
                message: 'The lesson, its file, thumbnail and notes are removed for good. Students have not opened it.',
                confirmLabel: 'Delete lesson',
                destructive: true,
              },
            },
    ];
    return (
      <div className="hover:bg-muted/50 flex min-w-0 items-center gap-3 rounded-md px-1.5 py-1.5 transition-colors">
        <LessonThumb
          kind={lesson.kind}
          thumb={lesson.thumb}
          processing={lesson.transcode === 'pending'}
          className="w-24 sm:w-28"
        />
        <Link href={lessonPage(lesson.id)} className="group grid min-w-0 flex-1 gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2 text-sm font-semibold">
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {index + 1}.{i + 1}
            </span>
            <span className="group-hover:text-primary truncate transition-colors">{lesson.title}</span>
          </span>
          <span className="text-muted-foreground truncate text-xs">
            {meta(lesson)}
            {seen && lesson.published && ` · ${seen.opened} opened, ${seen.done} finished`}
          </span>
        </Link>
        <span className="flex shrink-0 flex-col items-end gap-1 max-sm:hidden">
          <Badge variant={lesson.published ? 'success' : 'secondary'}>{lesson.published ? 'Published' : 'Draft'}</Badge>
          {lesson.transcode === 'pending' && <span className="text-warning text-xs">Making phone copy…</span>}
        </span>
        {canTeach && (
          <RowMenu
            label={lesson.title}
            items={items}
            move={{
              id: lesson.id,
              ids: lessonIds,
              action: reorderLessons,
              fields: { offeringId, moduleId: module.id },
            }}
          />
        )}
      </div>
    );
  };

  return (
    <section className="surface grid min-w-0 gap-3 p-4 sm:p-5">
      <header className="flex flex-wrap items-start gap-3 border-b pb-4">
        <div className="grid min-w-0 flex-1 basis-60 gap-0.5">
          <p className="text-primary text-xs font-semibold">
            Module {index + 1} of {modules.length}
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-balance">{module.title}</h2>
          {module.summary && <p className="text-muted-foreground text-sm">{module.summary}</p>}
        </div>
        {canTeach && (
          <div className="flex flex-wrap items-center gap-2">
            {module.lessons.length > 0 && (
              <ActionForm
                action={setModulePublished}
                submitLabel={allPublished ? 'Unpublish all' : 'Publish all'}
                submitVariant="outline"
                submitIcon={allPublished ? <EyeSlashIcon /> : <CheckCircleIcon />}
                {...(allPublished && {
                  confirm: {
                    title: `Unpublish every lesson of “${module.title}”?`,
                    message: 'Students stop seeing them right away. Their progress is kept.',
                  },
                })}
              >
                <input type="hidden" name="offeringId" value={offeringId} />
                <input type="hidden" name="moduleId" value={module.id} />
                <input type="hidden" name="published" value={String(!allPublished)} />
              </ActionForm>
            )}
            <AddLesson here={here} />
            <RowMenu
              label={module.title}
              move={{ id: module.id, ids: modules.map((m) => m.id), action: reorderModules, fields: { offeringId } }}
              items={[
                {
                  kind: 'link',
                  label: 'Rename or describe',
                  href: here(`module-${module.id}`),
                  icon: <PencilSimpleIcon />,
                },
                { kind: 'moves' },
                module.lessons.length > 0
                  ? {
                      kind: 'disabled',
                      label: 'Delete module',
                      icon: <TrashIcon />,
                      reason: 'Move or delete its lessons first.',
                    }
                  : {
                      kind: 'action',
                      label: 'Delete module',
                      icon: <TrashIcon />,
                      destructive: true,
                      action: deleteModule,
                      fields: { offeringId, moduleId: module.id },
                      confirm: {
                        title: `Delete “${module.title}”?`,
                        message: 'The empty module is removed. Students never saw it.',
                        confirmLabel: 'Delete module',
                        destructive: true,
                      },
                    },
              ]}
            />
          </div>
        )}
      </header>

      {module.lessons.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed px-4 py-8 text-center text-sm">
          {canTeach
            ? 'No lessons in this module yet. Add a video, PDF notes or a link.'
            : 'No lessons in this module yet.'}
        </p>
      ) : canTeach ? (
        <SortableList
          items={module.lessons.map((l, i) => ({ id: l.id, label: l.title, node: row(l, i) }))}
          action={reorderLessons}
          fields={{ offeringId, moduleId: module.id }}
          noun="lesson"
          className="gap-1"
        />
      ) : (
        <ol className="grid gap-1">
          {module.lessons.map((l, i) => (
            <li key={l.id}>{row(l, i)}</li>
          ))}
        </ol>
      )}

      {canTeach && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm">
          <span className="flex flex-1 items-center gap-2">
            <PlusIcon className="size-4" /> Add a lesson to {module.title}
          </span>
          {(['video', 'document', 'link'] as const).map((kind) => (
            <Button key={kind} asChild variant="outline" size="sm">
              <Link href={here(`lesson-${kind}`)} scroll={false}>
                {kind === 'video' ? <VideoCameraIcon /> : kind === 'document' ? <FilePdfIcon /> : <LinkIcon />}
                {KIND[kind].add}
              </Link>
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}

function AddLesson({ here }: { here: (dialog?: string) => string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <PlusIcon /> Add lesson <CaretDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-md">
        {(['video', 'document', 'link'] as const).map((kind) => (
          <DropdownMenuItem key={kind} asChild>
            <Link href={here(`lesson-${kind}`)} scroll={false}>
              {kind === 'video' ? <VideoCameraIcon /> : kind === 'document' ? <FilePdfIcon /> : <LinkIcon />}
              {KIND[kind].add}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModuleDialog({ offeringId, module }: { offeringId: string; module?: ContentModule }) {
  const dialog = module ? `module-${module.id}` : 'module';
  return (
    <FormDialog
      openParam={dialog}
      icon={<FolderPlusIcon weight="duotone" />}
      title={module ? 'Rename module' : 'Add a module'}
      description="A module groups related lessons, for example one unit of the syllabus. Students see modules in this order."
      action={saveModule}
      submitLabel={module ? 'Save' : 'Add module'}
      successMessage={module ? 'Module saved.' : 'Module added. Now add its first lesson.'}
    >
      <input type="hidden" name="offeringId" value={offeringId} />
      {module && <input type="hidden" name="moduleId" value={module.id} />}
      <Field name="title" label="Module name" hint="Short and specific, such as “Unit 2 · Regression”.">
        <Input name="title" defaultValue={module?.title} maxLength={160} required />
      </Field>
      <Field name="summary" label="One line about it (optional)" hint="Shown under the title, to students too.">
        <Textarea name="summary" defaultValue={module?.summary ?? ''} maxLength={300} rows={2} />
      </Field>
    </FormDialog>
  );
}

// A draft lesson is invisible to students until it is published. The type was chosen in the "Add lesson" menu.
function LessonDialog({
  offeringId,
  modules,
  moduleId,
  kind,
}: {
  offeringId: string;
  modules: ContentModule[];
  moduleId: string;
  kind: LessonKind;
}) {
  return (
    <FormDialog
      openParam={`lesson-${kind}`}
      size="wide"
      icon={
        kind === 'video' ? (
          <VideoCameraIcon weight="duotone" />
        ) : kind === 'document' ? (
          <FilePdfIcon weight="duotone" />
        ) : (
          <LinkIcon weight="duotone" />
        )
      }
      title={kind === 'video' ? 'Add a video lesson' : kind === 'document' ? 'Add PDF notes' : 'Add a link'}
      description="It stays hidden from students until you publish it."
      action={createLesson}
      submitLabel="Add lesson"
      successMessage="Lesson added as a draft. Publish it when students should see it."
    >
      <input type="hidden" name="offeringId" value={offeringId} />
      <input type="hidden" name="kind" value={kind} />
      <div className="grid gap-5 sm:grid-cols-[1fr_16rem]">
        <Field name="title" label="Title">
          <Input name="title" maxLength={160} required placeholder="Simple linear regression with NumPy" />
        </Field>
        <Field name="moduleId" label="Module">
          <NativeSelect name="moduleId" defaultValue={moduleId} required>
            {modules.map((m, i) => (
              <NativeSelectOption key={m.id} value={m.id}>
                {i + 1}. {m.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      {kind === 'video' && (
        <div className="grid gap-2">
          <span className="text-sm font-medium">Video file</span>
          <FileUpload name="video" purpose="lesson-video" contextId={offeringId} required />
          <p className="text-muted-foreground text-xs">
            A thumbnail and a lighter copy for phones on mobile data are made automatically after upload.
          </p>
          <FieldErrors name="video[]" />
        </div>
      )}
      {kind === 'document' && (
        <div className="grid gap-2">
          <span className="text-sm font-medium">PDF file</span>
          <FileUpload name="document" purpose="lesson-doc" contextId={offeringId} required />
          <FieldErrors name="document[]" />
        </div>
      )}
      {kind === 'link' && (
        <Field name="url" label="Link" hint="The full address, starting with https://">
          <Input name="url" inputMode="url" placeholder="https://" required />
        </Field>
      )}
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
      <details className="group ring-border/80 rounded-md ring-1 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
          <CaretDownIcon className="size-4 transition-transform group-not-open:-rotate-90" />
          Thumbnail and notes <span className="text-muted-foreground font-normal">(optional)</span>
        </summary>
        <div className="grid gap-5 border-t px-4 py-4">
          <div className="grid gap-2">
            <span className="text-sm font-medium">Thumbnail</span>
            <FileUpload name="thumb" purpose="lesson-thumb" contextId={offeringId} />
            <p className="text-muted-foreground text-xs">
              {kind === 'video' ? 'Leave empty to use a frame from the video.' : 'A picture shown in the lesson list.'}
            </p>
            <FieldErrors name="thumb[]" />
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">PDF notes</span>
            <FileUpload name="notes" purpose="lesson-doc" contextId={offeringId} multiple max={MAX_NOTES} />
            <p className="text-muted-foreground text-xs">Up to {MAX_NOTES}. Students find them under the lesson.</p>
            <FieldErrors name="notes[]" />
          </div>
        </div>
      </details>
    </FormDialog>
  );
}

function MoveDialog({
  offeringId,
  lesson,
  modules,
  from,
}: {
  offeringId: string;
  lesson: ContentLesson;
  modules: ContentModule[];
  from: string;
}) {
  return (
    <FormDialog
      openParam={`move-${lesson.id}`}
      icon={<ArrowsDownUpIcon weight="duotone" />}
      title="Move to another module"
      description={`“${lesson.title}” goes to the end of the module you choose.`}
      action={moveLessonToModule}
      submitLabel="Move lesson"
      successMessage="Lesson moved."
    >
      <input type="hidden" name="offeringId" value={offeringId} />
      <input type="hidden" name="lessonId" value={lesson.id} />
      <Field name="moduleId" label="Module">
        <NativeSelect name="moduleId" defaultValue={modules.find((m) => m.id !== from)?.id} required>
          {modules.map((m, i) =>
            m.id === from ? null : (
              <NativeSelectOption key={m.id} value={m.id}>
                {i + 1}. {m.title}
              </NativeSelectOption>
            ),
          )}
        </NativeSelect>
      </Field>
    </FormDialog>
  );
}

// --- Student (design "Lessons tab as rows", 17 Oct 2026) ---

function Learn({
  content,
  progress,
  selected,
}: {
  content: Content;
  progress: LearnerProgress;
  selected: ContentModule | undefined;
}) {
  const base = `/courses/${content.offeringId}/content`;
  const pct = progress.published === 0 ? 0 : (100 * progress.completed) / progress.published;
  if (content.modules.length === 0 || !selected) {
    return (
      <EmptyState
        icon={<PageIcon name="lessons" />}
        text="Your teacher has not published any lessons yet. Check back soon."
      />
    );
  }
  const next = progress.next;
  const index = content.modules.indexOf(selected);
  return (
    <div className="grid gap-4">
      <section className="surface flex flex-wrap items-center gap-x-6 gap-y-4 p-4 sm:p-5">
        <div className="flex min-w-60 flex-1 items-center gap-4">
          <ProgressRing value={pct} label={`${Math.round(pct)}% of the lessons done`} size={64} />
          <div className="grid gap-0.5">
            <p className="font-semibold">
              {progress.completed} of {progress.published} lessons done
            </p>
            <p className="text-muted-foreground text-sm">
              {progress.watchedMin} min watched
              {progress.attendancePct !== null && ` · attendance ${Math.round(progress.attendancePct)}%`}
            </p>
          </div>
        </div>
        {next && (
          <Link
            href={`${base}/${next.id}`}
            className="bg-muted/70 hover:bg-muted group flex min-w-0 flex-1 basis-96 items-center gap-3 rounded-lg p-2 pr-3 transition-colors"
          >
            {/* Smaller on a phone: with the Resume button it must fit 360 px. */}
            <LessonThumb kind="video" thumb={next.thumb} className="w-20 sm:w-28" />
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="text-primary text-xs font-semibold">
                {progress.completed === 0 && next.progressPct === 0 ? 'Start here' : 'Resume'}
              </span>
              <span className="truncate text-sm font-semibold">{next.title}</span>
              {next.progressPct > 0 && (
                <Progress value={next.progressPct} className="bg-background h-1.5" aria-label="Watched" />
              )}
            </span>
            <span className="bg-primary text-primary-foreground inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium">
              <PlayIcon weight="fill" className="size-4" />{' '}
              {progress.completed === 0 && next.progressPct === 0 ? 'Start' : 'Resume'}
              <LinkSpinner />
            </span>
          </Link>
        )}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="grid gap-1 lg:sticky lg:top-20">
          {content.modules.map((m, i) => {
            const mine = progress.modules.find((p) => p.id === m.id);
            const done = mine && mine.total > 0 && mine.done === mine.total;
            const active = m.id === selected.id;
            return (
              <Link
                key={m.id}
                href={`${base}?module=${m.id}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-w-0 items-start gap-3 rounded-md px-2.5 py-2.5 transition-colors',
                  active ? 'bg-card ring-border ring-1' : 'hover:bg-muted/70',
                )}
              >
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-sm text-xs font-semibold tabular-nums',
                    done ? 'bg-success text-white' : active ? 'text-primary font-bold' : 'text-muted-foreground',
                  )}
                >
                  {done ? <CheckIcon weight="bold" className="size-3.5" /> : i + 1}
                </span>
                <span className="grid min-w-0 flex-1 gap-1 leading-tight">
                  <span className="text-[0.8125rem] font-medium text-balance">{m.title}</span>
                  <span className="text-muted-foreground text-xs">
                    {mine?.done ?? 0} of {mine?.total ?? m.lessons.length} done
                  </span>
                  <span className="bg-muted block h-1 overflow-hidden rounded-full">
                    <span
                      className="bg-success block h-full rounded-full"
                      style={{ width: `${mine && mine.total > 0 ? (100 * mine.done) / mine.total : 0}%` }}
                    />
                  </span>
                </span>
              </Link>
            );
          })}
        </aside>

        <section className="surface grid min-w-0 gap-3 p-4 sm:p-5">
          <header className="grid gap-0.5 border-b pb-4">
            <p className="text-primary text-xs font-semibold">
              Module {index + 1} of {content.modules.length}
            </p>
            <h2 className="text-xl font-semibold tracking-tight text-balance">{selected.title}</h2>
            {selected.summary && <p className="text-muted-foreground text-sm">{selected.summary}</p>}
          </header>
          <ol className="grid gap-1">
            {selected.lessons.map((lesson, i) => {
              const upNext = lesson.id === next?.id;
              return (
                <li key={lesson.id}>
                  <Link
                    href={`${base}/${lesson.id}`}
                    className={cn(
                      'group flex min-w-0 items-center gap-3 rounded-md px-2 py-1.5 transition-colors',
                      upNext ? 'bg-muted/70' : 'hover:bg-muted/50',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-6 shrink-0 place-items-center rounded-full',
                        lesson.completed
                          ? 'bg-success text-white'
                          : upNext
                            ? 'bg-primary text-primary-foreground'
                            : 'ring-border ring-1',
                      )}
                    >
                      {lesson.completed ? (
                        <CheckIcon weight="bold" className="size-3" />
                      ) : upNext ? (
                        <PlayIcon weight="fill" className="size-2.5" />
                      ) : null}
                      <span className="sr-only">{lesson.completed ? 'Done' : 'Not done'}</span>
                    </span>
                    <LessonThumb kind={lesson.kind} thumb={lesson.thumb} className="w-24 sm:w-28" />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex min-w-0 items-baseline gap-2 text-sm font-semibold">
                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                          {index + 1}.{i + 1}
                        </span>
                        <span className="group-hover:text-primary truncate transition-colors">{lesson.title}</span>
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        {meta(lesson)}
                        {lesson.completed
                          ? ' · Done'
                          : lesson.progressPct > 0
                            ? ` · ${Math.floor(lesson.progressPct)}% watched`
                            : ''}
                      </span>
                    </span>
                    {upNext && <Badge className="max-sm:hidden">Up next</Badge>}
                    <LinkSpinner />
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}
