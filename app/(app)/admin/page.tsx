import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRightIcon } from '@phosphor-icons/react/ssr';
import Loading from '../loading';
import { LinkSpinner } from '@/components/link-spinner';
import { PageHeader } from '@/components/page-header';
import { PageIcon, type PageIconName } from '@/components/page-icon';
import { getStructureCounts } from '@/lib/data/structure';

export const metadata: Metadata = { title: 'Academic structure' };

const SECTIONS = [
  {
    href: '/admin/departments',
    title: 'Departments',
    text: 'The departments that own programmes and courses.',
    icon: 'departments' satisfies PageIconName,
    count: 'departments',
  },
  {
    href: '/admin/programs',
    title: 'Programmes',
    text: 'Programmes, their batches and their PO and PSO lists.',
    icon: 'programmes' satisfies PageIconName,
    count: 'programs',
  },
  {
    href: '/admin/terms',
    title: 'Terms',
    text: 'Academic terms and which one is current.',
    icon: 'terms' satisfies PageIconName,
    count: 'terms',
  },
] as const;

export default function AdminPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Admin />
    </Suspense>
  );
}

async function Admin() {
  const counts = await getStructureCounts();
  return (
    <>
      <PageHeader
        icon={<PageIcon name="structure" />}
        title="Academic structure"
        description="Set up the academic structure that courses, offerings and marks hang from."
      />
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="surface-interactive group flex h-full flex-col gap-4 p-5">
              <span className="flex items-start justify-between gap-3">
                <span className="icon-chip size-12">
                  <PageIcon name={s.icon} />
                </span>
                <span className="text-3xl font-semibold tracking-tight tabular-nums">{counts[s.count]}</span>
              </span>
              <div className="grid gap-1">
                <h2 className="font-semibold">{s.title}</h2>
                <p className="text-muted-foreground text-sm">{s.text}</p>
              </div>
              <span className="text-primary mt-auto flex items-center gap-1.5 text-sm font-medium">
                Open {s.title.toLowerCase()}
                <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
                <LinkSpinner className="ml-auto" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
