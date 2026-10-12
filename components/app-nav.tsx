'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, House, Settings, UserRound, Users, type LucideIcon } from 'lucide-react';
import type { Role } from '@/lib/schemas/common';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

// Items by role (08 §3); a user with several roles sees the union. `roles` absent means everyone.
const NAV: { href: string; label: string; icon: LucideIcon; roles?: Role[] }[] = [
  { href: '/home', label: 'Home', icon: House },
  { href: '/courses', label: 'My courses', icon: BookOpen, roles: ['student', 'faculty', 'hod', 'admin'] },
  { href: '/admin', label: 'Administration', icon: Settings, roles: ['admin'] },
  { href: '/admin/users', label: 'Users', icon: Users, roles: ['support'] },
  { href: '/profile', label: 'Profile', icon: UserRound },
];

// The most specific match wins, so /admin/users highlights Users for a support user and Administration for an admin.
function useCurrent(items: typeof NAV) {
  const pathname = usePathname();
  return items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function AppNav({ roles }: { roles: Role[] }) {
  const items = NAV.filter((item) => !item.roles || item.roles.some((r) => roles.includes(r)));
  const current = useCurrent(items);
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Menu</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={item === current}
              tooltip={item.label}
              className="data-[active=true]:shadow-[inset_2px_0_0_var(--color-sidebar-primary)]"
            >
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
  const current = useCurrent(NAV);
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      <span className="truncate font-medium">{current?.label}</span>
    </nav>
  );
}
