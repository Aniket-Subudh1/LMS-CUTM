'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, House, UserRound, type LucideIcon } from 'lucide-react';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

// Later milestones add items with a `roles` filter (08 §3).
const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/home', label: 'Home', icon: House },
  { href: '/profile', label: 'Profile', icon: UserRound },
];

function useCurrent() {
  const pathname = usePathname();
  return NAV.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}

export function AppNav() {
  const current = useCurrent();
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Menu</SidebarGroupLabel>
      <SidebarMenu>
        {NAV.map((item) => (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton asChild isActive={item === current} tooltip={item.label}>
              <Link
                href={item.href}
                aria-current={item === current ? 'page' : undefined}
                onClick={() => setOpenMobile(false)}
              >
                <item.icon />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

export function AppBreadcrumb() {
  const current = useCurrent();
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      <span className="text-muted-foreground hidden sm:inline">CUTM LMS</span>
      <ChevronRight className="text-muted-foreground hidden size-3.5 sm:inline" />
      <span className="truncate font-medium">{current?.label}</span>
    </nav>
  );
}
