import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BooksIcon,
  CalendarPlusIcon,
  CaretDownIcon,
  CaretRightIcon,
  ChartBarIcon,
  CheckIcon,
  ClipboardTextIcon,
  GearIcon,
  MagnifyingGlassIcon,
  MedalIcon,
  PlayCircleIcon,
  PlusIcon,
  UserCheckIcon,
  UserPlusIcon,
  UsersThreeIcon,
  VideoIcon,
} from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import Loading from './loading';
import { LinkSpinner } from '@/components/link-spinner';
import { OfferingCard } from '@/components/offering-card';
import { PageIcon, type PageIconName } from '@/components/page-icon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { requireViewer, type Viewer } from '@/lib/auth/session';
import { listDueSoon, listToGrade, type ToGradeRow } from '@/lib/data/assessments';
import { listContinueLearning, type ContinueRow } from '@/lib/data/content';
import { getHomeEngagement, type EngagementCourse } from '@/lib/data/engagement-views';
import { listTodaysLiveSessions, type TodayClass } from '@/lib/data/live';
import { unreadCount } from '@/lib/data/notifications';
import {
  getHomeSummary,
  listMyOfferings,
  listPlanRequests,
  type HomeSummary,
  type MyOfferingRow,
} from '@/lib/data/workspace';
import { cn } from '@/lib/cn';
import { OFFERING_NEEDS, type OfferingNeed } from '@/lib/schemas/structure';
import { formatDue, formatLongDate, formatPct, formatTime, NEED_LABEL } from '@/lib/format';

export const metadata: Metadata = { title: 'Dashboard' };

const count = new Intl.NumberFormat('en-IN');
const istHour = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hourCycle: 'h23' });
const DAY_MS = 86_400_000;
const SHOWN = 5;

type QuickAction = { label: string; icon: Icon; href: string } | { label: string; icon: Icon; pick: Pick[] };
type Pick = { label: string; href: string };
type Attention = {
  key: string;
  href: string;
  title: string;
  detail: string;
  tone: 'danger' | 'warning';
  badge: string;
};

export default function HomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Home />
    </Suspense>
  );
}

