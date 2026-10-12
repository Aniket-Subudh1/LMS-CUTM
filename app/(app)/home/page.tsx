import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
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

export default async function HomePage() {
  const viewer = await requireViewer();
  const today = new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeZone: 'Asia/Kolkata' }).format(new Date());
  return (
    <>
      <PageHeader title={`Welcome, ${viewer.name.split(' ')[0]}`} description={today} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="text-primary size-5" />
              Your access
            </CardTitle>
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="text-primary size-5" />
              Account security
            </CardTitle>
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
    </>
  );
}
