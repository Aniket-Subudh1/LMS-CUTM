import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react/ssr';
import { z } from 'zod';
import Loading from '../../../loading';
import {
  addPlanSession,
  deletePlanSession,
  fillCalendarFromCourse,
  publishPlan,
  savePlan,
  updatePlanSession,
} from './actions';
import { ActionForm, Field, FieldErrors } from '@/components/action-form';
import { EmptyState } from '@/components/data-table';
import { DateTile } from '@/components/date-tile';
import { FormDialog } from '@/components/form-dialog';
import { PageIcon } from '@/components/page-icon';
import { RichTextEditor } from '@/components/rich-text-editor';
import { RichTextView } from '@/components/rich-text-view';
import { RowMenu } from '@/components/row-menu';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { getPlanView, type CalendarRow, type CoursePlan } from '@/lib/data/workspace';
import { istDateToDate, istWeekStart } from '@/lib/domain/time';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { SESSION_KINDS } from '@/lib/schemas/structure';

export const metadata: Metadata = { title: 'Course plan' };

const KIND: Record<(typeof SESSION_KINDS)[number], { label: string; tone: string }> = {
  theory: { label: 'Theory', tone: 'bg-primary/10 text-primary' },
  practice: { label: 'Practice', tone: 'bg-teal/10 text-teal' },
  project: { label: 'Project', tone: 'bg-gold/15 text-foreground' },
};
// Monday to Saturday, numbered as Date.getDay() does (classDates, 07 §11).
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const shortDay = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
const WEEK_MS = 7 * 86_400_000;

const Search = z.object({ new: z.string().max(60).optional().catch(undefined) });

export default function PlanPage({ params, searchParams }: PageProps<'/courses/[offeringId]/plan'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Plan params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// Design "Course plan A" (17 Oct 2026): the plan text beside the sessions, grouped by week; each session is added
// and edited in its own dialog. Teachers and admins edit; everyone else reads.
async function Plan({
  params,
  searchParams,
}: {
  params: PageProps<'/courses/[offeringId]/plan'>['params'];
  searchParams: PageProps<'/courses/[offeringId]/plan'>['searchParams'];
}) {
  const { offeringId } = await params;
  const open = Search.parse(await searchParams).new;
  const { plan, canTeach } = await getPlanView(offeringId);
  if (!plan) {
    return (
      <EmptyState
        icon={<PageIcon name="plan" />}
        text="Your teacher has not published the course plan yet. You will get a notification and an email when they do."
      />
    );
  }
  const editing = plan.calendar.find((row) => open === `session-${row.id}`);
  return (
    <div className="grid gap-4">
      {canTeach && <PublishBar plan={plan} />}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Section
          icon={<PageIcon name="plan" />}
          title="How the course will run"
          description="Teaching approach, assessment and what you expect of students."
          action={canTeach && <PlanDocDialog plan={plan} />}
        >
          {plan.doc ? (
            <RichTextView doc={plan.doc} />
          ) : (
            <p className="text-muted-foreground text-sm">
              {canTeach ? 'Not written yet. Use Edit to write it.' : 'Not written yet.'}
            </p>
          )}
        </Section>
        <Section
          icon={<PageIcon name="session" />}
          title="Sessions"
          description={
            plan.calendar.length === 0
              ? 'No sessions yet.'
              : `${plan.calendar.length} session${plan.calendar.length === 1 ? '' : 's'} · ${plan.calendar.filter((r) => r.past).length} done · dates keep them in order.`
          }
          action={
            canTeach && (
              <div className="flex flex-wrap gap-2">
                {plan.sessionPlan > 0 && <FillDialog plan={plan} />}
                <SessionDialog plan={plan} />
              </div>
            )
          }
        >
          <Sessions plan={plan} canTeach={canTeach} />
        </Section>
      </div>
      {canTeach && editing && <SessionDialog key={open} plan={plan} row={editing} />}
    </div>
  );
}

function PublishBar({ plan }: { plan: CoursePlan }) {
  const ready = Boolean(plan.doc) && plan.calendar.length > 0;
  const changed = plan.publishedAt && plan.changedAt && plan.changedAt > plan.publishedAt;
  if (plan.publishedAt && !changed) {
    return (
      <p className="text-muted-foreground text-[0.8125rem]">
        Version {plan.version} was published {formatDate(plan.publishedAt)}. Students see the plan as it is saved.
      </p>
    );
  }
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-md px-4 py-3 text-[0.8125rem] ring-1',
        changed ? 'bg-gold/10 ring-gold/30' : 'bg-card ring-border',
      )}
    >
      <WarningCircleIcon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        {changed ? (
          <>
            <b className="font-semibold">Changed since version {plan.version}</b> (published{' '}
            {formatDate(plan.publishedAt ?? new Date())}). Publish version {plan.version + 1} to notify and email the{' '}
            {plan.students} students.
          </>
        ) : ready ? (
          <>
            <b className="font-semibold">Not published yet.</b> Students see the plan once you publish it; they get a
            notification and an email.
          </>
        ) : (
          <>
            <b className="font-semibold">Not published yet.</b> Write the plan and add at least one session, then
            publish it.
          </>
        )}
      </span>
      {ready && (
        <ActionForm
          action={publishPlan}
          submitLabel={plan.publishedAt ? `Publish version ${plan.version + 1}` : 'Publish plan'}
          submitIcon={<PaperPlaneTiltIcon />}
          successMessage="Published. Students are being notified."
          confirm={{
            title: plan.publishedAt ? `Publish version ${plan.version + 1}?` : 'Publish the course plan?',
            message: `Every enrolled student (${plan.students}) gets a notification and an email with the plan, the sessions, the syllabus and the course outcomes.`,
          }}
        >
          <input type="hidden" name="offeringId" value={plan.offeringId} />
          <input type="hidden" name="version" value={plan.version} />
        </ActionForm>
      )}
    </div>
  );
}

