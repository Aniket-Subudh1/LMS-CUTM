import type { Metadata } from 'next';
import { requireViewer } from '@/lib/auth/session';
import type { Role } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Home' };

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  hod: 'Head of department',
  faculty: 'Faculty',
  student: 'Student',
  support: 'Support',
};

export default async function HomePage() {
  const viewer = await requireViewer();
  return (
    <header className="page-header">
      <h1>Welcome, {viewer.name}</h1>
      <p className="text-muted">
        Signed in as {new Intl.ListFormat('en').format(viewer.roles.map((r) => ROLE_LABEL[r]))}.
      </p>
    </header>
  );
}
