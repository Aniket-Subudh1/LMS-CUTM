import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  CheckIcon,
  DeviceMobileIcon,
  EyeIcon,
  EyeSlashIcon,
  FilePdfIcon,
  ImageIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react/ssr';
import Loading from '../../../../loading';
import {
  addLessonNotes,
  clearLessonThumb,
  completeLesson,
  deleteLesson,
  removeLessonNote,
  replaceLessonFile,
  setLessonPublished,
  setLessonThumb,
  updateLesson,
} from '../actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { FileUpload } from '@/components/file-upload';
import { FormDialog } from '@/components/form-dialog';
import { LessonThumb } from '@/components/lesson-thumb';
import { LinkSpinner } from '@/components/link-spinner';
import { PageIcon, type PageIconName } from '@/components/page-icon';
import { ProgressRing } from '@/components/progress-ring';
import { RichTextEditor } from '@/components/rich-text-editor';
import { RichTextView } from '@/components/rich-text-view';
import { RowMenu } from '@/components/row-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VideoPlayer } from '@/components/video-player';
import {
  getContent,
  getLesson,
  getLessonActivity,
  getMyProgress,
  type Content,
  type LessonActivity,
  type LessonDetail,
} from '@/lib/data/content';
import { getSettings } from '@/lib/data/settings';
import { cn } from '@/lib/cn';
import { formatBytes, formatDate, formatDateTime, formatDuration, formatPct } from '@/lib/format';
import { MAX_NOTES, type LessonKind } from '@/lib/schemas/content';

export const metadata: Metadata = { title: 'Lesson' };

const KIND: Record<LessonKind, { label: string; icon: PageIconName }> = {
  video: { label: 'Video', icon: 'video' },
  document: { label: 'PDF notes', icon: 'books' },
  link: { label: 'Link', icon: 'globe' },
};

export default function LessonPage({ params }: PageProps<'/courses/[offeringId]/content/[lessonId]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <LessonView params={params} />
    </Suspense>
  );
}

async function LessonView({ params }: { params: PageProps<'/courses/[offeringId]/content/[lessonId]'>['params'] }) {
  const { offeringId, lessonId } = await params;
  const [lesson, content, { completePct }] = await Promise.all([
    getLesson(offeringId, lessonId),
    getContent(offeringId),
    getSettings('lessons'),
  ]);
  if (content.access === 'learn') {
    const progress = await getMyProgress(offeringId);
    return (
      <Player
        lesson={lesson}
        content={content}
        completePct={completePct}
        pct={progress && progress.published > 0 ? (100 * progress.completed) / progress.published : 0}
      />
    );
  }
  const activity = (await getLessonActivity(offeringId, [lesson.id])).get(lesson.id) ?? { opened: 0, done: 0 };
  return <Editor lesson={lesson} content={content} activity={activity} />;
}

const fileSrc = (key: string) => `/api/files/${key}`;
const position = (content: Content, lessonId: string) => {
  const order = content.modules.flatMap((m) => m.lessons);
  const at = order.findIndex((l) => l.id === lessonId);
  const unit = content.modules.find((m) => m.lessons.some((l) => l.id === lessonId));
  return {
    previous: order[at - 1],
    next: order[at + 1],
    unit,
    moduleIndex: unit ? content.modules.indexOf(unit) : -1,
    inModule: unit ? unit.lessons.findIndex((l) => l.id === lessonId) : -1,
  };
};

// --- Teacher, administrator; read-only for a head of department (design "Editor A", 17 Oct 2026) ---

