import { Suspense } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookOpenTextIcon,
  BooksIcon,
  BuildingsIcon,
  CalendarPlusIcon,
  ChalkboardTeacherIcon,
  ClockCounterClockwiseIcon,
  DevicesIcon,
  FileArrowUpIcon,
  FilePlusIcon,
  GraduationCapIcon,
  KeyIcon,
  LightningIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import Loading from './loading';
import { EmptyState } from '@/components/data-table';
import { LinkSpinner } from '@/components/link-spinner';
import { OfferingCard } from '@/components/offering-card';
import { Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireViewer, type Viewer } from '@/lib/auth/session';
import { getHomeSummary, listMyOfferings, type HomeSummary } from '@/lib/data/workspace';
import { dayGreeting, formatDateTime, ROLE_LABEL } from '@/lib/format';
import { ROLES, type Role } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Home' };

const ROLE_SUMMARY: Record<Role, string> = {
  admin: 'Set up the academic structure, manage users and keep records.',
  hod: 'Oversee the courses and results of your department.',
  faculty: 'Teach your course offerings and record student progress.',
  student: 'Learn in your enrolled courses and follow your progress.',
  support: 'Help users with their accounts and sign-in.',
};

const count = new Intl.NumberFormat('en-IN');

type Tile = { href: string; label: string; value: number; note: string; icon: Icon };
type QuickAction = { href: string; title: string; text: string; icon: Icon };

const ADMIN_ACTIONS: QuickAction[] = [
  {
    href: '/admin/users?new=user',
    title: 'Add a user',
    text: 'Invite one student or staff member.',
    icon: UserPlusIcon,
  },
  {
    href: '/admin/users?new=import',
    title: 'Import users',
    text: 'Invite many at once from a CSV file.',
    icon: FileArrowUpIcon,
  },
  {
    href: '/admin/courses?new=course',
    title: 'New course',
    text: 'Add a course to the catalogue.',
    icon: FilePlusIcon,
  },
  {
    href: '/admin/offerings?new=offering',
    title: 'New offering',
    text: 'Run a course for a batch in a term.',
    icon: ChalkboardTeacherIcon,
  },
  { href: '/admin/terms?new=term', title: 'Add a term', text: 'Open the next academic term.', icon: CalendarPlusIcon },
  {
    href: '/admin/departments?new=department',
    title: 'Add a department',
    text: 'Create a teaching department.',
    icon: BuildingsIcon,
  },
];

const SUPPORT_ACTIONS: QuickAction[] = [
  {
    href: '/admin/users',
    title: 'Find a user',
    text: 'Search by name, email or roll number and send a password link.',
    icon: MagnifyingGlassIcon,
  },
];

