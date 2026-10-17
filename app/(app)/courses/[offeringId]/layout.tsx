import { Suspense } from 'react';
import { CalendarBlankIcon, ChalkboardTeacherIcon } from '@phosphor-icons/react/ssr';
import { PageIcon } from '@/components/page-icon';
import { WorkspaceMark } from './workspace-mark';
import { TabNav } from '@/components/tab-nav';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getWorkspace } from '@/lib/data/workspace';
import { statusTone } from '@/lib/format';

async function WorkspaceHeader({ params }: { params: LayoutProps<'/courses/[offeringId]'>['params'] }) {
  const workspace = await getWorkspace((await params).offeringId);
  const base = `/courses/${workspace.id}`;
  // 08 §3. Teachers get the Plan tab after Overview: write the plan first, then add lessons.
  const tabs = [
    { href: base, label: 'Overview', icon: <PageIcon name="overview" className="size-5" /> },
    ...(workspace.canTeach
      ? [{ href: `${base}/plan`, label: 'Course plan', icon: <PageIcon name="plan" className="size-5" /> }]
      : []),
    {
      href: `${base}/content`,
      label: workspace.access === 'learn' ? 'Lessons' : 'Content',
      icon: <PageIcon name="lessons" className="size-5" />,
    },
    { href: `${base}/live`, label: 'Live', icon: <PageIcon name="live" className="size-5" /> },
    ...(workspace.access === 'learn'
      ? []
      : [{ href: `${base}/people`, label: 'People', icon: <PageIcon name="people" className="size-5" /> }]),
  ];
  return (
    <>
      <header className="surface relative mb-5 overflow-hidden p-5 sm:p-6">
        <div
          aria-hidden="true"
          className="from-primary/[0.06] pointer-events-none absolute inset-0 bg-linear-to-r via-transparent to-transparent"
        />
        <div className="relative flex flex-wrap items-start gap-4">
          <span className="icon-chip size-14">
            <WorkspaceMark base={base} />
          </span>
          <div className="grid min-w-0 flex-1 gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{workspace.title}</h1>
              <Badge variant={statusTone(workspace.status)} className="capitalize">
                {workspace.status}
              </Badge>
            </div>
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <CalendarBlankIcon weight="duotone" className="size-4" />
                {workspace.termName}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ChalkboardTeacherIcon weight="duotone" className="size-4" />
                {workspace.faculty.join(', ') || 'No faculty assigned'}
              </span>
            </p>
          </div>
        </div>
      </header>
      <TabNav tabs={tabs} />
    </>
  );
}

export default function WorkspaceLayout({ children, params }: LayoutProps<'/courses/[offeringId]'>) {
  return (
    <>
      <Suspense
        fallback={
          <>
            <Skeleton className="mb-5 h-28 w-full rounded-xl" />
            <Skeleton className="mb-6 h-11 w-56 rounded-xl lg:mb-8" />
          </>
        }
      >
        <WorkspaceHeader params={params} />
      </Suspense>
      {children}
    </>
  );
}
