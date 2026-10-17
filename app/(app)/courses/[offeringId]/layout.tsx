import { Suspense } from 'react';
import {
  ClockIcon,
  EyeIcon,
  GraduationCapIcon,
  ImageIcon,
  PlayCircleIcon,
  StackIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react/ssr';
import { clearOfferingCover, setOfferingCover } from '../actions';
import { ActionForm, FieldErrors } from '@/components/action-form';
import { CourseCover } from '@/components/course-cover';
import { FileUpload } from '@/components/file-upload';
import { FormDialog } from '@/components/form-dialog';
import { TabNav } from '@/components/tab-nav';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getWorkspace, type Workspace } from '@/lib/data/workspace';
import { creditTotal, formatCredits } from '@/lib/domain/catalog';
import { formatDuration, initials, statusTone } from '@/lib/format';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Design "Frame A" (chosen by Aniket from three mock-ups, 17 Oct 2026): a cover strip with the course's title,
// teachers and stat chips, the same on every tab, then the tabs (08 §3).
async function WorkspaceHeader({ params }: { params: LayoutProps<'/courses/[offeringId]'>['params'] }) {
  const workspace = await getWorkspace((await params).offeringId);
  const base = `/courses/${workspace.id}`;
  const learn = workspace.access === 'learn';
  const tabs = [
    { href: base, label: 'Overview' },
    {
      href: `${base}/content`,
      label: learn ? 'Lessons' : 'Content',
    },
    { href: `${base}/plan`, label: 'Course plan' },
    { href: `${base}/live`, label: 'Live' },
    { href: `${base}/syllabus`, label: 'Syllabus' },
    // A non-credit course has no outcomes (01 §6).
    ...(workspace.category === 'ugc' ? [{ href: `${base}/outcomes`, label: 'Outcomes' }] : []),
    { href: `${base}/assessments`, label: 'Assessments' },
    // REC-01, REC-02: learning records for theory, lab records for practice.
    ...(workspace.category === 'ugc' && (workspace.credits.theory > 0 || workspace.credits.practice > 0)
      ? [{ href: `${base}/records`, label: 'Records' }]
      : []),
    ...(learn ? [] : [{ href: `${base}/people`, label: 'People' }]),
  ];
  return (
    <>
      <header className="mb-5 flex flex-col gap-4 sm:flex-row">
        <CourseCover
          code={workspace.code}
          coverKey={workspace.coverKey}
          className="h-24 shrink-0 rounded-sm px-3 py-2.5 sm:h-[5.5rem] sm:w-40"
        >
          <span className="relative text-sm font-semibold tracking-tight">{workspace.code}</span>
        </CourseCover>
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid min-w-0 gap-1.5">
              <p className="text-muted-foreground text-xs">
                {[workspace.code, workspace.termName, workspace.section && `Section ${workspace.section}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <h1 className="text-xl leading-tight font-semibold tracking-tight text-balance sm:text-[1.375rem]">
                {workspace.courseTitle}
              </h1>
              <div className="text-muted-foreground flex flex-wrap items-center gap-2.5 text-[0.8125rem]">
                {workspace.faculty.length > 0 ? (
                  workspace.faculty.map(({ id, name }) => (
                    <span key={id} className="inline-flex items-center gap-1.5">
                      <Avatar className="size-5">
                        <AvatarFallback className="bg-primary/10 text-primary text-[0.5625rem] font-semibold">
                          {initials(name)}
                        </AvatarFallback>
                      </Avatar>
                      {name}
                    </span>
                  ))
                ) : (
                  <span>No faculty assigned</span>
                )}
                <Badge variant={statusTone(workspace.status)} className="capitalize">
                  {workspace.status}
                </Badge>
              </div>
            </div>
            {workspace.canTeach && <CoverDialog workspace={workspace} />}
          </div>
          <Chips workspace={workspace} />
        </div>
      </header>
      {workspace.access === 'oversee' && !workspace.canTeach && (
        <p className="text-muted-foreground mb-4 flex items-center gap-2 text-[0.8125rem]">
          <EyeIcon className="size-4 shrink-0" />
          You are viewing as head of department. The course’s teachers make the changes.
        </p>
      )}
      <TabNav tabs={tabs} />
    </>
  );
}

function Chips({ workspace }: { workspace: Workspace }) {
  const { stats } = workspace;
  const credits = creditTotal(workspace.credits);
  const chips = [
    { icon: <StackIcon />, text: plural(stats.modules, 'module') },
    { icon: <PlayCircleIcon />, text: plural(stats.lessons, 'lesson') },
    ...(stats.videoSec > 0 ? [{ icon: <ClockIcon />, text: `${formatDuration(stats.videoSec)} of video` }] : []),
    ...(workspace.access === 'learn' ? [] : [{ icon: <UsersThreeIcon />, text: plural(stats.students, 'student') }]),
    {
      icon: <GraduationCapIcon />,
      text: credits > 0 ? `${plural(credits, 'credit')} · ${formatCredits(workspace.credits)}` : 'Non-credit',
    },
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {chips.map((chip) => (
        <li key={chip.text} className="text-muted-foreground inline-flex items-center gap-1.5 text-xs [&_svg]:size-3.5">
          {chip.icon}
          {chip.text}
        </li>
      ))}
    </ul>
  );
}

function CoverDialog({ workspace }: { workspace: Workspace }) {
  return (
    <FormDialog
      openParam="cover"
      trigger={
        <Button variant="outline" size="sm">
          <ImageIcon /> {workspace.coverKey ? 'Change cover' : 'Add a cover'}
        </Button>
      }
      icon={<ImageIcon weight="duotone" />}
      title="Course cover"
      description="Shown on this class’s course card and at the top of every tab. It is cropped to a wide strip before it uploads."
      action={setOfferingCover}
      submitLabel="Use this picture"
      successMessage="Cover saved."
      preface={
        workspace.coverKey && (
          <ActionForm
            action={clearOfferingCover}
            submitLabel="Remove the picture"
            submitVariant="outline"
            submitSize="sm"
          >
            <input type="hidden" name="offeringId" value={workspace.id} />
          </ActionForm>
        )
      }
    >
      <input type="hidden" name="offeringId" value={workspace.id} />
      <FileUpload name="cover" purpose="offering-cover" contextId={workspace.id} required />
      <FieldErrors name="cover[]" />
    </FormDialog>
  );
}

export default function WorkspaceLayout({ children, params }: LayoutProps<'/courses/[offeringId]'>) {
  return (
    <>
      <Suspense
        fallback={
          <>
            <Skeleton className="mb-4 h-36 w-full rounded-lg" />
            <Skeleton className="mb-6 h-12 w-96 max-w-full rounded-md lg:mb-8" />
          </>
        }
      >
        <WorkspaceHeader params={params} />
      </Suspense>
      {children}
    </>
  );
}
