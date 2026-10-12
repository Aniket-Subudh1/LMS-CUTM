'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LinkSpinner } from '@/components/link-spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Tab = { href: string; label: string; icon?: ReactNode; prefixes?: string[] };

// Link tabs: the URL is the state. A tab owns its own path, anything below it and any listed prefix;
// the longest match wins, so `/courses/x` (Overview) does not claim `/courses/x/people`.
export function TabNav({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  const matchLength = (tab: Tab) =>
    Math.max(
      0,
      ...[tab.href, ...(tab.prefixes ?? [])]
        .filter((p) => pathname === p || pathname.startsWith(`${p}/`))
        .map((p) => p.length),
    );
  const current = tabs.reduce<Tab | undefined>(
    (best, tab) => (matchLength(tab) > (best ? matchLength(best) : 0) ? tab : best),
    undefined,
  );
  return (
    <Tabs value={current?.href ?? ''} className="mb-6 max-w-full overflow-x-auto lg:mb-8">
      <TabsList aria-label="Sections" className="bg-card shadow-card ring-border h-auto gap-1 rounded-xl p-1 ring-1">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.href}
            value={tab.href}
            asChild
            className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary h-9 rounded-lg px-3.5 data-[state=active]:shadow-none [&_svg]:size-[1.125rem]"
          >
            <Link href={tab.href} aria-current={tab === current ? 'page' : undefined}>
              {tab.icon}
              {tab.label}
              <LinkSpinner className="-mr-1 size-3.5" />
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
