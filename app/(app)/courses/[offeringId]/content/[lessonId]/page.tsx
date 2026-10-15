import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  CheckIcon,
  DeviceMobileIcon,
  FilePdfIcon,
  LinkSimpleIcon,
  PencilSimpleIcon,
  PlayCircleIcon,
  TrashIcon,
} from '@phosphor-icons/react/ssr';
import Loading from '../../../../loading';
import { completeLesson, deleteLesson, setLessonPublished, updateLesson } from '../actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { FormDialog } from '@/components/form-dialog';
import { LinkSpinner } from '@/components/link-spinner';
import { RichTextEditor } from '@/components/rich-text-editor';
import { RichTextView } from '@/components/rich-text-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { VideoPlayer } from '@/components/video-player';
import { getContent, getLesson, type Content, type LessonDetail } from '@/lib/data/content';
import { getSettings } from '@/lib/data/settings';
import { cn } from '@/lib/cn';
import { formatBytes, formatDateTime, formatDuration, formatPct } from '@/lib/format';
import type { LessonKind } from '@/lib/schemas/content';

export const metadata: Metadata = { title: 'Lesson' };

const KIND: Record<LessonKind, { label: string; icon: typeof PlayCircleIcon }> = {
  video: { label: 'Video', icon: PlayCircleIcon },
  document: { label: 'PDF', icon: FilePdfIcon },
  link: { label: 'Link', icon: LinkSimpleIcon },
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
  const learn = content.access === 'learn';
  const order = content.modules.flatMap((m) => m.lessons);
  const at = order.findIndex((l) => l.id === lesson.id);
  const [previous, next] = [order[at - 1], order[at + 1]];
  const unit = content.modules.find((m) => m.id === lesson.moduleId);
  const base = `/courses/${offeringId}/content`;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid min-w-0 gap-1">
            <p className="text-muted-foreground text-sm">
              <Link href={base} className="hover:text-foreground">
                {learn ? 'Lessons' : 'Content'}
              </Link>
              {unit && ` / ${unit.title}`}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{lesson.title}</h1>
            <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
              {KIND[lesson.kind].label}
              {lesson.durationSec && ` · ${formatDuration(lesson.durationSec)}`}
              {lesson.size && ` · ${formatBytes(lesson.size)}`}
              {!learn && (
                <Badge variant={lesson.published ? 'success' : 'secondary'}>
                  {lesson.published ? 'Published' : 'Draft'}
                </Badge>
              )}
            </p>
          </div>
          {content.canTeach && <TeacherActions lesson={lesson} content={content} />}
        </header>

        <Resource lesson={lesson} learn={learn} completePct={completePct} offeringId={offeringId} />

        {lesson.description && (
          <section className="surface p-5 sm:p-6">
            <h2 className="mb-3 text-base font-semibold">About this lesson</h2>
            <RichTextView doc={lesson.description} />
          </section>
        )}

        <nav aria-label="Lessons" className="grid gap-3 sm:grid-cols-2">
          {previous ? (
            <Link href={`${base}/${previous.id}`} className="surface-interactive grid gap-0.5 p-4">
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <ArrowLeftIcon /> Previous
              </span>
              <span className="truncate text-sm font-medium">{previous.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`${base}/${next.id}`} className="surface-interactive grid gap-0.5 p-4 text-right">
              <span className="text-muted-foreground flex items-center justify-end gap-1.5 text-xs">
                Next <ArrowRightIcon />
              </span>
              <span className="truncate text-sm font-medium">{next.title}</span>
            </Link>
          )}
        </nav>
      </div>

      <Outline content={content} current={lesson.id} />
    </div>
  );
}

