import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Loading from '../loading';
import { PageHeader } from '@/components/page-header';
import { requireViewer } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Administration' };

const SECTIONS = [
  { href: '/admin/departments', title: 'Departments', text: 'The departments that own programmes and courses.' },
  { href: '/admin/programs', title: 'Programmes', text: 'Programmes, their batches and their PO and PSO lists.' },
  { href: '/admin/terms', title: 'Terms', text: 'Academic terms and which one is current.' },
];

export default function AdminPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Admin />
    </Suspense>
  );
}

async function Admin() {
  await requireViewer(['admin']);
  return (
    <>
      <PageHeader
        title="Administration"
        description="Set up the academic structure that courses, offerings and marks hang from."
      />
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="bg-card hover:bg-accent focus-visible:ring-ring/50 block h-full rounded-lg border p-5 transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
            >
              <h2 className="font-semibold">{s.title}</h2>
              <p className="text-muted-foreground mt-1 text-sm">{s.text}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
