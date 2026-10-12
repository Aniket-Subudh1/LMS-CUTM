import { Suspense } from 'react';
import Link from 'next/link';
import { connection } from 'next/server';
import { CalendarBlankIcon, CaretUpDownIcon, SignOutIcon, UserCircleIcon } from '@phosphor-icons/react/ssr';
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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="bg-sidebar-accent/60 hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent ring-sidebar-border h-14 rounded-xl ring-1 group-data-[collapsible=icon]:ring-0"
            >
              <Avatar className="size-9 rounded-lg">
                <AvatarFallback className="from-primary to-primary/75 text-primary-foreground rounded-lg bg-linear-to-br text-sm font-semibold">
                  {initials(viewer.name)}
                </AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">{viewer.name}</span>
                <span className="text-muted-foreground truncate text-xs">{role && ROLE_LABEL[role]}</span>
              </span>
              <CaretUpDownIcon className="text-muted-foreground ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-60 rounded-xl"
          >
            <DropdownMenuLabel className="grid font-normal">
              <span className="truncate font-medium">{viewer.name}</span>
              <span className="text-muted-foreground truncate text-xs">{viewer.email}</span>
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
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

async function Nav() {
  const viewer = await getViewer();
  return <AppNav roles={viewer?.roles ?? []} />;
}

async function Today() {
  await connection();
  return (
    <p className="text-muted-foreground ml-auto flex shrink-0 items-center gap-2 text-sm max-sm:hidden">
      <CalendarBlankIcon weight="duotone" className="size-4" />
      {formatLongDate(new Date())}
    </p>
  );
}

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <SidebarProvider className="[--sidebar-width:16rem]!">
      <Sidebar collapsible="icon" className="border-sidebar-border">
        <SidebarHeader className="px-4 pt-5 pb-3 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:py-3">
          <Link
            href="/home"
            className="focus-visible:ring-ring flex flex-col items-center gap-2 rounded-lg focus-visible:ring-2 focus-visible:outline-none"
          >
            <UniversityLogo priority sizes="72px" className="w-[4.5rem] group-data-[collapsible=icon]:w-8" />
            <span className="bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide group-data-[collapsible=icon]:hidden">
              Learning Management
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent className="px-1.5">
          <Suspense
            fallback={
              <SidebarMenu className="px-2">
                <SidebarMenuSkeleton showIcon />
                <SidebarMenuSkeleton showIcon />
                <SidebarMenuSkeleton showIcon />
              </SidebarMenu>
            }
          >
            <Nav />
          </Suspense>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <Suspense fallback={<SidebarMenuSkeleton showIcon />}>
            <UserMenu />
          </Suspense>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="bg-background/85 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur-md sm:px-6 lg:px-8 xl:px-10">
          <SidebarTrigger className="-ml-2" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Suspense fallback={<Skeleton className="h-4 w-24" />}>
            <AppBreadcrumb />
          </Suspense>
          <Suspense>
            <Today />
          </Suspense>
        </header>
        <div className="motion-safe:animate-in motion-safe:fade-in-0 min-w-0 flex-1 px-4 py-6 motion-safe:duration-500 sm:px-6 lg:px-8 lg:py-8 xl:px-10">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
