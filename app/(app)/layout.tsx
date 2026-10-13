import { Suspense } from 'react';
import Link from 'next/link';
import { connection } from 'next/server';
import { CalendarBlankIcon, CaretDownIcon, SignOutIcon, UserCircleIcon } from '@phosphor-icons/react/ssr';
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
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { getViewer } from '@/lib/auth/session';
import { formatLongDate, initials, ROLE_LABEL } from '@/lib/format';
import { ROLES } from '@/lib/schemas/common';

async function UserMenu() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const role = ROLES.find((r) => viewer.roles.includes(r));
  return (
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
      <DropdownMenuContent align="end" className="w-60 rounded-xl">
        <DropdownMenuLabel className="grid font-normal">
          <span className="truncate font-medium">{viewer.name}</span>
          <span className="text-muted-foreground truncate text-xs">{role && ROLE_LABEL[role]}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserCircleIcon weight="duotone" />
            Profile
          </Link>
        </DropdownMenuItem>
        <form action={logout}>
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit" className="w-full">
              <SignOutIcon weight="duotone" />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
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
    <SidebarProvider className="[--sidebar-width-icon:3.5rem]! [--sidebar-width:16rem]!">
      <Sidebar collapsible="icon" className="group-data-[side=left]:border-r-0">
        <SidebarHeader className="px-4 pt-6 pb-4 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:py-3">
          <Link
            href="/home"
            className="focus-visible:ring-ring grid justify-items-center gap-2.5 rounded-xl focus-visible:ring-2 focus-visible:outline-none"
          >
            <UniversityLogo priority sizes="68px" className="w-[4.25rem] group-data-[collapsible=icon]:w-9" />
            {/* Letter spacing trails the last letter, so the right padding is smaller to keep it centred. */}
            <span className="bg-primary text-primary-foreground rounded-full py-1 pr-3 pl-4 text-[0.8125rem] font-bold tracking-[0.32em] group-data-[collapsible=icon]:sr-only">
              LMS
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent className="pt-3">
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
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="bg-sidebar">
        <header className="bg-sidebar sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 px-4 sm:px-6 lg:px-8">
          <SidebarTrigger className="ring-border size-10 rounded-full ring-1" />
          <Suspense fallback={<Skeleton className="h-4 w-24" />}>
            <AppBreadcrumb />
          </Suspense>
          <div className="ml-auto flex items-center gap-3">
            <Suspense>
              <Today />
            </Suspense>
            <Suspense fallback={<Skeleton className="size-11 rounded-full" />}>
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
