import { Suspense } from 'react';
import type { Metadata } from 'next';
import Loading from '../loading';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { requireViewer } from '@/lib/auth/session';
import { ROLE_LABEL } from '@/lib/format';
import { AccountActions } from './account-actions';

export const metadata: Metadata = { title: 'Profile' };

export default function ProfilePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Profile />
    </Suspense>
  );
}

async function Profile() {
  const viewer = await requireViewer();
  return (
    <>
      <PageHeader title="Profile" description="Name and email are set by the university." />
      <section className="bg-card overflow-hidden rounded-lg border">
        <div className="flex items-center gap-4 p-5 sm:p-6">
          <p
            aria-hidden="true"
            className="bg-secondary flex size-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
          >
            {initials(viewer.name)}
          </p>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{viewer.name}</h2>
            <p className="text-muted-foreground text-sm break-all">{viewer.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {viewer.roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {ROLE_LABEL[role]}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <AccountActions />
      </section>
    </>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