// Home redesign (mock-up B, Aniket's pick of 28 Oct 2026): quick actions, then what needs the viewer first and their
// courses on the left, today's classes and notifications on the right.
async function Home() {
  const viewer = await requireViewer();
  // M04b (TP-03): a candidate has only their tests.
  if (viewer.roles.every((role) => role === 'candidate')) redirect('/tests');
  const has = (role: Viewer['roles'][number]) => viewer.roles.includes(role);
  const [summary, offerings, continueLearning, planRequests, unread, today, dueSoon, toGrade, engagement] =
    await Promise.all([
      has('admin') || has('student') || has('faculty') ? getHomeSummary() : null,
      has('admin') || has('student') ? listMyOfferings(1, {}) : null,
      has('student') ? listContinueLearning() : [],
      has('faculty') ? listPlanRequests() : [],
      unreadCount(),
      has('student') || has('faculty') || has('hod') || has('admin') ? listTodaysLiveSessions() : [],
      has('student') ? listDueSoon() : [],
      has('faculty') ? listToGrade() : [],
      getHomeEngagement(),
    ]);
  const now = new Date();
  const teaching = engagement.teaching;
  const attention: Attention[] = [
    ...planRequests.map((row) => ({
      key: `plan-${row.id}`,
      href: `/courses/${row.id}/plan`,
      title: 'Publish your course plan',
      detail: `${row.title} · the course has started`,
      tone: 'danger' as const,
      badge: 'Overdue',
    })),
    ...dueSoon.map((row) => ({
      key: `due-${row.id}`,
      href: `/courses/${row.offeringId}/assessments/${row.id}`,
      title: row.title,
      detail: `${row.offeringTitle} · ${row.started ? 'in progress' : 'not started'}`,
      tone: row.closesAt.getTime() - now.getTime() < DAY_MS ? ('danger' as const) : ('warning' as const),
      badge: formatDue(row.closesAt, now),
    })),
    ...toGrade.map((row) => ({
      key: `grade-${row.id}`,
      href: `/courses/${row.offeringId}/assessments/${row.id}/grade?status=to_grade`,
      title: row.title,
      detail: row.offeringTitle,
      tone: 'warning' as const,
      badge: `${count.format(row.toGrade)} to grade`,
    })),
    ...teaching
      .filter((course) => course.low > 0)
      .map((course) => ({
        key: `low-${course.id}`,
        href: lowBand(course.id),
        title: 'Low engagement',
        detail: course.title,
        tone: 'warning' as const,
        badge: `${count.format(course.low)} ${course.low === 1 ? 'student' : 'students'}`,
      })),
  ].sort((a, b) => Number(b.tone === 'danger') - Number(a.tone === 'danger'));
  const greeting =
    Number(istHour.format(now)) < 12
      ? 'Good morning'
      : Number(istHour.format(now)) < 17
        ? 'Good afternoon'
        : 'Good evening';
  const actions = quickActions(viewer, { teaching, today, continueLearning });
  const tiles = summary ? kpis(summary, { teaching, toGrade, dueSoon: dueSoon.length }) : [];
  // Admins have nothing of their own to act on here; everyone else hears when they are caught up.
  const attends = has('student') || has('faculty') || has('hod');
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          <PageIcon name="dashboard" className="size-8" />
          {greeting}, {viewer.name.split(' ')[0]}
        </h1>
        <p className="text-muted-foreground text-[0.8125rem] lg:hidden">{formatLongDate(now)}</p>
      </div>
      {actions.length > 0 && <QuickActions actions={actions} />}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 gap-4">
          {tiles.length > 0 && <Tiles tiles={tiles} />}
          {(attends || attention.length > 0) && <NeedsAttention rows={attention} hod={has('hod')} />}
          {continueLearning.length > 0 && <ContinueLearning rows={continueLearning} />}
          {teaching.length > 0 && <YourCourses rows={teaching} />}
          {has('hod') && <DepartmentLow rows={engagement.department} />}
          {offerings && offerings.rows.length > 0 && (
            <OfferingList rows={offerings.rows.slice(0, 3)} total={offerings.total} admin={has('admin')} />
          )}
          {summary?.admin?.readiness && <Readiness readiness={summary.admin.readiness} />}
        </div>
        <div className="grid min-w-0 gap-4">
          {(attends || today.length > 0) && <Today rows={today} hod={has('hod') && !has('faculty')} />}
          <Notifications unread={unread} />
        </div>
      </div>
    </div>
  );
}

const lowBand = (offeringId: string) => `/courses/${offeringId}/people?band=low&status=active`;

// One row of a role's most common jobs, each to the page or dialog that does it (08 §6). A job inside a course asks
// which course when the viewer teaches several.
function quickActions(
  viewer: Viewer,
  {
    teaching,
    today,
    continueLearning,
  }: { teaching: EngagementCourse[]; today: TodayClass[]; continueLearning: ContinueRow[] },
): QuickAction[] {
  const actions: QuickAction[] = [];
  const inCourse = (label: string, icon: Icon, path: (id: string) => string): QuickAction | null =>
    teaching.length === 0
      ? null
      : teaching.length === 1
        ? { label, icon, href: path(teaching[0].id) }
        : { label, icon, pick: teaching.map((c) => ({ label: c.title, href: path(c.id) })) };
  if (viewer.roles.includes('faculty')) {
    const taught = new Set(teaching.map((c) => c.id));
    const mine = today.find((c) => c.join && taught.has(c.offeringId));
    actions.push(
      ...(mine
        ? [{ label: 'Mark attendance', icon: UserCheckIcon, href: `/courses/${mine.offeringId}/live/${mine.id}` }]
        : []),
      ...[
        inCourse('Schedule a class', CalendarPlusIcon, (id) => `/courses/${id}/live?new=schedule`),
        inCourse('New assessment', ClipboardTextIcon, (id) => `/courses/${id}/assessments?new=quiz`),
      ].flatMap((a) => (a ? [a] : [])),
    );
  }
  if (viewer.roles.includes('student')) {
    const next = today.find((c) => c.join && c.status === 'live') ?? today.find((c) => c.join);
    const resume = continueLearning[0];
    actions.push(
      ...(next
        ? [
            {
              label: next.status === 'live' ? 'Join the class' : 'Next class',
              icon: PlayCircleIcon,
              href: `/courses/${next.offeringId}/live/${next.id}`,
            },
          ]
        : []),
      ...(resume
        ? [
            {
              label: 'Continue lesson',
              icon: VideoIcon,
              href: `/courses/${resume.offeringId}/content/${resume.lessonId}`,
            },
          ]
        : []),
      { label: 'My results', icon: MedalIcon, href: '/results' },
    );
  }
  if (viewer.roles.includes('hod')) {
    actions.push(
      { label: 'Engagement report', icon: ChartBarIcon, href: '/reports/engagement' },
      { label: 'Continuous evaluation', icon: ClipboardTextIcon, href: '/reports/ce' },
      { label: 'Department courses', icon: BooksIcon, href: '/courses' },
    );
  }
  if (viewer.roles.some((r) => r === 'faculty' || r === 'hod')) {
    actions.push({ label: 'New meeting', icon: UsersThreeIcon, href: '/meetings?new=meeting' });
  }
  if (viewer.roles.includes('admin')) {
    actions.push(
      { label: 'Add users', icon: UserPlusIcon, href: '/admin/users?new=user' },
      { label: 'New offering', icon: PlusIcon, href: '/admin/offerings?new=offering' },
      { label: 'Settings', icon: GearIcon, href: '/admin/settings' },
    );
  } else if (viewer.roles.includes('support')) {
    actions.push({ label: 'Find a user', icon: MagnifyingGlassIcon, href: '/admin/users' });
  }
  return actions.filter((a, i) => actions.findIndex((b) => b.label === a.label) === i);
}

