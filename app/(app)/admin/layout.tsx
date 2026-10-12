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

const SCHEMES = { href: '/admin/schemes', label: 'Schemes' };

const OFFERINGS = { href: '/admin/offerings', label: 'Offerings' };

const USERS = { href: '/admin/users', label: 'Users' };

async function AdminTabs() {
  const viewer = await requireViewer(['admin', 'support']);
  const tabs = viewer.roles.includes('admin') ? [STRUCTURE, COURSES, SCHEMES, OFFERINGS, USERS] : [USERS];
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
