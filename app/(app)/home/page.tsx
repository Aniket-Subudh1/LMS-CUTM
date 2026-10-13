import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookOpenTextIcon,
  BooksIcon,
  CalendarBlankIcon,
  CaretRightIcon,
  ChalkboardTeacherIcon,
  ClockCounterClockwiseIcon,
  GraduationCapIcon,
  MagnifyingGlassIcon,
  MedalIcon,
  PencilSimpleLineIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  UserIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import Loading from './loading';
import { EmptyState } from '@/components/data-table';
import { LinkSpinner } from '@/components/link-spinner';
import { OfferingCard } from '@/components/offering-card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireViewer, type Viewer } from '@/lib/auth/session';
import { getHomeSummary, listMyOfferings, type HomeSummary, type MyOfferingRow } from '@/lib/data/workspace';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, initials, statusTone } from '@/lib/format';
import type { Role } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Dashboard' };

const count = new Intl.NumberFormat('en-IN');
const weekday = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short' });
const changes = (n: number) => `${count.format(n)} ${n === 1 ? 'change' : 'changes'}`;

const OFFERING_ROLES: Role[] = ['admin', 'hod', 'faculty', 'student'];

type Tile = { href: string; label: string; value: number; note?: string; icon: Icon };
type Action = { href: string; label: string; icon: Icon };