function Sessions({ plan, canTeach }: { plan: CoursePlan; canTeach: boolean }) {
  if (plan.calendar.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed px-4 py-8 text-center text-sm">
        {canTeach
          ? 'Add the first session, or fill them from the course’s session plan.'
          : 'No sessions have been scheduled yet.'}
      </p>
    );
  }
  const next = plan.calendar.find((row) => !row.past);
  const codes = new Map(plan.cos.map((co) => [co.id, co.code]));
  const firstWeek = istDateToDate(istWeekStart(plan.calendar[0].day)).getTime();
  const weeks = Map.groupBy(plan.calendar, (row) => istWeekStart(row.day));
  return (
    <div className="grid gap-1">
      {[...weeks].map(([monday, rows]) => {
        const start = istDateToDate(monday);
        const number = Math.round((start.getTime() - firstWeek) / WEEK_MS) + 1;
        return (
          <section key={monday} className="grid gap-0.5">
            <h3 className="text-muted-foreground border-b pt-3 pb-1.5 text-[0.6875rem] font-medium tracking-wide uppercase first:pt-0">
              Week {number} · {shortDay.format(start)} – {shortDay.format(new Date(start.getTime() + 5 * 86_400_000))}
            </h3>
            <ol className="grid">
              {rows.map((row) => (
                <SessionRow
                  key={row.id}
                  row={row}
                  index={plan.calendar.indexOf(row)}
                  next={row === next}
                  codes={codes}
                  plan={plan}
                  canTeach={canTeach}
                />
              ))}
            </ol>
          </section>
        );
      })}
      {canTeach && (
        <Link
          href="?new=session"
          scroll={false}
          className="text-muted-foreground hover:text-foreground mt-2 flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm transition-colors"
        >
          <PlusIcon className="size-4" /> Add a session
        </Link>
      )}
    </div>
  );
}

function SessionRow({
  row,
  index,
  next,
  codes,
  plan,
  canTeach,
}: {
  row: CalendarRow;
  index: number;
  next: boolean;
  codes: Map<string, string>;
  plan: CoursePlan;
  canTeach: boolean;
}) {
  return (
    <li
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-md px-1.5 py-2',
        next && 'bg-muted/70',
        row.past && 'opacity-60',
      )}
    >
      <DateTile date={row.date} tone={row.past ? 'past' : 'plan'} className="size-11" />
      <div className="grid min-w-0 flex-1 gap-1">
        <span className="flex min-w-0 items-baseline gap-2 text-[0.8125rem] font-medium">
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{index + 1}</span>
          <span className="truncate">{row.topic}</span>
          {next && <span className="text-primary shrink-0 text-xs font-semibold">Next</span>}
        </span>
        {(row.coIds.length > 0 || row.kind) && (
          <span className="flex flex-wrap items-center gap-1">
            {row.coIds.map((id) => (
              <span key={id} className="bg-primary/10 text-primary rounded-sm px-1.5 text-[0.6875rem] font-semibold">
                {codes.get(id)}
              </span>
            ))}
            {row.kind && (
              <span className={cn('rounded-sm px-1.5 text-[0.6875rem] font-medium', KIND[row.kind].tone)}>
                {KIND[row.kind].label}
              </span>
            )}
          </span>
        )}
      </div>
      {canTeach && (
        <RowMenu
          label={row.topic}
          items={[
            { kind: 'link', label: 'Edit session', href: `?new=session-${row.id}`, icon: <PencilSimpleIcon /> },
            { kind: 'separator' },
            {
              kind: 'action',
              label: 'Delete session',
              icon: <TrashIcon />,
              destructive: true,
              action: deletePlanSession,
              fields: { offeringId: plan.offeringId, rowId: row.id },
              confirm: {
                title: `Delete “${row.topic}”?`,
                message: 'The session is removed from the plan. Publish again to tell students.',
                confirmLabel: 'Delete session',
                destructive: true,
              },
            },
          ]}
        />
      )}
    </li>
  );
}

