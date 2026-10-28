'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { CaretDownIcon, CaretRightIcon, CircleNotchIcon, SignOutIcon } from '@phosphor-icons/react';
import { logout } from '@/app/(auth)/actions';
import { LinkSpinner } from '@/components/link-spinner';
import { PageIcon, type PageIconName } from '@/components/page-icon';
import { cn } from '@/lib/cn';
import { ASSIGNABLE_ROLES, type Role } from '@/lib/schemas/common';
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

type Leaf = { href: string; label: string; icon?: PageIconName };
type Item = Leaf & { icon: PageIconName; roles?: Role[]; children?: Leaf[] };

// Groups and items by role (08 §3); a user with several roles sees the union. `roles` absent means everyone.
// The `foot` group is the sidebar's fixed footer, unlabelled, with Sign out: it stays in view while the menu scrolls.
const NAV: { label: string; foot?: true; items: Item[] }[] = [
  {
    label: 'Menu',
    items: [
      { href: '/home', label: 'Dashboard', icon: 'dashboard', roles: [...ASSIGNABLE_ROLES] },
      { href: '/courses', label: 'My courses', icon: 'courses', roles: ['student', 'faculty', 'hod', 'admin'] },
      // M06 (DSH-02): internal marks across a department's courses; M09 adds attainment and M10 engagement, as tabs.
      { href: '/reports', label: 'Reports', icon: 'reports', roles: ['hod', 'admin'] },
      { href: '/catalog', label: 'Course catalogue', icon: 'catalog', roles: ['faculty', 'hod', 'admin'] },
      // M04b (TP-02): standalone tests, and those a share link let anyone into (a candidate's whole LMS).
      { href: '/tests', label: 'Tests', icon: 'evaluation' },
      { href: '/meetings', label: 'Meetings', icon: 'meetings', roles: ['student', 'faculty', 'hod', 'admin'] },
      // M08 (DSH-07): a student's published grade sheets.
      { href: '/results', label: 'Results', icon: 'results', roles: ['student'] },
      { href: '/notifications', label: 'Notifications', icon: 'notifications' },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        href: '/admin',
        label: 'Structure',
        icon: 'structure',
        roles: ['admin'],
        children: [
          { href: '/admin/departments', label: 'Departments', icon: 'departments' },
          { href: '/admin/programs', label: 'Programmes', icon: 'programmes' },
          { href: '/admin/terms', label: 'Terms', icon: 'terms' },
        ],
      },
      { href: '/admin/offerings', label: 'Offerings', icon: 'offerings', roles: ['admin'] },
      { href: '/admin/imports', label: 'Imports', icon: 'imports', roles: ['admin'] },
      // M08: locks, the exam section's file and grade sheets, a batch at a time.
      { href: '/admin/exams', label: 'Exams', icon: 'exams', roles: ['admin'] },
      { href: '/admin/settings', label: 'Settings', icon: 'settings', roles: ['admin'] },
      // M07 T9: GitHub's state and every queue's failed jobs.
      { href: '/admin/integrations', label: 'Integrations', icon: 'integrations', roles: ['admin'] },
      { href: '/admin/audit', label: 'Audit log', icon: 'audit', roles: ['admin'] },
      { href: '/admin/users', label: 'Users', icon: 'users', roles: ['admin', 'support'] },
    ],
  },
  { label: 'Account', foot: true, items: [{ href: '/profile', label: 'Profile', icon: 'profile' }] },
];

// Design "D · Icon chips" (chosen by Aniket from four mock-ups, 17 Oct 2026): rows have no fill and each icon sits
// on a 32 px chip. The current item's chip is a light primary tint (a solid chip would hide the generated mark)
// and its label is primary. On the 48 px rail the chip fills the primitive's square.
const BUTTON =
  'group/nav h-11 gap-3 rounded-lg px-1.5 data-[active=true]:bg-transparent data-[active=true]:font-semibold data-[active=true]:text-primary data-[active=true]:hover:bg-sidebar-accent group-data-[collapsible=icon]:rounded-md group-data-[collapsible=icon]:p-0!';
