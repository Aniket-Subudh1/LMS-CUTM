'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import {
  BookOpenTextIcon,
  BooksIcon,
  CaretRightIcon,
  ChalkboardTeacherIcon,
  CircleNotchIcon,
  ClockCounterClockwiseIcon,
  SignOutIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
  TreeStructureIcon,
  UserCircleIcon,
  UsersThreeIcon,
  type Icon,
} from '@phosphor-icons/react';
import { logout } from '@/app/(auth)/actions';
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
// The `foot` group sits at the bottom of the sidebar, unlabelled, above Sign out.
const NAV: { label: string; foot?: true; items: Item[] }[] = [
  {
    label: 'Menu',
    items: [
      { href: '/home', label: 'Dashboard', icon: SquaresFourIcon },
      { href: '/courses', label: 'My courses', icon: BooksIcon, roles: ['student', 'faculty', 'hod', 'admin'] },
    ],
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
  { label: 'Account', foot: true, items: [{ href: '/profile', label: 'Profile', icon: UserCircleIcon }] },
];

const PILL =
  'bg-sidebar-accent hover:bg-sidebar-border data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:hover:bg-primary/90 data-[active=true]:hover:text-primary-foreground';
const PLAIN = 'data-[active=true]:bg-primary/10 data-[active=true]:text-primary';
// Collapsed, each item is the primitive's 32 px square, centred in the 48 px rail by the group's 8 px padding.
const BUTTON = 'h-10 gap-3 rounded-lg px-3 [&>svg]:size-5 group-data-[collapsible=icon]:p-1.5!';

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
      {pending ? <CircleNotchIcon className="animate-spin" /> : <SignOutIcon />}
      <span>Sign out</span>
    </SidebarMenuButton>
  );
}

export function AppNav({ roles }: { roles: Role[] }) {
  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((item) => !item.roles || item.roles.some((r) => roles.includes(r))),
  })).filter((g) => g.items.length > 0);
  const current = useCurrent(groups);
  const { setOpenMobile } = useSidebar();
  return groups.map((group) => (
    <SidebarGroup
      key={group.label}
      className={cn('px-3 group-data-[collapsible=icon]:px-2', group.foot && 'mt-auto pb-4')}
    >
      {!group.foot && (
        <SidebarGroupLabel className="text-sidebar-foreground/75 mb-1 px-1 text-sm font-medium">
          {group.label}
        </SidebarGroupLabel>
      )}
      <SidebarMenu className={group.foot ? 'gap-0.5' : 'gap-2'}>
        {group.items.map((item) => {
          const active = item === current?.item;
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={active}
                tooltip={item.label}
                className={cn(BUTTON, group.foot ? PLAIN : PILL)}
              >
                <Link
                  href={item.href}
                  aria-current={active && !current?.child ? 'page' : undefined}
                  onClick={() => setOpenMobile(false)}
                >
                  <item.icon />
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
