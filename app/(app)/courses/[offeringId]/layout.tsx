import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { TabNav } from '@/components/tab-nav';
import { Skeleton } from '@/components/ui/skeleton';
import { getWorkspace } from '@/lib/data/workspace';

async function WorkspaceHeader({ params }: { params: LayoutProps<'/courses/[offeringId]'>['params'] }) {
  const workspace = await getWorkspace((await params).offeringId);
  const base = `/courses/${workspace.id}`;
  const tabs = [
    { href: base, label: 'Overview' },
    ...(workspace.access === 'learn' ? [] : [{ href: `${base}/people`, label: 'People' }]),
  ];
  return (
    <>
      <PageHeader
        title={workspace.title}
        description={`${workspace.termName} · ${workspace.faculty.join(', ') || 'No faculty assigned'}`}
      />
      <TabNav tabs={tabs} />
    </>
  );
}

export default function WorkspaceLayout({ children, params }: LayoutProps<'/courses/[offeringId]'>) {
  return (
    <>
      <Suspense fallback={<Skeleton className="mb-6 h-24 w-full max-w-2xl" />}>
        <WorkspaceHeader params={params} />
      </Suspense>
      {children}
    </>
  );
}