const CHIP = 'grid size-8 shrink-0 place-items-center rounded-md transition-colors [&>svg]:size-4.5';
const CHIP_IDLE = 'bg-sidebar-accent group-hover/nav:bg-sidebar-border';

type Match = { item: Item; child?: Leaf };

// The longest matching href wins, so /admin/programs/… is Structure › Programmes and /admin/users is Users.
function useCurrent(groups: typeof NAV): Match | undefined {
  const pathname = usePathname();
  const under = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return groups
    .flatMap((g) =>
      g.items.flatMap((item) => [
        { item, href: item.href },
        ...(item.children ?? []).map((child) => ({ item, child, href: child.href })),
      ]),
    )
    .filter((m) => under(m.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

function SignOut() {
  const { pending } = useFormStatus();
  return (
    <SidebarMenuButton type="submit" disabled={pending} tooltip="Sign out" className={BUTTON}>
      <span className={cn(CHIP, CHIP_IDLE)}>
        {pending ? <CircleNotchIcon className="animate-spin" /> : <SignOutIcon />}
      </span>
      <span>Sign out</span>
    </SidebarMenuButton>
  );
}

// `foot` renders only the footer group (Profile and Sign out); without it, the menu groups above it.
export function AppNav({ roles, foot = false }: { roles: Role[]; foot?: boolean }) {
  const groups = NAV.filter((g) => Boolean(g.foot) === foot)
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => !item.roles || item.roles.some((r) => roles.includes(r))),
    }))
    .filter((g) => g.items.length > 0);
  const current = useCurrent(groups);
  const { setOpenMobile } = useSidebar();
  return groups.map((group) => (
    <SidebarGroup
      key={group.label}
      className={cn('px-3 group-data-[collapsible=icon]:px-2', group.foot && 'pt-2 pb-4')}
    >
      {!group.foot && (
        <SidebarGroupLabel className="text-sidebar-foreground/75 mb-1 px-1 text-sm font-medium">
          {group.label}
        </SidebarGroupLabel>
      )}
      <SidebarMenu className="gap-0.5">
        {group.items.map((item) => {
          const active = item === current?.item;
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={active} tooltip={item.label} className={BUTTON}>
                <Link
                  href={item.href}
                  aria-current={active && !current?.child ? 'page' : undefined}
                  onClick={() => setOpenMobile(false)}
                >
                  <span className={cn(CHIP, active ? 'bg-primary/10 ring-primary/30 ring-1' : CHIP_IDLE)}>
                    <PageIcon name={item.icon} className="size-6" />
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  <LinkSpinner />
                  {item.children && (
                    <CaretDownIcon
                      className={cn('text-muted-foreground transition-transform', !active && '-rotate-90')}
                    />
                  )}
                </Link>
              </SidebarMenuButton>
              {item.children && active && (
                <SidebarMenuSub className="mr-0 ml-6 gap-0 border-l-0 px-0 pt-0.5 pb-1.5">
                  {item.children.map((child) => {
                    const here = child === current?.child;
                    return (
                      <SidebarMenuSubItem key={child.href}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={here}
                          className="text-muted-foreground hover:text-foreground data-[active=true]:text-primary h-8 data-[active=true]:bg-transparent data-[active=true]:font-semibold"
                        >
                          <Link
                            href={child.href}
                            aria-current={here ? 'page' : undefined}
                            onClick={() => setOpenMobile(false)}
                          >
                            {child.icon && <PageIcon name={child.icon} className="size-5" />}
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
        {group.foot && (
          <SidebarMenuItem>
            <form action={logout}>
              <SignOut />
            </form>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  ));
}

export function AppBreadcrumb() {
  const current = useCurrent(NAV);
  if (!current) return null;
  const trail: { label: string; href?: string }[] = [
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
