import { Suspense } from 'react';
import Link from 'next/link';
import { ChevronsUpDown, LogOut, UserRound } from 'lucide-react';
import { logout } from '@/app/(auth)/actions';
import { AppBreadcrumb, AppNav } from '@/components/app-nav';
import { UniversityLogo } from '@/components/university-logo';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

async function UserMenu() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const initials = viewer.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground rounded-lg font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{viewer.name}</span>
                <span className="truncate text-xs opacity-70">{viewer.email}</span>
              </span>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <UserRound />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={logout}>
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full">
                  <LogOut />
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

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <SidebarProvider className="[--sidebar-width:15rem]!">
      <Sidebar collapsible="icon">
        <SidebarHeader className="items-center border-b px-3 py-4 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:py-3">
          <Link
            href="/home"
            className="focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <UniversityLogo priority sizes="72px" className="w-[4.5rem] group-data-[collapsible=icon]:w-8" />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <Suspense
            fallback={
              <SidebarMenu className="px-2">
                <SidebarMenuSkeleton showIcon />
                <SidebarMenuSkeleton showIcon />
              </SidebarMenu>
            }
          >
            <Nav />
          </Suspense>
        </SidebarContent>
        <SidebarFooter>
          <Suspense fallback={<SidebarMenuSkeleton showIcon />}>
            <UserMenu />
          </Suspense>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="bg-background/95 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur sm:px-6 lg:px-8 xl:px-10">
          <SidebarTrigger className="-ml-2" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Suspense fallback={<Skeleton className="h-4 w-24" />}>
            <AppBreadcrumb />
          </Suspense>
        </header>
        <main className="motion-safe:animate-in motion-safe:fade-in-0 min-w-0 flex-1 px-4 py-6 motion-safe:duration-500 sm:px-6 lg:px-8 lg:py-8 xl:px-10">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
