'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Tab = { href: string; label: string; prefixes?: string[] };

// Link tabs: the URL is the state. A tab owns its own path, anything below it and any listed prefix;
// the longest match wins, so `/admin` (Structure) does not claim `/admin/courses`.
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
    <Tabs value={current?.href ?? ''} className="mb-6 max-w-full overflow-x-auto">
      <TabsList variant="line" aria-label="Sections">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.href} value={tab.href} asChild>
            <Link href={tab.href} aria-current={tab === current ? 'page' : undefined}>
              {tab.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
