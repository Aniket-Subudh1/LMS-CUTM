'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LinkSpinner } from '@/components/link-spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Tab = { href: string; label: string; icon?: ReactNode; prefixes?: string[] };

// Link tabs as an underlined row ("B · Crisp editorial", 17 Oct 2026): the URL is the state. A tab owns its own path, anything below it and any listed prefix;
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
    <Tabs value={current?.href ?? ''} className="mb-5 overflow-x-auto lg:mb-6">
      <TabsList
        aria-label="Sections"
        variant="line"
        className="w-full justify-start gap-6 border-b p-0 group-data-[orientation=horizontal]/tabs:h-auto"
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.href}
            value={tab.href}
            asChild
            className="text-muted-foreground hover:text-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground -mb-px h-10 flex-none rounded-none border-0 border-b-2 border-transparent px-0 text-[0.8125rem] font-medium data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none [&_svg]:size-4"
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