function Resource({
  lesson,
  learn,
  completePct,
  offeringId,
}: {
  lesson: LessonDetail;
  learn: boolean;
  completePct: number;
  offeringId: string;
}) {
  if (lesson.kind === 'video' && lesson.fileKey) {
    const src = `/api/files/${lesson.fileKey}`;
    const lowSrc = lesson.transcode === 'ready' && lesson.lowKey ? `/api/files/${lesson.lowKey}` : null;
    return (
      <section className="surface grid gap-4 p-3 sm:p-4">
        {learn ? (
          <VideoPlayer lessonId={lesson.id} src={src} lowSrc={lowSrc} />
        ) : (
          <video
            controls
            playsInline
            preload="metadata"
            src={src}
            className="aspect-video w-full rounded-xl bg-black"
          />
        )}
        {learn ? (
          <div className="grid gap-2 px-1 pb-1">
            <Progress value={lesson.progressPct} className="bg-muted h-2" aria-label="Watched" />
            <p className="text-muted-foreground text-sm">
              {lesson.completedAt ? (
                <span className="text-success inline-flex items-center gap-1.5 font-medium">
                  <CheckCircleIcon weight="fill" /> Complete
                </span>
              ) : (
                `${formatPct(Math.floor(lesson.progressPct))} watched. The lesson completes at ${formatPct(completePct)}; skipped parts do not count.`
              )}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground flex items-center gap-2 px-1 pb-1 text-sm">
            <DeviceMobileIcon className="size-4 shrink-0" />
            {lesson.transcode === 'ready'
              ? 'A lighter copy for phones is ready. Students on mobile data start with it.'
              : lesson.transcode === 'failed'
                ? 'A lighter copy for phones could not be made. Students still get the original video.'
                : 'A lighter copy for phones is being made. This takes a few minutes.'}
          </p>
        )}
      </section>
    );
  }

  const href = lesson.kind === 'document' && lesson.fileKey ? `/api/files/${lesson.fileKey}` : lesson.url;
  if (!href) return null;
  const Icon = KIND[lesson.kind].icon;
  return (
    <section className="surface flex flex-wrap items-center gap-4 p-5 sm:p-6">
      <span className="bg-primary/8 text-primary grid size-14 shrink-0 place-items-center rounded-2xl">
        <Icon weight="duotone" className="size-8" />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="truncate font-medium">{lesson.kind === 'document' ? (lesson.fileName ?? 'Lesson PDF') : href}</p>
        <p className="text-muted-foreground text-sm">
          {learn
            ? lesson.completedAt
              ? `You completed this on ${formatDateTime(lesson.completedAt)}.`
              : 'Open it, and mark it complete when you have finished.'
            : lesson.kind === 'document'
              ? 'Students open the PDF in a new tab.'
              : 'Students open this page in a new tab.'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant={learn && !lesson.completedAt ? 'outline' : 'default'}>
          <a href={href} target="_blank" rel="noreferrer">
            <ArrowSquareOutIcon /> {lesson.kind === 'document' ? 'Open PDF' : 'Open link'}
          </a>
        </Button>
        {learn &&
          (lesson.completedAt ? (
            <Badge variant="success">Complete</Badge>
          ) : (
            <ActionForm action={completeLesson} submitLabel="Mark as complete" submitIcon={<CheckIcon />}>
              <input type="hidden" name="offeringId" value={offeringId} />
              <input type="hidden" name="lessonId" value={lesson.id} />
            </ActionForm>
          ))}
      </div>
    </section>
  );
}

function TeacherActions({ lesson, content }: { lesson: LessonDetail; content: Content }) {
  const ids = (
    <>
      <input type="hidden" name="offeringId" value={content.offeringId} />
      <input type="hidden" name="lessonId" value={lesson.id} />
    </>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FormDialog
        trigger={
          <Button variant="outline">
            <PencilSimpleIcon /> Edit
          </Button>
        }
        size="wide"
        icon={<PencilSimpleIcon weight="duotone" />}
        title="Edit lesson"
        description="Change the title, the description or the module it sits in. To replace the file, add a new lesson and delete this one."
        action={updateLesson}
        submitLabel="Save"
        successMessage="Lesson saved."
      >
        {ids}
        <Field name="moduleId" label="Module">
          <NativeSelect name="moduleId" defaultValue={lesson.moduleId} required>
            {content.modules.map((m, i) => (
              <NativeSelectOption key={m.id} value={m.id}>
                {i + 1}. {m.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field name="title" label="Title">
          <Input name="title" defaultValue={lesson.title} maxLength={160} required />
        </Field>
        <div className="grid gap-2">
          <span className="text-sm font-medium">
            Description <span className="text-muted-foreground font-normal">(optional)</span>
          </span>
          <RichTextEditor name="description" initial={lesson.description} />
          <FieldErrors name="description" />
        </div>
      </FormDialog>
      {!lesson.published && !lesson.hasProgress && (
        <ActionForm
          action={deleteLesson}
          submitLabel="Delete"
          submitVariant="outline"
          submitIcon={<TrashIcon />}
          confirm={{
            title: 'Delete this lesson?',
            message: 'The lesson and its file are removed for good. This cannot be undone.',
          }}
        >
          {ids}
        </ActionForm>
      )}
      <ActionForm
        action={setLessonPublished}
        submitLabel={lesson.published ? 'Unpublish' : 'Publish'}
        submitVariant={lesson.published ? 'outline' : 'default'}
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
    </div>
  );
}

function Outline({ content, current }: { content: Content; current: string }) {
  const learn = content.access === 'learn';
  return (
    <aside className="surface grid gap-4 p-4 xl:sticky xl:top-20">
      <h2 className="px-1 text-sm font-semibold">Course content</h2>
      <ol className="grid gap-4">
        {content.modules.map((module, index) => (
          <li key={module.id} className="grid gap-1">
            <p className="text-muted-foreground px-1 text-xs font-medium">
              {index + 1}. {module.title}
            </p>
            <ol className="grid">
              {module.lessons.map((lesson) => (
                <li key={lesson.id}>
                  <Link
                    href={`/courses/${content.offeringId}/content/${lesson.id}`}
                    aria-current={lesson.id === current ? 'page' : undefined}
                    className={cn(
                      'hover:bg-muted flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
                      lesson.id === current && 'bg-primary/8 text-primary font-medium',
                    )}
                  >
                    {learn && lesson.completed ? (
                      <CheckCircleIcon weight="fill" className="text-success size-4 shrink-0" />
                    ) : (
                      <OutlineIcon kind={lesson.kind} />
                    )}
                    <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                    {!learn && !lesson.published && <span className="text-muted-foreground text-xs">Draft</span>}
                    <LinkSpinner />
                  </Link>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function OutlineIcon({ kind }: { kind: LessonKind }) {
  const Icon = KIND[kind].icon;
  return <Icon className="text-muted-foreground size-4 shrink-0" />;
}
