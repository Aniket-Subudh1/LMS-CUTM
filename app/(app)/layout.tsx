import { Suspense } from 'react';
import Link from 'next/link';
import { logout } from '@/app/(auth)/actions';
import { getViewer } from '@/lib/auth/session';

const NAV = [
  { href: '/home', label: 'Home' },
  { href: '/profile', label: 'Profile' },
];

function NavLinks() {
  return (
    <ul className="flex flex-col gap-1">
      {NAV.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className="text-ink hover:bg-page block rounded-md px-3 py-2">
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function UserName() {
  const viewer = await getViewer();
  return <span className="text-muted hidden text-sm sm:inline">{viewer?.name}</span>;
}

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[14rem_1fr] lg:grid-rows-[auto_1fr]">
      <header className="border-border bg-surface flex items-center justify-between gap-3 border-b px-4 py-3 lg:col-span-2">
        <Link href="/home" className="font-semibold">
          CUTM LMS
        </Link>
        <div className="flex items-center gap-3">
          <Suspense fallback={<span className="skeleton hidden h-5 w-24 sm:inline-block" />}>
            <UserName />
          </Suspense>
          <form action={logout}>
            <button type="submit" className="btn btn-secondary btn-sm">
              Sign out
            </button>
          </form>
          <details className="relative lg:hidden">
            <summary className="btn btn-secondary btn-sm list-none">Menu</summary>
            <nav
              aria-label="Primary"
              className="border-border bg-surface absolute right-0 z-10 mt-2 w-48 rounded-md border p-2 shadow"
            >
              <NavLinks />
            </nav>
          </details>
        </div>
      </header>
      <nav aria-label="Primary" className="border-border bg-surface hidden border-r p-4 lg:block">
        <NavLinks />
      </nav>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
