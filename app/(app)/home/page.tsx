import { Suspense } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRightIcon } from '@phosphor-icons/react/ssr';
import Loading from '../loading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireViewer, type Viewer } from '@/lib/auth/session';
import { listMyOfferings } from '@/lib/data/workspace';
import { ROLE_LABEL } from '@/lib/format';
import type { Role } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Home' };

const ROLE_SUMMARY: Record<Role, string> = {
  admin: 'Set up the academic structure, manage users and keep records.',
  hod: 'Oversee the courses and results of your department.',
  faculty: 'Teach your course offerings and record student progress.',
  student: 'Learn in your enrolled courses and follow your progress.',
  support: 'Help users with their accounts and sign-in.',
};

export default function HomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const viewer = await requireViewer();
  const today = new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeZone: 'Asia/Kolkata' }).format(new Date());
  return (
    <div className="grid gap-6">
      <section className="from-accent to-card relative overflow-hidden rounded-xl border bg-gradient-to-r p-5 sm:p-6 lg:p-8">
        <Image
          src="/brand/lotus.svg"
          alt=""
          width={200}
          height={200}
          unoptimized
          className="pointer-events-none absolute -top-16 -right-16 w-56 opacity-30 sm:w-72"
        />
        <div className="relative">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase">Welcome back</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance md:text-3xl">
            {viewer.name.split(' ')[0]}
          </h1>
          <p className="text-muted-foreground mt-1.5">{today}</p>
        </div>
      </section>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-4 lg:gap-6">
        <Offerings viewer={viewer} />
        <Shortcuts viewer={viewer} />
        <Card className="border-t-gold border-t">
          <CardHeader>
            <CardTitle>Your access</CardTitle>
            <CardDescription>What your account can do in the LMS.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-4">
              {viewer.roles.map((role) => (
                <li key={role} className="grid gap-1.5">
                  <Badge variant="secondary">{ROLE_LABEL[role]}</Badge>
                  <span className="text-muted-foreground text-sm">{ROLE_SUMMARY[role]}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="border-t-gold border-t">
          <CardHeader>
            <CardTitle>Account security</CardTitle>
            <CardDescription>Change your password or sign out of your other devices.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/profile">
                Open profile
                <ArrowRightIcon />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const OFFERING_ROLES: Role[] = ['admin', 'hod', 'faculty', 'student'];

// Newest five offerings the viewer teaches, oversees or is enrolled in; the full list is /courses.
async function Offerings({ viewer }: { viewer: Viewer }) {
  if (!viewer.roles.some((r) => OFFERING_ROLES.includes(r))) return null;
  const { rows, total } = await listMyOfferings(1, {});
  const studentOnly = viewer.roles.every((r) => r === 'student');
  return (
    <Card className="border-t-gold border-t">
      <CardHeader>
        <CardTitle>{studentOnly ? 'My courses' : 'My offerings'}</CardTitle>
        <CardDescription>{total === 0 ? 'Nothing yet.' : `${total} in total, newest first.`}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {rows.length > 0 && (
          <ul className="grid gap-2 text-sm">
            {rows.slice(0, 5).map((o) => (
              <li key={o.id}>
                <Link href={`/courses/${o.id}`} className="font-medium underline-offset-4 hover:underline">
                  {o.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Button asChild variant="outline" className="justify-self-start">
          <Link href="/courses">
            All courses
            <ArrowRightIcon />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function Shortcuts({ viewer }: { viewer: Viewer }) {
  const links = viewer.roles.includes('admin')
    ? [
        { href: '/admin', label: 'Structure' },
        { href: '/admin/offerings', label: 'Offerings' },
        { href: '/admin/users', label: 'Users' },
      ]
    : viewer.roles.includes('support')
      ? [{ href: '/admin/users', label: 'Users' }]
      : [];
  if (links.length === 0) return null;
  return (
    <Card className="border-t-gold border-t">
      <CardHeader>
        <CardTitle>{viewer.roles.includes('admin') ? 'Administration' : 'Support'}</CardTitle>
        <CardDescription>
          {viewer.roles.includes('admin')
            ? 'Where to set up and look after the LMS.'
            : 'Find a user and send a password link.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {links.map((l) => (
          <Button key={l.href} asChild variant="outline">
            <Link href={l.href}>{l.label}</Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
