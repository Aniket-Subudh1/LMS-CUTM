import { Suspense } from 'react';
import { TabNav } from '@/components/tab-nav';
import { Skeleton } from '@/components/ui/skeleton';
import { requireViewer } from '@/lib/auth/session';

const STRUCTURE = {
  href: '/admin',
  label: 'Structure',
  prefixes: ['/admin/departments', '/admin/programs', '/admin/terms'],
};

const COURSES = { href: '/admin/courses', label: 'Courses' };

async function AdminTabs() {
  const viewer = await requireViewer(['admin', 'support']);
  const tabs = viewer.roles.includes('admin') ? [STRUCTURE, COURSES] : [];
  return <TabNav tabs={tabs} />;
}

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <>
      <Suspense fallback={<Skeleton className="mb-6 h-9 w-full max-w-md" />}>
        <AdminTabs />
      </Suspense>
      {children}
    </>
  );
}