function PlanDocDialog({ plan }: { plan: CoursePlan }) {
  return (
    <FormDialog
      openParam="plan-doc"
      trigger={
        <Button variant="outline" size="sm">
          <PencilSimpleIcon /> Edit
        </Button>
      }
      size="wide"
      icon={<PencilSimpleIcon weight="duotone" />}
      title="How the course will run"
      description="How you teach it, how students are assessed and what you expect of them."
      action={savePlan}
      submitLabel="Save"
      successMessage="Plan saved."
    >
      <input type="hidden" name="offeringId" value={plan.offeringId} />
      <div className="grid gap-2">
        <RichTextEditor
          name="doc"
          initial={plan.doc}
          placeholder="For example: two lectures and one lab a week; a quiz after each unit; the project is due in week 12…"
        />
        <FieldErrors name="doc" />
      </div>
    </FormDialog>
  );
}

// Add (no row) or edit one session; the edit dialog is mounted only while ?new=session-<id> is in the URL.
function SessionDialog({ plan, row }: { plan: CoursePlan; row?: CalendarRow }) {
  return (
    <FormDialog
      openParam={row ? `session-${row.id}` : 'session'}
      trigger={
        row ? undefined : (
          <Button size="sm">
            <PlusIcon /> Add session
          </Button>
        )
      }
      icon={<PageIcon name="session" />}
      title={row ? 'Edit session' : 'Add a session'}
      description="Sessions are kept in date order. Students see changes once you publish the plan again."
      action={row ? updatePlanSession : addPlanSession}
      submitLabel={row ? 'Save' : 'Add session'}
      successMessage={row ? 'Session saved.' : 'Session added.'}
    >
      <input type="hidden" name="offeringId" value={plan.offeringId} />
      {row && <input type="hidden" name="rowId" value={row.id} />}
      <div className="grid gap-5 sm:grid-cols-[11rem_1fr]">
        <Field name="date" label="Date">
          <Input type="date" name="date" defaultValue={row?.day} required />
        </Field>
        <Field name="kind" label="Kind (optional)">
          <NativeSelect name="kind" defaultValue={row?.kind ?? ''}>
            <NativeSelectOption value="">Not set</NativeSelectOption>
            {SESSION_KINDS.map((kind) => (
              <NativeSelectOption key={kind} value={kind}>
                {KIND[kind].label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field name="topic" label="Topic">
        <Input name="topic" defaultValue={row?.topic} maxLength={200} required placeholder="Simple linear regression" />
      </Field>
      {plan.cos.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">Course outcomes it covers (optional)</legend>
          <div className="flex flex-wrap gap-1.5">
            {plan.cos.map((co) => (
              <label
                key={co.id}
                title={co.statement}
                className="ring-border has-checked:bg-foreground has-checked:text-background has-checked:ring-foreground has-focus-visible:ring-ring cursor-pointer rounded-sm px-2 py-1 text-xs font-medium ring-1 transition-colors"
              >
                <input
                  type="checkbox"
                  name="cos[]"
                  value={co.id}
                  defaultChecked={row?.coIds.includes(co.id)}
                  className="sr-only"
                />
                {co.code}
              </label>
            ))}
          </div>
          <FieldErrors name="cos[]" />
        </fieldset>
      )}
    </FormDialog>
  );
}

// M01b: the catalogue course's session plan, dated from the first class on the weekdays classes are held.
function FillDialog({ plan }: { plan: CoursePlan }) {
  return (
    <FormDialog
      openParam="fill"
      trigger={
        <Button variant="outline" size="sm">
          <SparkleIcon /> Fill from the session plan
        </Button>
      }
      icon={<SparkleIcon weight="duotone" />}
      title="Fill from the course’s session plan"
      description={`The course has ${plan.sessionPlan} sessions in order. Choose the first class and the days you teach, and they are dated for you. Edit any of them afterwards.`}
      action={fillCalendarFromCourse}
      submitLabel="Fill sessions"
      successMessage="Sessions filled."
    >
      <input type="hidden" name="offeringId" value={plan.offeringId} />
      <Field name="firstDay" label="First class">
        <Input type="date" name="firstDay" required className="w-44" />
      </Field>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Class days</legend>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((day, i) => (
            <label
              key={day}
              className="ring-border has-checked:bg-foreground has-checked:text-background has-checked:ring-foreground cursor-pointer rounded-sm px-2.5 py-1 text-sm ring-1 transition-colors"
            >
              <input type="checkbox" name="weekdays[]" value={i + 1} className="sr-only" />
              {day}
            </label>
          ))}
        </div>
        <FieldErrors name="weekdays[]" />
      </fieldset>
      {plan.calendar.length > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="replace" value="true" className="accent-destructive size-4" />
          Replace the {plan.calendar.length} sessions already in the plan
        </label>
      )}
      <FieldErrors name="replace" />
    </FormDialog>
  );
}