export default function HomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const viewer = await requireViewer();
  const summary = await getHomeSummary();
  const actions = viewer.roles.includes('admin')
    ? ADMIN_ACTIONS
    : viewer.roles.includes('support')
      ? SUPPORT_ACTIONS
      : [];
  const tiles = tilesFor(viewer, summary);
  return (
    <div className="grid gap-6 lg:gap-8">
      <Greeting viewer={viewer} />
      {tiles.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3 sm:gap-4">
          {tiles.map((t) => (
            <li key={t.label}>
              <Link href={t.href} className="surface-interactive group flex h-full flex-col gap-4 p-4 sm:p-5">
                <span className="flex items-start justify-between gap-2">
                  <span className="icon-chip size-10 [&_svg]:size-5">
                    <t.icon weight="duotone" />
                  </span>
                  <span className="text-muted-foreground group-hover:text-primary flex items-center gap-1 transition-colors">
                    <LinkSpinner />
                    <ArrowUpRightIcon className="size-4" />
                  </span>
                </span>
                <span className="grid gap-0.5">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums">{count.format(t.value)}</span>
                  <span className="text-sm font-medium">{t.label}</span>
                  <span className="text-muted-foreground text-xs">{t.note}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="grid items-start gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid gap-6 lg:gap-8">
          {actions.length > 0 && (
            <Section
              icon={<LightningIcon weight="duotone" />}
              title="Quick actions"
              description="Start the most common tasks in one click."
            >
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
                {actions.map((a) => (
                  <li key={a.href}>
                    <Link href={a.href} className="surface-interactive group flex h-full items-center gap-3 p-4">
                      <span className="icon-chip size-11 [&_svg]:size-6">
                        <a.icon weight="duotone" />
                      </span>
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="font-medium">{a.title}</span>
                        <span className="text-muted-foreground text-xs leading-snug">{a.text}</span>
                      </span>
                      <LinkSpinner />
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Offerings viewer={viewer} />
        </div>
        <div className="grid gap-6 lg:gap-8">
          {summary.admin && <RecentActivity recent={summary.admin.recent} />}
          <Security />
        </div>
      </div>
    </div>
  );
}

function tilesFor(viewer: Viewer, summary: HomeSummary): Tile[] {
  const studentOnly = viewer.roles.every((r) => r === 'student');
  return [
    ...(summary.myOfferings !== null
      ? [
          {
            href: '/courses',
            label: studentOnly ? 'My courses' : 'My offerings',
            value: summary.myOfferings,
            note: studentOnly ? 'Active and completed' : 'Taught or overseen',
            icon: BooksIcon,
          },
        ]
      : []),
    ...(summary.enrolments !== null
      ? [
          {
            href: '/courses',
            label: 'Student enrolments',
            value: summary.enrolments,
            note: 'Active, across your offerings',
            icon: UsersThreeIcon,
          },
        ]
      : []),
    ...(summary.admin
      ? [
          {
            href: '/admin/users',
            label: 'Users',
            value: summary.admin.users,
            note: `${count.format(summary.admin.invited)} yet to sign in`,
            icon: UsersThreeIcon,
          },
          {
            href: '/admin/offerings?status=active',
            label: 'Active offerings',
            value: summary.admin.activeOfferings,
            note: 'Open to their students',
            icon: ChalkboardTeacherIcon,
          },
          {
            href: '/admin/courses',
            label: 'Courses',
            value: summary.admin.courses,
            note: 'In the catalogue',
            icon: BookOpenTextIcon,
          },
          {
            href: '/admin/programs',
            label: 'Programmes',
            value: summary.admin.programs,
            note: 'Active',
            icon: GraduationCapIcon,
          },
          {
            href: '/admin/departments',
            label: 'Departments',
            value: summary.admin.departments,
            note: 'Active',
            icon: BuildingsIcon,
          },
        ]
      : []),
  ];
}

function Greeting({ viewer }: { viewer: Viewer }) {
  const primary = ROLES.find((r) => viewer.roles.includes(r)) ?? 'student';
  return (
    <section className="surface relative overflow-hidden p-5 sm:p-7">
      <div
        aria-hidden="true"
        className="from-primary/[0.07] to-gold/[0.12] pointer-events-none absolute inset-0 bg-linear-to-br via-transparent"
      />
      <Image
        src="/brand/lotus.svg"
        alt=""
        width={200}
        height={200}
        unoptimized
        loading="eager"
        className="pointer-events-none absolute -top-20 -right-16 w-64 opacity-30 sm:w-80"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <p className="text-muted-foreground text-sm font-medium">{dayGreeting(new Date())}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {viewer.name.split(' ')[0]}
          </h1>
          <p className="text-muted-foreground max-w-xl text-sm leading-relaxed">{ROLE_SUMMARY[primary]}</p>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Your roles">
          {viewer.roles.map((role) => (
            <li key={role}>
              <Badge variant="secondary" className="bg-card/80 ring-border px-2.5 py-1 ring-1">
                {ROLE_LABEL[role]}
              </Badge>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const OFFERING_ROLES: Role[] = ['admin', 'hod', 'faculty', 'student'];

// The newest six offerings the viewer teaches, oversees or is enrolled in; the full list is /courses.
async function Offerings({ viewer }: { viewer: Viewer }) {
  if (!viewer.roles.some((r) => OFFERING_ROLES.includes(r))) return null;
  const { rows, total } = await listMyOfferings(1, {});
  const studentOnly = viewer.roles.every((r) => r === 'student');
  return (
    <Section
      icon={<BooksIcon weight="duotone" />}
      title={viewer.roles.includes('admin') ? 'Newest offerings' : studentOnly ? 'My courses' : 'My offerings'}
      description={total === 0 ? 'Nothing yet.' : `${count.format(total)} in total, newest first.`}
      action={
        total > 0 && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/courses">
              View all <ArrowRightIcon />
            </Link>
          </Button>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          text={studentOnly ? 'You are not enrolled in a course yet.' : 'No offerings yet.'}
          icon={<BooksIcon weight="duotone" />}
        />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3">
          {rows.slice(0, 6).map((o) => (
            <li key={o.id}>
              <OfferingCard offering={o} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function RecentActivity({ recent }: { recent: NonNullable<HomeSummary['admin']>['recent'] }) {
  return (
    <Section
      icon={<ClockCounterClockwiseIcon weight="duotone" />}
      title="Recent activity"
      description="The latest entries in the audit log."
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/audit">
            Audit log <ArrowRightIcon />
          </Link>
        </Button>
      }
    >
      {recent.length === 0 ? (
        <EmptyState text="Nothing has been recorded yet." icon={<ClockCounterClockwiseIcon weight="duotone" />} />
      ) : (
        <ol className="surface grid p-2">
          {recent.map((a) => (
            <li
              key={a.id}
              className="before:bg-border relative flex gap-3 rounded-lg p-3 before:absolute before:top-8 before:bottom-0 before:left-[1.05rem] before:w-px last:before:hidden"
            >
              <span
                aria-hidden="true"
                className="bg-primary ring-primary/15 mt-1.5 size-2 shrink-0 rounded-full ring-4"
              />
              <span className="grid min-w-0 gap-0.5">
                <span className="text-sm">
                  <span className="font-medium">{a.actor}</span>{' '}
                  <span className="text-muted-foreground">{a.action.replace(/[._]/g, ' ')}</span>
                </span>
                <time dateTime={a.at.toISOString()} className="text-muted-foreground text-xs">
                  {formatDateTime(a.at)}
                </time>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function Security() {
  return (
    <Section
      icon={<ShieldCheckIcon weight="duotone" />}
      title="Account security"
      description="Keep your account yours."
    >
      <ul className="surface grid divide-y p-1">
        {[
          {
            href: '/profile?new=password',
            label: 'Change password',
            text: 'Signs you out on other devices.',
            icon: KeyIcon,
          },
          {
            href: '/profile',
            label: 'Sessions and profile',
            text: 'Sign out everywhere, see your details.',
            icon: DevicesIcon,
          },
        ].map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="hover:bg-primary/[0.04] group flex items-center gap-3 rounded-lg p-3 transition-colors"
            >
              <span className="icon-chip size-9 [&_svg]:size-5">
                <l.icon weight="duotone" />
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-sm font-medium">{l.label}</span>
                <span className="text-muted-foreground text-xs">{l.text}</span>
              </span>
              <LinkSpinner />
              <ArrowRightIcon className="text-muted-foreground group-hover:text-primary size-4 transition-colors" />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
