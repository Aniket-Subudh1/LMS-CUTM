'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LinkSpinner } from '@/components/link-spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Tab = { href: string; label: string; icon?: ReactNode; prefixes?: string[] };

// Link tabs as an underlined row ("B · Crisp editorial", 17 Oct 2026): the URL is the state. A tab owns its own path, anything below it and any listed prefix;
// the longest match wins, so `/courses/x` (Overview) does not claim `/courses/x/people`.
// The trigger's own border is the underline; the primitive's `after:` bar is hidden because it hangs 5px below the row,
// which inside `overflow-x-auto` shows a vertical scrollbar.
// M06 (Aniket, 23 Oct 2026): a row wider than the screen (a teacher's course tabs at 1440 px, any row on a phone) opens
// scrolled so the current tab shows, and fades at an edge that has more tabs.
export function TabNav({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ start: false, end: false });
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
  const measure = () => {
    const row = scroller.current;
    if (row) setMore({ start: row.scrollLeft > 1, end: row.scrollLeft + row.clientWidth < row.scrollWidth - 1 });
  };
  useEffect(() => {
    const row = scroller.current;
    const tab = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (row && tab) {
      // The fade is 40 px wide, so the tab clears it.
      const left = tab.offsetLeft - 40;
      const right = tab.offsetLeft + tab.offsetWidth + 40 - row.clientWidth;
      if (left < row.scrollLeft) row.scrollLeft = Math.max(0, left);
      else if (right > row.scrollLeft) row.scrollLeft = right;
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [pathname]);
  return (
    <div className="relative mb-5 min-w-0 lg:mb-6">
      {/* The row's own width never widens the page: it scrolls (inline-size containment, M06: 11 teacher tabs). The list
          is as wide as its tabs, so its underline runs under every tab when the row scrolls. */}
      <Tabs
        ref={scroller}
        onScroll={measure}
        value={current?.href ?? ''}
        className="overflow-x-auto [contain:inline-size]"
      >
        <TabsList
          aria-label="Sections"
          variant="line"
          className="w-max min-w-full justify-start gap-6 border-b p-0 group-data-[orientation=horizontal]/tabs:h-auto"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.href}
              value={tab.href}
              asChild
              className="text-muted-foreground hover:text-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground -mb-px h-10 flex-none rounded-none border-0 border-b-2 border-transparent px-0 text-[0.8125rem] font-medium after:hidden data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none [&_svg]:size-4"
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
      {more.start && (
        <span
          aria-hidden="true"
          className="from-background pointer-events-none absolute inset-y-0 left-0 w-10 bg-linear-to-r to-transparent"
        />
      )}
      {more.end && (
        <span
          aria-hidden="true"
          className="from-background pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l to-transparent"
        />
      )}
    </div>
  );
}