function Editor({ lesson, content, activity }: { lesson: LessonDetail; content: Content; activity: LessonActivity }) {
  const { offeringId, canTeach } = content;
  const { unit } = position(content, lesson.id);
  const ids = (
    <>
      <input type="hidden" name="offeringId" value={offeringId} />
      <input type="hidden" name="lessonId" value={lesson.id} />
    </>
  );
  const thumb = lesson.thumbKey ?? lesson.frameKey;
  const watched = lesson.kind === 'video' && activity.opened > 0;

  return (
    <div className="grid gap-4">
      <nav aria-label="Breadcrumb" className="text-muted-foreground flex min-w-0 items-center gap-2 text-sm">
        <Link
          href={`/courses/${offeringId}/content${unit ? `?module=${unit.id}` : ''}`}
          className="hover:text-foreground flex shrink-0 items-center gap-1.5 transition-colors"
        >
          <ArrowLeftIcon /> {unit?.title ?? 'Content'}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground truncate font-medium">{lesson.title}</span>
      </nav>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="grid min-w-0 gap-4">
          <Preview lesson={lesson} />
          <section className="surface grid gap-3 p-5">
            <h2 className="text-base font-semibold">What students see with it</h2>
            {lesson.description ? (
              <RichTextView doc={lesson.description} />
            ) : (
              <p className="text-muted-foreground text-sm">
                No description yet. {canTeach && 'Add one under Details to tell students what to look for.'}
              </p>
            )}
          </section>
        </div>

        <div className="grid gap-4">
          <Card
            title="Status"
            aside={
              <Badge variant={lesson.published ? 'success' : 'secondary'}>
                {lesson.published ? 'Published' : 'Draft'}
              </Badge>
            }
          >
            <p className="text-muted-foreground text-sm">
              {lesson.published
                ? `Students see it${lesson.publishedAt ? ` since ${formatDate(lesson.publishedAt)}` : ''}. ${activity.opened} opened it, ${activity.done} finished.`
                : 'Hidden from students until you publish it.'}
            </p>
            {canTeach && (
              <ActionForm
                action={setLessonPublished}
                submitLabel={lesson.published ? 'Unpublish' : 'Publish'}
                submitVariant={lesson.published ? 'outline' : 'default'}
                submitIcon={lesson.published ? <EyeSlashIcon /> : <EyeIcon />}
                {...(lesson.published && {
                  confirm: {
                    title: 'Unpublish this lesson?',
                    message: 'Students stop seeing it right away. Their progress on it is kept.',
                  },
                })}
              >
                {ids}
                <input type="hidden" name="published" value={String(!lesson.published)} />
              </ActionForm>
            )}
          </Card>

          <Card
            title="Details"
            aside={
              canTeach && (
                <FormDialog
                  openParam="details"
                  trigger={
                    <Button variant="outline" size="sm">
                      <PencilSimpleIcon /> Edit
                    </Button>
                  }
                  size="wide"
                  icon={<PageIcon name="lesson" className="size-8" />}
                  title="Edit lesson"
                  description="Change the title, the module it sits in, or what students read with it."
                  action={updateLesson}
                  submitLabel="Save"
                  successMessage="Lesson saved."
                >
                  {ids}
                  <div className="grid gap-5 sm:grid-cols-[1fr_16rem]">
                    <Field name="title" label="Title">
                      <Input name="title" defaultValue={lesson.title} maxLength={160} required />
                    </Field>
                    <Field name="moduleId" label="Module">
                      <NativeSelect name="moduleId" defaultValue={lesson.moduleId} required>
                        {content.modules.map((m, i) => (
                          <NativeSelectOption key={m.id} value={m.id}>
                            {i + 1}. {m.title}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                  </div>
                  {lesson.kind === 'link' && (
                    <Field name="url" label="Link" hint="The full address, starting with https://">
                      <Input name="url" inputMode="url" defaultValue={lesson.url ?? ''} required />
                    </Field>
                  )}
                  <div className="grid gap-2">
                    <span className="text-sm font-medium">
                      Description <span className="text-muted-foreground font-normal">(optional)</span>
                    </span>
                    <RichTextEditor name="description" initial={lesson.description} />
                    <FieldErrors name="description" />
                  </div>
                </FormDialog>
              )
            }
          >
            <dl className="grid gap-2 text-sm">
              <Row label="Title">{lesson.title}</Row>
              <Row label="Module">{unit?.title ?? '—'}</Row>
              <Row label="Type">{KIND[lesson.kind].label}</Row>
              {lesson.url && (
                <Row label="Link">
                  <a
                    href={lesson.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary break-all hover:underline"
                  >
                    {lesson.url}
                  </a>
                </Row>
              )}
            </dl>
          </Card>

          {lesson.kind !== 'link' && (
            <Card
              title={lesson.kind === 'video' ? 'Video' : 'PDF'}
              aside={
                canTeach &&
                !watched && (
                  <FormDialog
                    openParam="file"
                    trigger={
                      <Button variant="outline" size="sm">
                        <UploadSimpleIcon /> Replace
                      </Button>
                    }
                    icon={<PageIcon name={lesson.kind === 'video' ? 'video' : 'books'} className="size-8" />}
                    title={lesson.kind === 'video' ? 'Replace the video' : 'Replace the PDF'}
                    description={
                      lesson.kind === 'video'
                        ? 'The new video gets its own thumbnail and phone copy. The old file is removed.'
                        : 'Students get the new PDF from now on. The old file is removed.'
                    }
                    action={replaceLessonFile}
                    submitLabel="Replace"
                    successMessage="File replaced."
                  >
                    {ids}
                    {lesson.kind === 'video' ? (
                      <FileUpload name="video" purpose="lesson-video" contextId={offeringId} required />
                    ) : (
                      <FileUpload name="document" purpose="lesson-doc" contextId={offeringId} required />
                    )}
                    <FieldErrors name={lesson.kind === 'video' ? 'video[]' : 'document[]'} />
                  </FormDialog>
                )
              }
            >
              <div className="bg-muted/60 flex items-center gap-3 rounded-md px-3 py-2.5">
                <PageIcon name={KIND[lesson.kind].icon} className="size-8" />
                <div className="grid min-w-0 flex-1 text-sm">
                  <span className="truncate font-medium">{lesson.fileName ?? 'File'}</span>
                  <span className="text-muted-foreground text-xs">
                    {[
                      lesson.durationSec ? formatDuration(lesson.durationSec) : null,
                      lesson.size ? formatBytes(lesson.size) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              </div>
              {lesson.kind === 'video' && (
                <p className="text-muted-foreground flex items-start gap-2 text-xs">
                  <DeviceMobileIcon className="mt-px size-4 shrink-0" />
                  {lesson.transcode === 'ready'
                    ? 'A lighter copy for phones is ready.'
                    : lesson.transcode === 'failed'
                      ? 'A lighter copy for phones could not be made. Students still get the original.'
                      : 'The thumbnail and a lighter copy for phones are being made. This takes a few minutes.'}
                </p>
              )}
              {watched && (
                <p className="text-muted-foreground text-xs">
                  Students have started watching, so the video cannot be replaced. Add a new lesson instead.
                </p>
              )}
            </Card>
          )}

          <Card
            title="Thumbnail"
            aside={
              canTeach && (
                <FormDialog
                  openParam="thumb"
                  trigger={
                    <Button variant="outline" size="sm">
                      <ImageIcon /> Upload picture
                    </Button>
                  }
                  icon={<PageIcon name="cover" className="size-8" />}
                  title="Upload a thumbnail"
                  description="A JPEG, PNG or WebP picture. It is cropped to 16 by 9 before it uploads."
                  action={setLessonThumb}
                  submitLabel="Use this picture"
                  successMessage="Thumbnail saved."
                >
                  {ids}
                  <FileUpload name="thumb" purpose="lesson-thumb" contextId={offeringId} required />
                  <FieldErrors name="thumb[]" />
                </FormDialog>
              )
            }
          >
            <div className="flex items-center gap-4">
              <LessonThumb
                kind={lesson.kind}
                thumb={thumb}
                processing={lesson.kind === 'video' && lesson.transcode === 'pending'}
                className="w-36"
              />
              <div className="grid gap-2 text-sm">
                <span className="text-muted-foreground">
                  {lesson.thumbKey
                    ? 'Your picture.'
                    : lesson.frameKey
                      ? 'A frame from the video.'
                      : lesson.kind === 'video' && lesson.transcode === 'pending'
                        ? 'A frame from the video appears once it is processed.'
                        : lesson.kind === 'video'
                          ? 'This video has no frame yet. Upload a picture instead.'
                          : 'The lesson type’s mark. Upload a picture to change it.'}
                </span>
                {canTeach && lesson.thumbKey && (
                  <ActionForm
                    action={clearLessonThumb}
                    submitLabel={lesson.kind === 'video' ? 'Use the video frame' : 'Remove picture'}
                    submitVariant="outline"
                    submitSize="sm"
                  >
                    {ids}
                  </ActionForm>
                )}
              </div>
            </div>
          </Card>

          <Card
            title="Notes"
            aside={
              canTeach &&
              lesson.notes.length < MAX_NOTES && (
                <FormDialog
                  openParam="notes"
                  trigger={
                    <Button variant="outline" size="sm">
                      <PlusIcon /> Add PDF
                    </Button>
                  }
                  icon={<PageIcon name="fileq" className="size-8" />}
                  title="Add notes"
                  description={`PDFs students open beside the lesson. A lesson holds up to ${MAX_NOTES}.`}
                  action={addLessonNotes}
                  submitLabel="Add notes"
                  successMessage="Notes added."
                >
                  {ids}
                  <FileUpload
                    name="notes"
                    purpose="lesson-doc"
                    contextId={offeringId}
                    multiple
                    max={MAX_NOTES - lesson.notes.length}
                    required
                  />
                  <FieldErrors name="notes[]" />
                </FormDialog>
              )
            }
          >
            {lesson.notes.length === 0 ? (
              <p className="text-muted-foreground text-sm">No notes yet. Up to {MAX_NOTES} PDFs.</p>
            ) : (
              <ul className="grid gap-2">
                {lesson.notes.map((note) => (
                  <li key={note.id} className="ring-border/80 flex items-center gap-3 rounded-md px-3 py-2 ring-1">
                    <FilePdfIcon weight="duotone" className="text-destructive size-6 shrink-0" />
                    <a
                      href={fileSrc(note.key)}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-primary grid min-w-0 flex-1 text-sm"
                    >
                      <span className="truncate font-medium">{note.fileName}</span>
                      <span className="text-muted-foreground text-xs">{formatBytes(note.size)}</span>
                    </a>
                    {canTeach && (
                      <RowMenu
                        label={note.fileName}
                        items={[
                          { kind: 'link', label: 'Open', href: fileSrc(note.key), icon: <ArrowSquareOutIcon /> },
                          {
                            kind: 'action',
                            label: 'Remove',
                            icon: <TrashIcon />,
                            destructive: true,
                            action: removeLessonNote,
                            fields: { offeringId, lessonId: lesson.id, noteId: note.id },
                            confirm: {
                              title: `Remove “${note.fileName}”?`,
                              message: 'Students no longer find it under the lesson. The file is deleted.',
                              confirmLabel: 'Remove',
                              destructive: true,
                            },
                          },
                        ]}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {canTeach && (
            <Card title="Delete lesson" danger>
              {lesson.published ? (
                <p className="text-muted-foreground text-sm">Unpublish it first. Students can see it now.</p>
              ) : activity.opened > 0 ? (
                <p className="text-muted-foreground text-sm">
                  Not possible: students have opened it. Keep it unpublished to hide it.
                </p>
              ) : (
                <ActionForm
                  action={deleteLesson}
                  submitLabel="Delete lesson"
                  submitVariant="destructive"
                  submitIcon={<TrashIcon />}
                  confirm={{
                    title: 'Delete this lesson?',
                    message: 'The lesson, its file, thumbnail and notes are removed for good.',
                  }}
                >
                  {ids}
                </ActionForm>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  aside,
  danger = false,
  children,
}: {
  title: string;
  aside?: ReactNode;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cn('surface grid gap-3 p-4', danger && 'ring-destructive/25')}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={cn('text-sm font-semibold', danger && 'text-destructive')}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Preview({ lesson }: { lesson: LessonDetail }) {
  const poster = lesson.thumbKey ?? lesson.frameKey;
  if (lesson.kind === 'video' && lesson.fileKey) {
    return (
      <section className="surface overflow-hidden p-2">
        <video
          controls
          playsInline
          preload="metadata"
          src={fileSrc(lesson.fileKey)}
          poster={poster ? fileSrc(poster) : undefined}
          className="aspect-video w-full rounded-md bg-black"
        />
      </section>
    );
  }
  const href = lesson.kind === 'document' && lesson.fileKey ? fileSrc(lesson.fileKey) : lesson.url;
  return (
    <section className="surface flex flex-wrap items-center gap-4 p-5 sm:p-6">
      <PageIcon name={KIND[lesson.kind].icon} className="size-14" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="truncate font-medium">{lesson.kind === 'document' ? (lesson.fileName ?? 'Lesson PDF') : href}</p>
        <p className="text-muted-foreground text-sm">Students open it in a new tab and mark it done.</p>
      </div>
      {href && (
        <Button asChild variant="outline">
          <a href={href} target="_blank" rel="noreferrer">
            <ArrowSquareOutIcon /> {lesson.kind === 'document' ? 'Open PDF' : 'Open link'}
          </a>
        </Button>
      )}
    </section>
  );
}

// --- Student (design "Player A", 17 Oct 2026) ---

function Player({
  lesson,
  content,
  completePct,
  pct,
}: {
  lesson: LessonDetail;
  content: Content;
  completePct: number;
  pct: number;
}) {
  const { offeringId } = content;
  const base = `/courses/${offeringId}/content`;
  const { previous, next, unit, moduleIndex, inModule } = position(content, lesson.id);
  const poster = lesson.thumbKey ?? lesson.frameKey;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="surface grid gap-2 p-3 max-xl:order-last xl:sticky xl:top-20">
        <div className="flex items-center justify-between gap-3 border-b px-1.5 pb-3">
          <div className="grid leading-tight">
            <span className="text-sm font-semibold">Course content</span>
            <span className="text-muted-foreground text-xs">
              {content.modules.flatMap((m) => m.lessons).filter((l) => l.completed).length} of{' '}
              {content.modules.flatMap((m) => m.lessons).length} done
            </span>
          </div>
          <ProgressRing value={pct} label={`${Math.round(pct)}% of the lessons done`} size={46} />
        </div>
        {content.modules.map((m, i) => (
          <details key={m.id} open={m.id === unit?.id} className="group open:bg-muted/60 rounded-md">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1 truncate">
                {i + 1}. {m.title}
              </span>
              <span className="text-muted-foreground text-xs font-medium">
                {m.lessons.filter((l) => l.completed).length}/{m.lessons.length}
              </span>
            </summary>
            <ol className="grid gap-0.5 px-1 pb-1.5">
              {m.lessons.map((l, j) => (
                <li key={l.id}>
                  <Link
                    href={`${base}/${l.id}`}
                    aria-current={l.id === lesson.id ? 'page' : undefined}
                    className={cn(
                      'flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
                      l.id === lesson.id ? 'bg-card ring-primary/35 text-primary font-medium ring-1' : 'hover:bg-card',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full',
                        l.completed ? 'bg-success text-white' : 'ring-border bg-card ring-1',
                      )}
                    >
                      {l.completed && <CheckIcon weight="bold" className="size-2.5" />}
                    </span>
                    <span className="grid min-w-0 flex-1 leading-tight">
                      <span className="truncate">
                        {i + 1}.{j + 1} {l.title}
                      </span>
                      <span className="text-muted-foreground text-xs font-normal">
                        {KIND[l.kind].label}
                        {l.durationSec ? ` · ${formatDuration(l.durationSec)}` : ''}
                      </span>
                    </span>
                    <LinkSpinner />
                  </Link>
                </li>
              ))}
            </ol>
          </details>
        ))}
      </aside>

      <div className="grid min-w-0 gap-4">
        {lesson.kind === 'video' && lesson.fileKey ? (
          <section className="surface grid gap-3 overflow-hidden p-2">
            <VideoPlayer
              lessonId={lesson.id}
              src={fileSrc(lesson.fileKey)}
              lowSrc={lesson.transcode === 'ready' && lesson.lowKey ? fileSrc(lesson.lowKey) : null}
              poster={poster ? fileSrc(poster) : undefined}
            />
            <div className="grid gap-1.5 px-2 pb-1.5">
              <Progress value={lesson.progressPct} className="bg-muted h-1.5" aria-label="Watched" />
              <p className="text-muted-foreground text-xs">
                {lesson.completedAt ? (
                  <span className="text-success inline-flex items-center gap-1.5 font-medium">
                    <CheckCircleIcon weight="fill" /> Done
                  </span>
                ) : (
                  `${formatPct(Math.floor(lesson.progressPct))} watched. It counts as done at ${formatPct(completePct)}; skipped parts do not count.`
                )}
              </p>
            </div>
          </section>
        ) : (
          <section className="surface flex flex-wrap items-center gap-4 p-5 sm:p-6">
            <PageIcon name={KIND[lesson.kind].icon} className="size-14" />
            <div className="grid min-w-0 flex-1 gap-0.5">
              <p className="truncate font-medium">
                {lesson.kind === 'document' ? (lesson.fileName ?? 'Lesson PDF') : lesson.url}
              </p>
              <p className="text-muted-foreground text-sm">
                {lesson.completedAt
                  ? `You finished this on ${formatDateTime(lesson.completedAt)}.`
                  : 'Open it, and mark it done when you have finished.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant={lesson.completedAt ? 'default' : 'outline'}>
                <a
                  href={lesson.kind === 'document' && lesson.fileKey ? fileSrc(lesson.fileKey) : (lesson.url ?? '#')}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ArrowSquareOutIcon /> {lesson.kind === 'document' ? 'Open PDF' : 'Open link'}
                </a>
              </Button>
              {lesson.completedAt ? (
                <Badge variant="success">Done</Badge>
              ) : (
                <ActionForm action={completeLesson} submitLabel="Mark as done" submitIcon={<CheckIcon />}>
                  <input type="hidden" name="offeringId" value={offeringId} />
                  <input type="hidden" name="lessonId" value={lesson.id} />
                </ActionForm>
              )}
            </div>
          </section>
        )}

        <section className="surface grid gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid min-w-0 gap-0.5">
              {unit && (
                <p className="text-primary text-xs font-semibold">
                  Module {moduleIndex + 1} · {unit.title} · Lesson {inModule + 1} of {unit.lessons.length}
                </p>
              )}
              <h1 className="text-xl font-semibold tracking-tight text-balance">{lesson.title}</h1>
            </div>
            <div className="flex gap-2">
              {previous && (
                <Button asChild variant="outline">
                  <Link href={`${base}/${previous.id}`} aria-label={`Previous: ${previous.title}`}>
                    <ArrowLeftIcon /> Previous
                    <LinkSpinner />
                  </Link>
                </Button>
              )}
              {next && (
                <Button asChild>
                  <Link href={`${base}/${next.id}`} aria-label={`Next: ${next.title}`}>
                    Next <ArrowRightIcon />
                    <LinkSpinner />
                  </Link>
                </Button>
              )}
            </div>
          </div>
          <Tabs defaultValue="about">
            <TabsList variant="line" className="w-full justify-start border-b">
              <TabsTrigger value="about" className="flex-none px-3">
                About
              </TabsTrigger>
              <TabsTrigger value="notes" className="flex-none px-3">
                Notes
                <span className="bg-muted text-muted-foreground rounded-sm px-1.5 text-xs">{lesson.notes.length}</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="about" className="pt-3">
              {lesson.description ? (
                <RichTextView doc={lesson.description} />
              ) : (
                <p className="text-muted-foreground text-sm">Nothing more to read for this lesson.</p>
              )}
            </TabsContent>
            <TabsContent value="notes" className="grid gap-2 pt-3">
              {lesson.notes.length === 0 ? (
                <p className="text-muted-foreground text-sm">No notes for this lesson.</p>
              ) : (
                lesson.notes.map((note) => (
                  <a
                    key={note.id}
                    href={fileSrc(note.key)}
                    target="_blank"
                    rel="noreferrer"
                    className="ring-border/80 hover:ring-primary/35 flex items-center gap-3 rounded-md px-3 py-2.5 ring-1 transition-colors"
                  >
                    <FilePdfIcon weight="duotone" className="text-destructive size-6 shrink-0" />
                    <span className="grid min-w-0 flex-1 text-sm">
                      <span className="truncate font-medium">{note.fileName}</span>
                      <span className="text-muted-foreground text-xs">PDF · {formatBytes(note.size)}</span>
                    </span>
                    <span className="text-primary text-sm font-medium">Open</span>
                  </a>
                ))
              )}
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  );
}