export default function HomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const viewer = await requireViewer();
  const [summary, offerings] = await Promise.all([
    getHomeSummary(),
    viewer.roles.some((r) => OFFERING_ROLES.includes(r)) ? listMyOfferings(1, {}) : null,
  ]);
  const [featured, ...rest] = offerings?.rows ?? [];
  const next = rest.slice(0, 3);
  const tiles = tilesFor(viewer, summary);
  const side = tiles.length > 0 || summary.admin !== null || next.length > 0;
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">Hello, {viewer.name.split(' ')[0]}</h1>
      <div className={cn('grid items-start gap-5', side && 'xl:grid-cols-[19rem_minmax(0,1fr)]')}>
        <div className="grid gap-5">
          <Hero viewer={viewer} featured={featured} />
          {summary.admin && <RecentActivity recent={summary.admin.recent} />}
        </div>
        {side && (
          <div className="grid gap-5">
            {tiles.length > 0 && (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,9.5rem),1fr))] gap-4">
                {tiles.map((t) => (
                  <li key={t.label}>
                    <Link href={t.href} className="surface-interactive flex h-full flex-col gap-5 p-4">
                      <span className="flex items-start gap-3">
                        <span className="icon-chip size-10 [&_svg]:size-5">
                          <t.icon weight="duotone" />
                        </span>
                        <span className="text-muted-foreground max-w-24 text-sm leading-tight">{t.label}</span>
                        <LinkSpinner className="ml-auto" />
                      </span>
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[2rem] leading-none font-semibold tracking-tight tabular-nums">
                          {count.format(t.value)}
                        </span>
                        {t.note && <span className="text-muted-foreground text-xs">{t.note}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {summary.admin && (
              <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <Activity activity={summary.admin.activity} />
                <MostActive people={summary.admin.mostActive} viewerId={viewer.id} />
              </div>
            )}
            {offerings && next.length > 0 && (
              <section className="surface grid gap-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold tracking-tight">
                      {viewer.roles.includes('admin')
                        ? 'Newest offerings'
                        : viewer.roles.every((r) => r === 'student')
                          ? 'My courses'
                          : 'My offerings'}
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      {count.format(offerings.total)} in total, newest first.
                    </p>
                  </div>
                  <Link
                    href="/courses"
                    className="hover:text-primary flex shrink-0 items-center gap-1 text-sm font-medium transition-colors"
                  >
                    View all
                    <LinkSpinner />
                    <CaretRightIcon className="size-4" />
                  </Link>
                </div>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {next.map((o, i) => (
                    <li key={o.id}>
                      <OfferingCard offering={o} featured={i === 0} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
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
            icon: BooksIcon,
          },
        ]
      : []),
    ...(summary.enrolments !== null
      ? [{ href: '/courses', label: 'Student enrolments', value: summary.enrolments, icon: UsersThreeIcon }]
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
            icon: ChalkboardTeacherIcon,
          },
          { href: '/admin/courses', label: 'Courses', value: summary.admin.courses, icon: BookOpenTextIcon },
          { href: '/admin/programs', label: 'Programmes', value: summary.admin.programs, icon: GraduationCapIcon },
        ]
      : []),
  ];
}

// The viewer's newest offering with a way in; without one, what to do first.
function Hero({ viewer, featured }: { viewer: Viewer; featured?: MyOfferingRow }) {
  const isAdmin = viewer.roles.includes('admin');
  const studentOnly = viewer.roles.every((r) => r === 'student');
  const second: Action | null = isAdmin
    ? { href: '/admin/offerings?new=offering', label: 'New offering', icon: PlusIcon }
    : viewer.roles.includes('support') && !featured
      ? { href: '/admin/users', label: 'Find a user', icon: MagnifyingGlassIcon }
      : featured && viewer.roles.some((r) => r === 'faculty' || r === 'hod')
        ? { href: `/courses/${featured.id}/people`, label: 'Students', icon: UsersThreeIcon }
        : featured
          ? { href: '/courses', label: 'All my courses', icon: BooksIcon }
          : null;
  return (
    <section className="bg-card from-primary/15 via-primary/25 to-primary/45 ring-primary/15 grid gap-5 rounded-2xl bg-linear-to-br p-5 ring-1">
      {featured ? (
        <>
          <div className="flex items-start gap-4">
            <span className="bg-primary text-primary-foreground grid size-20 shrink-0 place-content-center justify-items-center gap-1 rounded-xl">
              <BookOpenTextIcon weight="fill" className="size-7" />
              <span className="max-w-16 truncate text-[0.625rem] font-semibold tracking-wide">{featured.termCode}</span>
            </span>
            <div className="grid min-w-0 gap-1.5">
              <h2 className="line-clamp-3 leading-snug font-semibold">{featured.title}</h2>
              <p className="text-foreground/70 line-clamp-2 text-sm">
                {featured.faculty.length > 0 ? featured.faculty.join(', ') : 'No faculty assigned'}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-foreground/70">
              {isAdmin ? 'Newest offering' : studentOnly ? 'Your newest course' : 'Your newest offering'}
            </span>
            <Badge variant={statusTone(featured.status)} className="bg-card capitalize">
              {featured.status}
            </Badge>
          </div>
        </>
      ) : (
        <div className="flex items-start gap-4">
          <span className="bg-primary text-primary-foreground grid size-16 shrink-0 place-items-center rounded-xl">
            <GraduationCapIcon weight="fill" className="size-7" />
          </span>
          <div className="grid min-w-0 gap-1.5">
            <h2 className="leading-snug font-semibold">Welcome to the LMS</h2>
            <p className="text-foreground/70 text-sm">
              {viewer.roles.includes('support') && !viewer.roles.some((r) => OFFERING_ROLES.includes(r))
                ? 'Help users with their accounts and sign-in.'
                : studentOnly
                  ? 'You are not enrolled in a course yet.'
                  : 'No offerings yet.'}
            </p>
          </div>
        </div>
      )}
      {(featured || second) && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {featured && (
            <Button asChild className="bg-card text-foreground hover:bg-card/80 h-11 rounded-full text-[0.9375rem]">
              <Link href={`/courses/${featured.id}`}>
                Open course
                <LinkSpinner />
              </Link>
            </Button>
          )}
          {second && (
            <Button asChild className="h-12 justify-between rounded-full px-5 text-[0.9375rem]">
              <Link href={second.href}>
                <span className="flex items-center gap-2.5">
                  <second.icon weight="duotone" className="size-5" />
                  {second.label}
                </span>
                <span className="flex items-center gap-1">
                  <LinkSpinner />
                  <CaretRightIcon className="size-4" />
                </span>
              </Link>
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

const ENTITY: Record<string, { icon: Icon; tone: string }> = {
  user: { icon: UserIcon, tone: 'bg-primary' },
  user_import: { icon: UsersThreeIcon, tone: 'bg-primary' },
  course: { icon: BookOpenTextIcon, tone: 'bg-foreground' },
  offering: { icon: ChalkboardTeacherIcon, tone: 'bg-success' },
  scheme: { icon: SlidersHorizontalIcon, tone: 'bg-gold' },
};
const OTHER = { icon: ClockCounterClockwiseIcon, tone: 'bg-muted-foreground' };

function RecentActivity({ recent }: { recent: NonNullable<HomeSummary['admin']>['recent'] }) {
  return (
    <section className="surface grid gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Recent activity</h2>
          <p className="text-muted-foreground text-sm">The latest audit entries.</p>
        </div>
        <Link
          href="/admin/audit"
          aria-label="Open the audit log"
          className="bg-foreground text-background hover:bg-foreground/85 grid size-9 shrink-0 place-items-center rounded-full transition-colors"
        >
          <ArrowUpRightIcon className="size-4" />
        </Link>
      </div>
      {recent.length === 0 ? (
        <EmptyState text="Nothing has been recorded yet." icon={<ClockCounterClockwiseIcon weight="duotone" />} />
      ) : (
        <ol className="grid gap-4">
          {recent.map((a) => {
            const e = ENTITY[a.entity] ?? OTHER;
            return (
              <li key={a.id} className="flex items-center gap-3">
                <span
                  className={cn('text-primary-foreground grid size-14 shrink-0 place-items-center rounded-xl', e.tone)}
                >
                  <e.icon weight="duotone" className="size-6" />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5 leading-tight">
                  <span className="truncate text-sm font-semibold first-letter:uppercase">
                    {a.action.replace(/[._]/g, ' ')}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">by {a.actor}</span>
                  <time dateTime={a.at.toISOString()} className="text-primary text-xs">
                    {formatDateTime(a.at)}
                  </time>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// Changes per IST day as bars; today's bar is striped and labelled, as in the reference dashboard.
function Activity({ activity }: { activity: NonNullable<HomeSummary['admin']>['activity'] }) {
  // About a fifth of headroom above the tallest bar keeps today's label inside the chart.
  const top = Math.max(4, Math.ceil((Math.max(...activity.map((d) => d.count)) * 1.2) / 4) * 4);
  const today = activity.length - 1;
  const level = `${(activity[today].count / top) * 100}%`;
  return (
    <section className="surface grid gap-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
          <p className="text-muted-foreground text-sm">Changes recorded per day.</p>
        </div>
        <span className="ring-border text-muted-foreground flex h-9 items-center gap-2 rounded-full px-3 text-sm ring-1">
          <CalendarBlankIcon className="size-4" />
          Last 7 days
        </span>
      </div>
      <figure className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
        <figcaption className="sr-only">Changes recorded on each of the last seven days.</figcaption>
        <ol
          aria-hidden="true"
          className="text-muted-foreground -my-2 flex h-52 flex-col justify-between text-xs tabular-nums"
        >
          {[4, 3, 2, 1, 0].map((i) => (
            <li key={i} className="text-right">
              {count.format((top / 4) * i)}
            </li>
          ))}
        </ol>
        <div className="relative h-52">
          <span
            aria-hidden="true"
            className="border-foreground/25 absolute inset-x-0 border-t border-dashed"
            style={{ bottom: level }}
          />
          <ol className="relative grid h-full grid-cols-7 items-end gap-2 sm:gap-3">
            {activity.map((d, i) => (
              <li key={d.day.toISOString()} className="relative flex h-full flex-col justify-end">
                {i === today && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 z-10 flex justify-center"
                    style={{ bottom: `calc(${level} - 0.3125rem)` }}
                  >
                    <span className="bg-foreground ring-card size-2.5 rounded-full ring-2" />
                    <span className="bg-foreground text-background absolute right-0 bottom-full mb-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap">
                      {changes(d.count)}
                    </span>
                  </span>
                )}
                <span
                  className={cn(
                    'block rounded-lg',
                    i === today
                      ? 'bg-[repeating-linear-gradient(135deg,var(--primary)_0_0.375rem,color-mix(in_oklch,var(--primary)_55%,white)_0.375rem_0.75rem)]'
                      : 'from-muted-foreground/25 to-muted-foreground/10 bg-linear-to-b',
                  )}
                  style={{ height: `max(${(d.count / top) * 100}%, 0.375rem)` }}
                />
                <span className="sr-only">
                  {formatDate(d.day)}: {changes(d.count)}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <span />
        <ol aria-hidden="true" className="grid grid-cols-7 gap-2 text-center text-sm sm:gap-3">
          {activity.map((d, i) => (
            <li key={d.day.toISOString()} className={i === today ? 'font-semibold' : 'text-muted-foreground'}>
              {weekday.format(d.day)}
            </li>
          ))}
        </ol>
      </figure>
    </section>
  );
}

const MEDAL = ['text-gold', 'text-muted-foreground/50', 'text-warning'];

function MostActive({
  people,
  viewerId,
}: {
  people: NonNullable<HomeSummary['admin']>['mostActive'];
  viewerId: string;
}) {
  return (
    <section className="surface flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Most active</h2>
        <p className="text-muted-foreground text-sm">Most changes in the last 7 days.</p>
      </div>
      {people.length === 0 ? (
        <p className="text-muted-foreground text-sm">No changes recorded this week.</p>
      ) : (
        <ol className="grid gap-2.5">
          {people.map((p, i) => {
            const you = p.id === viewerId;
            return (
              <li
                key={p.id}
                className={cn(
                  'ring-border flex items-center gap-3 rounded-xl p-2.5 ring-1',
                  you && 'bg-gold/5 ring-gold/50',
                )}
              >
                <span className="bg-muted grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold">
                  {i + 1}
                </span>
                <Avatar className="size-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {initials(p.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{p.name}</span>
                    {you && <span className="text-primary shrink-0 text-xs">You</span>}
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <PencilSimpleLineIcon weight="fill" className="text-gold size-3.5" />
                    {changes(p.count)}
                  </span>
                </span>
                <MedalIcon weight="fill" aria-hidden="true" className={cn('size-6 shrink-0', MEDAL[i])} />
              </li>
            );
          })}
        </ol>
      )}
      <Link
        href="/admin/audit"
        className="text-primary mt-auto flex items-center justify-center gap-1 text-sm font-medium hover:underline"
      >
        Open the audit log
        <ArrowRightIcon className="size-4" />
      </Link>
    </section>
  );
}
