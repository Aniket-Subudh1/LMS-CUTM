import { Suspense } from 'react';
import Link from 'next/link';
import { connection } from 'next/server';
import { BellIcon, CalendarBlankIcon, CaretDownIcon, SignOutIcon, UserCircleIcon } from '@phosphor-icons/react/ssr';
import { logout } from '@/app/(auth)/actions';
import { AppBreadcrumb, AppNav } from '@/components/app-nav';
import { UniversityLogo } from '@/components/university-logo';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { getViewer } from '@/lib/auth/session';
import { unreadCount } from '@/lib/data/notifications';
import { formatLongDate, initials, ROLE_LABEL } from '@/lib/format';
import { ROLES } from '@/lib/schemas/common';

async function UserMenu() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const unread = await unreadCount();
  const role = ROLES.find((r) => viewer.roles.includes(r));
  return (
    <>
      {/* COM-03: the unread count sits on a bell beside the user chip, inside this Suspense boundary (T6). */}
      <Link
        href="/notifications"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="ring-border hover:bg-muted focus-visible:ring-ring relative grid size-10 shrink-0 place-items-center rounded-full ring-1 transition-colors outline-none focus-visible:ring-2"
      >
        <BellIcon className="size-5" />
        {unread > 0 && (
          <span className="bg-primary text-primary-foreground ring-sidebar absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[0.6875rem] font-semibold tabular-nums ring-2">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger className="ring-border hover:bg-muted data-[state=open]:bg-muted focus-visible:ring-ring flex shrink-0 items-center gap-2.5 rounded-full p-1 ring-1 transition-colors outline-none focus-visible:ring-2 md:pr-3">
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
              {initials(viewer.name)}
            </AvatarFallback>
          </Avatar>
          <span className="sr-only grid text-left leading-tight md:not-sr-only">
            <span className="max-w-44 truncate text-sm font-semibold">{viewer.name}</span>
            <span className="text-muted-foreground max-w-44 truncate text-xs">{viewer.email}</span>
          </span>
          <CaretDownIcon className="text-muted-foreground size-4 max-md:hidden" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 rounded-xl [--radius:0.75rem]">
          <DropdownMenuLabel className="grid font-normal">
            <span className="truncate font-medium">{viewer.name}</span>
            <span className="text-muted-foreground truncate text-xs">{role && ROLE_LABEL[role]}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/profile">
              <UserCircleIcon />
              Profile
            </Link>
          </DropdownMenuItem>
          <form action={logout}>
            <DropdownMenuItem asChild variant="destructive">
              <button type="submit" className="w-full">
                <SignOutIcon />
                Sign out
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

async function Nav() {
  const viewer = await getViewer();
  return <AppNav roles={viewer?.roles ?? []} />;
}

async function Today() {
  await connection();
  return (
    <p className="text-muted-foreground ring-border flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm ring-1 max-lg:hidden">
      <CalendarBlankIcon className="size-4" />
      {formatLongDate(new Date())}
    </p>
  );
}

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <SidebarProvider className="[--sidebar-width:16rem]!">
      {/* The app shell keeps its rounder corners (12 px base) while the pages use 6 px (Aniket, 17 Oct 2026). The
          variable is set on the header and content, not on <Sidebar>, because the phone sheet drops its className. */}
      <Sidebar collapsible="icon" className="group-data-[side=left]:border-r-0">
        <SidebarHeader className="px-3 pt-5 pb-2 [--radius:0.75rem] group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3">
          <Link
            href="/home"
            className="focus-visible:ring-ring from-primary/[0.04] to-primary/[0.11] ring-primary/12 flex items-center gap-3.5 rounded-2xl bg-linear-to-br px-3.5 py-3 ring-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:bg-none group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:ring-0 focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="bg-card ring-primary/12 grid h-16 w-12 shrink-0 place-items-center rounded-xl ring-1 group-data-[collapsible=icon]:size-auto group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:ring-0">
              <UniversityLogo priority sizes="32px" className="w-8" />
            </span>
            <span className="grid min-w-0 gap-0.5 leading-tight group-data-[collapsible=icon]:sr-only">
              <span className="text-[0.9375rem] font-semibold tracking-tight">
                Centurion <span className="text-primary font-bold">LMS</span>
              </span>
              <span className="text-muted-foreground text-xs leading-snug">Learning Management System</span>
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent className="pt-4 [--radius:0.75rem]">
          <Suspense
            fallback={
              <SidebarMenu className="px-3">
                <SidebarMenuSkeleton showIcon />
                <SidebarMenuSkeleton showIcon />
                <SidebarMenuSkeleton showIcon />
              </SidebarMenu>
            }
          >
            <Nav />
          </Suspense>
        </SidebarContent>
        {/* Profile and Sign out stay in view however long the menu above them is (an admin's scrolls on a laptop),
            set off from it by a rule (Aniket, 23 Oct 2026). */}
        <SidebarSeparator className="mx-4 group-data-[collapsible=icon]:mx-2 data-[orientation=horizontal]:w-auto" />
        <SidebarFooter className="p-0 [--radius:0.75rem]">
          <Suspense
            fallback={
              <SidebarMenu className="px-3 pt-2 pb-4">
                <SidebarMenuSkeleton showIcon />
                <SidebarMenuSkeleton showIcon />
              </SidebarMenu>
            }
          >
            <AppNav roles={[]} foot />
          </Suspense>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="bg-sidebar">
        {/* The panel's round top-left corner scrolls away under this sticky header; the header's ::after paints the
            same quarter-round in the frame colour, so the corner stays round while the page scrolls. */}
        <header className="bg-sidebar sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 px-4 after:pointer-events-none after:absolute after:top-full after:left-0 after:size-7 after:bg-[radial-gradient(circle_at_100%_100%,transparent_calc(1.75rem_-_0.5px),var(--sidebar)_1.75rem)] max-md:after:hidden sm:px-6 lg:px-8">
          <SidebarTrigger className="ring-border size-10 rounded-full ring-1" />
          <Suspense fallback={<Skeleton className="h-4 w-24" />}>
            <AppBreadcrumb />
          </Suspense>
          <div className="ml-auto flex items-center gap-3">
            <Suspense>
              <Today />
            </Suspense>
            <Suspense fallback={<Skeleton className="h-11 w-24 rounded-full" />}>
              <UserMenu />
            </Suspense>
          </div>
        </header>
        <div className="bg-background motion-safe:animate-in motion-safe:fade-in-0 min-w-0 flex-1 px-4 py-6 motion-safe:duration-500 sm:px-6 md:rounded-tl-[1.75rem] lg:px-8 lg:py-8 xl:px-10">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
