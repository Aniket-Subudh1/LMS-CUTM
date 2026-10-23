import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BooksIcon,
  CalendarBlankIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
  MedalIcon,
  PencilSimpleLineIcon,
  PlusIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import Loading from './loading';
import { EmptyState } from '@/components/data-table';
import { LinkSpinner } from '@/components/link-spinner';
import { PageIcon, type PageIconName } from '@/components/page-icon';
import { OfferingCard } from '@/components/offering-card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { requireViewer, type Viewer } from '@/lib/auth/session';
import { listContinueLearning, type ContinueRow } from '@/lib/data/content';
import { listTodaysLiveSessions, type TodayClass } from '@/lib/data/live';
import { listDueSoon, listToGrade, type DueSoonRow, type ToGradeRow } from '@/lib/data/assessments';
import { unreadCount } from '@/lib/data/notifications';
import {
  getHomeSummary,
  listMyOfferings,
  listPlanRequests,
  type HomeSummary,
  type MyOfferingRow,
  type PlanRequestRow,
} from '@/lib/data/workspace';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatDue, formatTime, initials, statusTone } from '@/lib/format';
import type { Role } from '@/lib/schemas/common';

export const metadata: Metadata = { title: 'Dashboard' };

const count = new Intl.NumberFormat('en-IN');
const weekday = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short' });
const changes = (n: number) => `${count.format(n)} ${n === 1 ? 'change' : 'changes'}`;

const OFFERING_ROLES: Role[] = ['admin', 'hod', 'faculty', 'student'];

