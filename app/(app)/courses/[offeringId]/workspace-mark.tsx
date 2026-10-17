'use client';

import { usePathname } from 'next/navigation';
import { PageIcon, type PageIconName } from '@/components/page-icon';

// The offering header stays put across the workspace; the mark follows the page you are on.
export function WorkspaceMark({ base }: { base: string }) {
  const pathname = usePathname();
  let name: PageIconName = 'overview';
  if (pathname.startsWith(`${base}/plan`)) name = 'plan';
  else if (pathname.includes('/content/')) name = 'lesson';
  else if (pathname.startsWith(`${base}/content`)) name = 'lessons';
  else if (pathname.includes('/live/')) name = 'session';
  else if (pathname.startsWith(`${base}/live`)) name = 'live';
  else if (pathname.startsWith(`${base}/people`)) name = 'people';
  return <PageIcon name={name} />;
}