function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <nav aria-label="Quick actions" className="flex flex-wrap gap-2">
      {actions.map((a) =>
        'href' in a ? (
          <Button key={a.label} asChild variant="outline">
            <Link href={a.href}>
              <span className="grid *:col-start-1 *:row-start-1">
                <a.icon />
                <LinkSpinner className="bg-background" />
              </span>
              {a.label}
            </Link>
          </Button>
        ) : (
          <DropdownMenu key={a.label}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <a.icon />
                {a.label}
                <CaretDownIcon className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-w-80">
              <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">Which course?</DropdownMenuLabel>
              {a.pick.map((p) => (
                <DropdownMenuItem key={p.href} asChild>
                  <Link href={p.href} className="truncate">
                    {p.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      )}
    </nav>
  );
}

// A card of Home: a title and one line, an optional link on the right, then its rows.
function Card({
  title,
  description,
  more,
  children,
}: {
  title: string;
  description: string;
  more?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-3">
        <div className="min-w-0">
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
        {more && (
          <Link
            href={more.href}
            className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1 text-xs font-medium transition-colors"
          >
            {more.label}
            <LinkSpinner />
            <CaretRightIcon className="size-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

// Every row is one link, so the whole row is the tap target on a phone.
function Row({ href, children, target }: { href: string; children: ReactNode; target?: string }) {
  return (
    <li className="border-border/70 border-t">
      <Link
        href={href}
        target={target}
        className="hover:bg-muted/40 group flex min-h-13 items-center gap-3 px-4 py-2.5 transition-colors"
      >
        {children}
      </Link>
    </li>
  );
}

function RowText({ title, detail }: { title: ReactNode; detail: ReactNode }) {
  return (
    <span className="grid min-w-0 flex-1">
      <span className="line-clamp-2 text-[0.8125rem] font-medium sm:line-clamp-none sm:truncate">{title}</span>
      <span className="text-muted-foreground truncate text-xs">{detail}</span>
    </span>
  );
}

const Chevron = () => (
  <>
    <LinkSpinner />
    <CaretRightIcon className="text-muted-foreground/60 size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
  </>
);

function Dot({ tone, children }: { tone: 'danger' | 'warning' | 'success' | 'muted'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 text-xs font-medium whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current',
        tone === 'danger' && 'text-destructive',
        tone === 'warning' && 'text-warning',
        tone === 'success' && 'text-success',
        tone === 'muted' && 'text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}

function CaughtUp({ text }: { text: string }) {
  return (
    <div className="border-border/70 flex items-center gap-3 border-t px-4 py-5">
      <span className="bg-success/10 text-success grid size-8 shrink-0 place-items-center rounded-full">
        <CheckIcon className="size-4" weight="bold" />
      </span>
      <span className="grid text-[0.8125rem]">
        <span className="font-semibold">You&apos;re all caught up</span>
        <span className="text-muted-foreground">{text}</span>
      </span>
    </div>
  );
}

// The most urgent first: overdue and closing within a day, then the rest; five rows, the others behind "Show all".
function NeedsAttention({ rows, hod }: { rows: Attention[]; hod: boolean }) {
  const row = (r: Attention) => (
    <Row key={r.key} href={r.href}>
      <RowText title={r.title} detail={r.detail} />
      <Dot tone={r.tone}>{r.badge}</Dot>
      <Chevron />
    </Row>
  );
  return (
    <Card title="Needs attention" description="Most urgent first.">
      {rows.length === 0 ? (
        <CaughtUp text={hod ? 'Nothing in your department needs you right now.' : 'Nothing needs you right now.'} />
      ) : (
        <>
          <ul>{rows.slice(0, SHOWN).map(row)}</ul>
          {rows.length > SHOWN && (
            <details className="group/more">
              <summary className="border-border/70 text-muted-foreground hover:text-foreground cursor-pointer list-none border-t px-4 py-2.5 text-xs font-medium group-open/more:hidden">
                Show all {rows.length}
              </summary>
              <ul>{rows.slice(SHOWN).map(row)}</ul>
            </details>
          )}
        </>
      )}
    </Card>
  );
}

// M10 T7: the courses a teacher teaches now, each with how many students last night's scores put in the low band.
function YourCourses({ rows }: { rows: EngagementCourse[] }) {
  return (
    <Card
      title="Your courses"
      description="Active this term, with last night's engagement."
      more={{ href: '/courses', label: 'All courses' }}
    >
      <ul>
        {rows.slice(0, SHOWN).map((c) => (
          <Row key={c.id} href={c.low > 0 ? lowBand(c.id) : `/courses/${c.id}`}>
            <RowText title={c.title} detail={`${count.format(c.students)} active students`} />
            {c.scored === 0 ? (
              <Dot tone="muted">No scores yet</Dot>
            ) : c.low > 0 ? (
              <Dot tone="danger">{count.format(c.low)} low engagement</Dot>
            ) : (
              <Dot tone="success">No one low</Dot>
            )}
            <Chevron />
          </Row>
        ))}
      </ul>
    </Card>
  );
}

// M10 T7: a head of department's five courses with the most students in the low band.
function DepartmentLow({ rows }: { rows: EngagementCourse[] }) {
  return (
    <Card
      title="Most students with low engagement"
      description="Your department's courses, from last night's scores."
      more={{ href: '/reports/engagement', label: 'Engagement report' }}
    >
      {rows.length === 0 ? (
        <CaughtUp text="No student in your department's courses is in the low band." />
      ) : (
        <ul>
          {rows.map((c) => (
            <Row key={c.id} href={lowBand(c.id)}>
              <RowText title={c.title} detail={`${count.format(c.students)} active students`} />
              <Dot tone="danger">{count.format(c.low)} low engagement</Dot>
              <Chevron />
            </Row>
          ))}
        </ul>
      )}
    </Card>
  );
}

// T10: up to five videos the student started and has not finished, most recently watched first.
function ContinueLearning({ rows }: { rows: ContinueRow[] }) {
  return (
    <Card title="Continue learning" description="Pick up the videos you started where you left off.">
      <ul>
        {rows.map((row) => (
          <Row key={row.lessonId} href={`/courses/${row.offeringId}/content/${row.lessonId}`}>
            <RowText title={row.lessonTitle} detail={row.offeringTitle} />
            <Progress
              value={row.progressPct}
              className="bg-muted h-1.5 w-20 max-sm:hidden"
              aria-label={`${Math.floor(row.progressPct)}% watched`}
            />
            <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">
              {Math.floor(row.progressPct)}%
            </span>
            <Chevron />
          </Row>
        ))}
      </ul>
    </Card>
  );
}

// A student's courses with their lesson progress, or an admin's newest offerings, as the course cards of /courses.
function OfferingList({ rows, total, admin }: { rows: MyOfferingRow[]; total: number; admin: boolean }) {
  return (
    <Card
      title={admin ? 'Newest offerings' : 'Your courses'}
      description={`${count.format(total)} in total, newest first.`}
      more={{ href: '/courses', label: 'View all' }}
    >
      <ul className="border-border/70 grid gap-4 border-t p-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((o) => (
          <li key={o.id}>
            <OfferingCard offering={o} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

// M03 T9 (A-70): today's live classes, the running ones first. Joining opens the room in its own tab, like a video
// call (M03b); a head of department opens the class's page, as they only look (09 §2).
function Today({ rows, hod }: { rows: TodayClass[]; hod: boolean }) {
  const ordered = [...rows.filter((r) => r.status === 'live'), ...rows.filter((r) => r.status !== 'live')];
  return (
    <Card title="Today" description={hod ? "Live classes in your department's courses." : 'Your live classes today.'}>
      {ordered.length === 0 ? (
        <p className="border-border/70 text-muted-foreground border-t px-4 py-5 text-[0.8125rem]">
          No live classes today.
        </p>
      ) : (
        <ul>
          {ordered.map((row) => {
            const live = row.status === 'live';
            const room = live && row.join;
            return (
              <Row
                key={row.id}
                href={`/courses/${row.offeringId}/live/${row.id}${room ? '/room' : ''}`}
                target={room ? '_blank' : undefined}
              >
                <span
                  className={cn(
                    'w-16 shrink-0 text-xs tabular-nums',
                    live ? 'text-destructive font-semibold' : 'text-muted-foreground',
                  )}
                >
                  {live ? <Dot tone="danger">Now</Dot> : formatTime(row.scheduledStart)}
                </span>
                <RowText
                  title={row.title}
                  detail={`${row.offeringTitle} · ${formatTime(row.scheduledStart)}–${formatTime(row.scheduledEnd)}`}
                />
                {room ? (
                  <span className="bg-foreground text-background shrink-0 rounded-sm px-2.5 py-1 text-xs font-semibold">
                    Join
                  </span>
                ) : (
                  <Chevron />
                )}
              </Row>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Notifications({ unread }: { unread: number }) {
  return (
    <section className="surface overflow-hidden">
      <ul>
        <li>
          <Link
            href="/notifications"
            className="hover:bg-muted/40 group flex min-h-13 items-center gap-3 px-4 py-2.5 transition-colors"
          >
            <PageIcon name="notifications" className="size-7" />
            <RowText title="Notifications" detail={unread === 0 ? 'All caught up' : `${count.format(unread)} unread`} />
            {unread > 0 && (
              <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[0.6875rem] font-semibold tabular-nums">
                {count.format(unread)}
              </span>
            )}
            <Chevron />
          </Link>
        </li>
      </ul>
    </section>
  );
}

type Tile = { href?: string; label: string; value: string; note?: string; icon: PageIconName };

// The viewer's four headline numbers (08 §6): an admin's platform, a teacher's classes, a student's own study.
function kpis(
  summary: HomeSummary,
  { teaching, toGrade, dueSoon }: { teaching: EngagementCourse[]; toGrade: ToGradeRow[]; dueSoon: number },
): Tile[] {
  if (summary.admin) {
    const admin = summary.admin;
    return [
      {
        href: '/admin/users',
        label: 'Users',
        value: count.format(admin.users),
        note: `${count.format(admin.invited)} yet to sign in`,
        icon: 'users',
      },
      {
        href: '/admin/offerings?status=active',
        label: 'Active offerings',
        value: count.format(admin.activeOfferings),
        icon: 'offerings',
      },
      { href: '/catalog', label: 'Courses', value: count.format(admin.courses), icon: 'catalog' },
      { href: '/admin/programs', label: 'Programmes', value: count.format(admin.programs), icon: 'programmes' },
    ];
  }
  if (summary.toGrade !== null) {
    const low = teaching.reduce((sum, c) => sum + c.low, 0);
    const lowest = [...teaching].sort((a, b) => b.low - a.low)[0];
    return [
      {
        href: '/courses',
        label: 'Teaching',
        value: count.format(teaching.length),
        note: 'active courses',
        icon: 'course',
      },
      {
        label: 'Students',
        value: count.format(teaching.reduce((sum, c) => sum + c.students, 0)),
        note: 'in your courses',
        icon: 'people',
      },
      {
        href: toGrade[0]
          ? `/courses/${toGrade[0].offeringId}/assessments/${toGrade[0].id}/grade?status=to_grade`
          : undefined,
        label: 'To grade',
        value: count.format(summary.toGrade),
        note: 'awaiting marks',
        icon: 'evaluation',
      },
      {
        href: lowest && lowest.low > 0 ? lowBand(lowest.id) : undefined,
        label: 'Disengaged',
        value: count.format(low),
        note: teaching.some((c) => c.scored > 0) ? 'as of last night' : 'scored nightly',
        icon: 'chart',
      },
    ];
  }
  if (summary.student) {
    const s = summary.student;
    return [
      { href: '/courses', label: 'Courses', value: count.format(s.courses), note: 'active this term', icon: 'course' },
      {
        label: 'Attendance',
        value: s.held === 0 ? '—' : formatPct(Math.round((100 * s.attended) / s.held)),
        note: s.held === 0 ? 'no live class yet' : `${count.format(s.attended)} of ${count.format(s.held)} classes`,
        icon: 'attendance',
      },
      {
        label: 'Lessons done',
        value: count.format(s.completed),
        note: `of ${count.format(s.published)} published`,
        icon: 'lessons',
      },
      {
        label: 'Due this week',
        value: count.format(dueSoon),
        note: 'closing soon',
        icon: 'assignment',
      },
    ];
  }
  return [];
}

function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => {
        const body = (
          <>
            <span className="icon-chip size-10 shrink-0">
              <PageIcon name={t.icon} className="size-8" />
            </span>
            <span className="grid min-w-0">
              <span className="text-muted-foreground truncate text-xs">{t.label}</span>
              <span className="text-lg leading-tight font-semibold tabular-nums">{t.value}</span>
              {t.note && <span className="text-muted-foreground truncate text-[0.6875rem]">{t.note}</span>}
            </span>
          </>
        );
        return (
          <li key={t.label}>
            {t.href ? (
              <Link href={t.href} className="surface-interactive relative flex h-full items-center gap-3 p-3.5">
                {body}
                <LinkSpinner className="absolute top-3 right-3" />
              </Link>
            ) : (
              <div className="surface flex h-full items-center gap-3 p-3.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const NEED_TONE: Record<OfferingNeed, string> = {
  draft: 'bg-muted-foreground/30',
  no_teacher: 'bg-destructive',
  no_students: 'bg-warning',
  no_plan: 'bg-gold',
  ready: 'bg-success',
};

// The current term's offerings by what each still needs, each counted once by its first gap; every bar opens them.
function Readiness({ readiness }: { readiness: NonNullable<NonNullable<HomeSummary['admin']>['readiness']> }) {
  const { term, counts } = readiness;
  const total = OFFERING_NEEDS.reduce((sum, need) => sum + counts[need], 0);
  const top = Math.max(1, ...OFFERING_NEEDS.map((need) => counts[need]));
  return (
    <Card
      title={`Offerings in ${term.code}`}
      description={
        total === 0
          ? 'No offering in this term yet.'
          : `${count.format(counts.ready)} of ${count.format(total)} ready. Each is counted once, by the first thing it still needs.`
      }
      more={{ href: `/admin/offerings?term=${term.id}`, label: 'All offerings' }}
    >
      <ul>
        {OFFERING_NEEDS.map((need) => (
          <Row key={need} href={`/admin/offerings?term=${term.id}&need=${need}`}>
            <span className="w-28 shrink-0 text-[0.8125rem] font-medium">{NEED_LABEL[need]}</span>
            <span className="bg-muted relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full">
              <span
                className={cn('absolute inset-y-0 left-0 rounded-full', NEED_TONE[need])}
                style={{ width: `${(counts[need] / top) * 100}%` }}
              />
            </span>
            <span className="w-10 text-right text-[0.8125rem] font-semibold tabular-nums">
              {count.format(counts[need])}
            </span>
            <Chevron />
          </Row>
        ))}
      </ul>
    </Card>
  );
}
