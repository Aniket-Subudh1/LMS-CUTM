'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpenTextIcon,
  BooksIcon,
  CaretRightIcon,
  ChalkboardTeacherIcon,
  ClockCounterClockwiseIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
  TreeStructureIcon,
  UserCircleIcon,
  UsersThreeIcon,
  type Icon,
} from '@phosphor-icons/react';
import { LinkSpinner } from '@/components/link-spinner';
import { cn } from '@/lib/cn';
import type { Role } from '@/lib/schemas/common';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar';

type Leaf = { href: string; label: string };
type Item = Leaf & { icon: Icon; roles?: Role[]; children?: Leaf[] };

// Groups and items by role (08 §3); a user with several roles sees the union. `roles` absent means everyone.
const NAV: { label: string; items: Item[] }[] = [
  { label: 'Overview', items: [{ href: '/home', label: 'Home', icon: SquaresFourIcon }] },
  {
    label: 'Learning',
    items: [{ href: '/courses', label: 'My courses', icon: BooksIcon, roles: ['student', 'faculty', 'hod', 'admin'] }],
  },
  {
    label: 'Administration',
    items: [
      {
        href: '/admin',
        label: 'Structure',
        icon: TreeStructureIcon,
        roles: ['admin'],
        children: [
          { href: '/admin/departments', label: 'Departments' },
          { href: '/admin/programs', label: 'Programmes' },
          { href: '/admin/terms', label: 'Terms' },
        ],
      },
      { href: '/admin/courses', label: 'Courses', icon: BookOpenTextIcon, roles: ['admin'] },
      { href: '/admin/schemes', label: 'Schemes', icon: SlidersHorizontalIcon, roles: ['admin'] },
      { href: '/admin/offerings', label: 'Offerings', icon: ChalkboardTeacherIcon, roles: ['admin'] },
      { href: '/admin/audit', label: 'Audit log', icon: ClockCounterClockwiseIcon, roles: ['admin'] },
      { href: '/admin/users', label: 'Users', icon: UsersThreeIcon, roles: ['admin', 'support'] },
    ],
  },
  { label: 'Account', items: [{ href: '/profile', label: 'Profile', icon: UserCircleIcon }] },
];

type Match = { group: string; item: Item; child?: Leaf };

// The longest matching href wins, so /admin/programs/… is Structure › Programmes and /admin/users is Users.
function useCurrent(groups: typeof NAV): Match | undefined {
  const pathname = usePathname();
  const under = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return groups
    .flatMap((g) =>
      g.items.flatMap((item) => [
        { group: g.label, item, href: item.href },
        ...(item.children ?? []).map((child) => ({ group: g.label, item, child, href: child.href })),
      ]),
    )
    .filter((m) => under(m.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function AppNav({ roles }: { roles: Role[] }) {
  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((item) => !item.roles || item.roles.some((r) => roles.includes(r))),
  })).filter((g) => g.items.length > 0);
  const current = useCurrent(groups);
  const { setOpenMobile } = useSidebar();
  return groups.map((group) => (
    <SidebarGroup key={group.label} className="py-1">
      <SidebarGroupLabel className="text-muted-foreground/80 text-[0.6875rem] font-semibold tracking-wider uppercase">
        {group.label}
      </SidebarGroupLabel>
      <SidebarMenu className="gap-0.5">
        {group.items.map((item) => {
          const active = item === current?.item;
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={active}
                tooltip={item.label}
                className="data-[active=true]:bg-primary/10 data-[active=true]:text-primary h-10 gap-3 rounded-lg px-1.5 font-medium group-data-[collapsible=icon]:p-0.5!"
              >
                <Link
                  href={item.href}
                  aria-current={active && !current?.child ? 'page' : undefined}
                  onClick={() => setOpenMobile(false)}
                >
                  <span
                    className={cn(
                      'grid size-7 shrink-0 place-items-center rounded-md transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-sidebar-accent text-muted-foreground',
                    )}
                  >
                    <item.icon weight={active ? 'fill' : 'duotone'} className="size-[1.125rem]" />
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  <LinkSpinner />
                </Link>
              </SidebarMenuButton>
              {item.children && active && (
                <SidebarMenuSub className="border-primary/15 mr-0 ml-5 py-1">
                  {item.children.map((child) => {
                    const here = child === current?.child;
                    return (
                      <SidebarMenuSubItem key={child.href}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={here}
                          className="data-[active=true]:text-primary data-[active=true]:bg-primary/10 rounded-md data-[active=true]:font-medium"
                        >
                          <Link
                            href={child.href}
                            aria-current={here ? 'page' : undefined}
                            onClick={() => setOpenMobile(false)}
                          >
                            <span className="flex-1 truncate">{child.label}</span>
                            <LinkSpinner className="size-3.5" />
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    );
                  })}
                </SidebarMenuSub>
              )}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  ));
}

export function AppBreadcrumb() {
  const current = useCurrent(NAV);
  if (!current) return null;
  const trail: { label: string; href?: string }[] = [
    { label: current.group },
    { label: current.item.label, href: current.child ? current.item.href : undefined },
    ...(current.child ? [{ label: current.child.label }] : []),
  ];
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {trail.map((crumb, i) => (
          <li
            key={crumb.label}
            className={cn(
              'flex min-w-0 items-center gap-1.5',
              i === trail.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground max-sm:hidden',
            )}
          >
            {i > 0 && (
              <CaretRightIcon aria-hidden="true" className="text-muted-foreground/60 size-3 shrink-0 max-sm:hidden" />
            )}
            {crumb.href ? (
              <Link href={crumb.href} className="hover:text-foreground truncate transition-colors">
                {crumb.label}
              </Link>
            ) : (
              <span className="truncate">{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