type Tile = { href: string; label: string; value: number; note?: string; icon: PageIconName };
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
  // M04b (TP-03): a candidate has only their tests.
  if (viewer.roles.every((role) => role === 'candidate')) redirect('/tests');
  const [summary, offerings, continueLearning, planRequests, unread, today, dueSoon, toGrade] = await Promise.all([
    getHomeSummary(),
    viewer.roles.some((r) => OFFERING_ROLES.includes(r)) ? listMyOfferings(1, {}) : null,
    viewer.roles.includes('student') ? listContinueLearning() : [],
    viewer.roles.includes('faculty') ? listPlanRequests() : [],
    unreadCount(),
    viewer.roles.some((r) => r === 'student' || r === 'faculty' || r === 'admin') ? listTodaysLiveSessions() : [],
    viewer.roles.includes('student') ? listDueSoon() : [],
    viewer.roles.includes('faculty') ? listToGrade() : [],
  ]);
  const [featured, ...rest] = offerings?.rows ?? [];
  const next = rest.slice(0, 3);
  const tiles = tilesFor(viewer, summary, unread);
  const side =
    tiles.length > 0 ||
    summary.admin !== null ||
    next.length > 0 ||
    continueLearning.length > 0 ||
    planRequests.length > 0 ||
    today.length > 0 ||
    dueSoon.length > 0 ||
    toGrade.length > 0;
  return (
    <div className="grid gap-6">
      <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
        <PageIcon name="dashboard" className="size-8" />
        Hello, {viewer.name.split(' ')[0]}
      </h1>
      <div className={cn('grid items-start gap-5', side && 'xl:grid-cols-[19rem_minmax(0,1fr)]')}>
        <div className="grid gap-5">
          <Hero viewer={viewer} featured={featured} />
          {summary.admin && <RecentActivity recent={summary.admin.recent} />}
        </div>
        {side && (
          <div className="grid gap-5">
            {today.length > 0 && <TodaysClasses rows={today} student={viewer.roles.includes('student')} />}
            {planRequests.length > 0 && <PlanRequests rows={planRequests} />}
            {dueSoon.length > 0 && <DueSoon rows={dueSoon} />}
            {toGrade.length > 0 && <ToGrade rows={toGrade} />}
            {continueLearning.length > 0 && <ContinueLearning rows={continueLearning} />}
            {tiles.length > 0 && (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,9.5rem),1fr))] gap-4">
                {tiles.map((t) => (
                  <li key={t.label}>
                    <Link href={t.href} className="surface-interactive relative flex h-full flex-col gap-5 p-4">
                      {/* On a phone a tile is about 150 px wide: the label goes under its icon so one long word fits. */}
                      <span className="flex items-start gap-3 max-sm:flex-col max-sm:gap-2">
                        <span className="icon-chip size-10">
                          <PageIcon name={t.icon} className="size-8" />
                        </span>
                        <span className="text-muted-foreground text-sm leading-tight sm:max-w-24">{t.label}</span>
                        <LinkSpinner className="absolute top-4 right-4" />
                      </span>
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">
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
                  {next.map((o) => (
                    <li key={o.id}>
                      <OfferingCard offering={o} />
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

function tilesFor(viewer: Viewer, summary: HomeSummary, unread: number): Tile[] {
  const studentOnly = viewer.roles.every((r) => r === 'student');
  const tiles: Tile[] = [];
  if (summary.myOfferings !== null) {
    tiles.push({
      href: '/courses',
      label: studentOnly ? 'My courses' : 'My offerings',
      value: summary.myOfferings,
      icon: 'courses',
    });
  }
  if (summary.enrolments !== null) {
    tiles.push({ href: '/courses', label: 'Student enrolments', value: summary.enrolments, icon: 'users' });
  }
  if (summary.admin) {
    tiles.push(
      {
        href: '/admin/users',
        label: 'Users',
        value: summary.admin.users,
        note: `${count.format(summary.admin.invited)} yet to sign in`,
        icon: 'users',
      },
      {
        href: '/admin/offerings?status=active',
        label: 'Active offerings',
        value: summary.admin.activeOfferings,
        icon: 'offerings',
      },
      { href: '/catalog', label: 'Courses', value: summary.admin.courses, icon: 'catalog' },
      { href: '/admin/programs', label: 'Programmes', value: summary.admin.programs, icon: 'programmes' },
    );
  }
  // T10: every role sees its unread notifications.
  tiles.push({
    href: '/notifications',
    label: 'Notifications',
    value: unread,
    note: unread === 0 ? 'all caught up' : 'unread',
    icon: 'notifications',
  });
  return tiles;
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
    <section className="surface grid gap-4 p-4">
      {featured ? (
        <>
          <div className="flex items-start gap-4">
            <span className="grid w-16 shrink-0 justify-items-center gap-1">
              <PageIcon name="course" className="size-12" />
              <span className="text-muted-foreground max-w-full truncate text-[0.625rem] font-semibold tracking-wide">
                {featured.termCode}
              </span>
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
            <Badge variant={statusTone(featured.status)} className="capitalize">
              {featured.status}
            </Badge>
          </div>
        </>
      ) : (
        <div className="flex items-start gap-4">
          <span className="grid size-16 shrink-0 place-items-center">
            <PageIcon name="dashboard" className="size-16" />
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
            <Button asChild variant="outline">
              <Link href={`/courses/${featured.id}`}>
                Open course
                <LinkSpinner />
              </Link>
            </Button>
          )}
          {second && (
            <Button asChild className="justify-between">
              <Link href={second.href}>
                <span className="flex items-center gap-2.5">
                  <second.icon className="size-4" />
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

const ENTITY: Record<string, PageIconName> = {
  user: 'badge',
  user_import: 'users',
  course: 'catalog',
  offering: 'offerings',
  scheme: 'evaluation',
};

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
        <EmptyState text="Nothing has been recorded yet." icon={<PageIcon name="audit" />} />
      ) : (
        <ol className="grid gap-4">
          {recent.map((a) => {
            const mark = ENTITY[a.entity] ?? 'audit';
            return (
              <li key={a.id} className="flex items-center gap-3">
                <span className="bg-primary/10 grid size-14 shrink-0 place-items-center rounded-lg">
                  <PageIcon name={mark} className="size-11" />
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
        <span className="ring-border text-muted-foreground flex h-8 items-center gap-2 rounded-md px-3 text-sm ring-1">
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
                  'ring-border flex items-center gap-3 rounded-md p-2.5 ring-1',
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

// T10: up to five videos the student started and has not finished, most recently watched first.
// M03 T9 (A-70): today's live classes of the viewer's courses, the ones running now first with a way in.
function TodaysClasses({ rows, student }: { rows: TodayClass[]; student: boolean }) {
  const live = rows.filter((row) => row.status === 'live');
  const later = rows.filter((row) => row.status !== 'live');
  return (
    <section className="surface grid gap-4 p-5">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">Today&apos;s live classes</h2>
        <p className="text-muted-foreground text-sm">
          {live.length > 0
            ? `${live.length === 1 ? 'A class is' : `${live.length} classes are`} running now.`
            : student
              ? 'You can join from here once your teacher starts the class.'
              : 'Start each class from its page, up to 15 minutes early.'}
        </p>
      </div>
      <ul className="grid gap-2">
        {[...live, ...later].map((row) => (
          <li key={row.id}>
            {/* Everyone listed here may join; a running class opens in a tab of its own, like a video call (M03b). */}
            <Link
              href={`/courses/${row.offeringId}/live/${row.id}${row.status === 'live' ? '/room' : ''}`}
              target={row.status === 'live' ? '_blank' : undefined}
              className={cn(
                'surface-interactive group flex items-center gap-4 p-3',
                row.status === 'live' && 'ring-destructive/30 bg-destructive/[0.03]',
              )}
            >
              <span className="icon-chip size-10">
                <PageIcon name="live" className="size-8" />
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-medium">{row.title}</span>
                <span className="text-muted-foreground truncate text-xs">{row.offeringTitle}</span>
              </span>
              {row.status === 'live' ? (
                <Badge variant="danger">Join now</Badge>
              ) : (
                <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                  {formatTime(row.scheduledStart)}
                </span>
              )}
              <LinkSpinner />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ContinueLearning({ rows }: { rows: ContinueRow[] }) {
  return (
    <section className="surface grid gap-4 p-5">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">Continue learning</h2>
        <p className="text-muted-foreground text-sm">Pick up the videos you started where you left off.</p>
      </div>
      <ul className="grid gap-2">
        {rows.map((row) => (
          <li key={row.lessonId}>
            <Link
              href={`/courses/${row.offeringId}/content/${row.lessonId}`}
              className="surface-interactive group flex items-center gap-4 p-3"
            >
              <span className="icon-chip size-10">
                <PageIcon name="lesson" className="size-8" />
              </span>
              <span className="grid min-w-0 flex-1 gap-1.5">
                <span className="grid min-w-0">
                  <span className="truncate text-sm font-medium">{row.lessonTitle}</span>
                  <span className="text-muted-foreground truncate text-xs">{row.offeringTitle}</span>
                </span>
                <Progress
                  value={row.progressPct}
                  className="bg-muted h-1.5"
                  aria-label={`${Math.floor(row.progressPct)}% watched`}
                />
              </span>
              <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
                {Math.floor(row.progressPct)}%
              </span>
              <LinkSpinner />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// CRS-06, T10: active offerings the faculty member teaches without a published course plan.
// M04 decision 1 (A-105): open assessments closing within a week that the student has not handed in.
function DueSoon({ rows }: { rows: DueSoonRow[] }) {
  const now = new Date();
  return (
    <section className="surface grid gap-4 p-5">
      <div className="flex items-start gap-3">
        <PageIcon name="evaluation" className="size-10" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Due soon</h2>
          <p className="text-muted-foreground text-sm">Open now and closing within a week.</p>
        </div>
      </div>
      <ul className="grid gap-2">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/courses/${row.offeringId}/assessments/${row.id}`}
              className="surface-interactive group flex items-center gap-3 px-4 py-3"
            >
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-medium">{row.title}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {row.offeringTitle} · {row.started ? 'In progress' : 'Not started'}
                </span>
              </span>
              <span className="text-warning shrink-0 text-xs font-medium whitespace-nowrap">
                {formatDue(row.closesAt, now)}
              </span>
              <LinkSpinner />
              <CaretRightIcon className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// M04 decision 1: hand-ins waiting for marks in the classes the viewer teaches.
function ToGrade({ rows }: { rows: ToGradeRow[] }) {
  return (
    <section className="surface ring-warning/30 grid gap-4 p-5">
      <div className="flex items-start gap-3">
        <PageIcon name="badge" className="size-10" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">To grade</h2>
          <p className="text-muted-foreground text-sm">Hand-ins waiting for your marks.</p>
        </div>
      </div>
      <ul className="grid gap-2">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/courses/${row.offeringId}/assessments/${row.id}/grade?status=to_grade`}
              className="surface-interactive group flex items-center gap-3 px-4 py-3"
            >
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-medium">{row.title}</span>
                <span className="text-muted-foreground truncate text-xs">{row.offeringTitle}</span>
              </span>
              <span className="bg-warning/10 text-warning shrink-0 rounded-sm px-1.5 py-px text-xs font-semibold tabular-nums">
                {row.toGrade} to grade
              </span>
              <LinkSpinner />
              <CaretRightIcon className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlanRequests({ rows }: { rows: PlanRequestRow[] }) {
  return (
    <section className="surface ring-warning/30 grid gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="bg-warning/10 grid size-10 shrink-0 place-items-center rounded-md">
          <PageIcon name="plan" className="size-8" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Publish your course plan</h2>
          <p className="text-muted-foreground text-sm">
            {rows.length === 1 ? 'This course has started' : 'These courses have started'} without a published plan.
            Students receive it by email once you publish.
          </p>
        </div>
      </div>
      <ul className="grid gap-2">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/courses/${row.id}/plan`}
              className="surface-interactive group flex items-center gap-3 px-4 py-3"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.title}</span>
              <span className="text-primary flex shrink-0 items-center gap-1 text-sm font-medium">
                Write plan
                <LinkSpinner />
                <CaretRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
