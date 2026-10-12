import { Suspense } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Loading from '../loading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireViewer } from '@/lib/auth/session';
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
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
