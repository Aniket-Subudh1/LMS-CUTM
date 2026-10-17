import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import { CheckIcon, PaperPlaneTiltIcon, WarningCircleIcon } from '@phosphor-icons/react/ssr';
import Loading from '../../../loading';
import { fillCalendarFromCourse, publishPlan, saveCalendar, savePlan } from './actions';
import { ActionForm, FieldErrors } from '@/components/action-form';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { RichTextEditor } from '@/components/rich-text-editor';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { getPlanEditor, type CoursePlan } from '@/lib/data/workspace';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Course plan' };

// T7: the form shows the saved sessions plus this many empty rows; saving shows ten fresh ones.
const BLANK_ROWS = 10;
const MAX_ROWS = 200;

export default function PlanPage({ params }: PageProps<'/courses/[offeringId]/plan'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Plan params={params} />
    </Suspense>
  );
}

async function Plan({ params }: { params: PageProps<'/courses/[offeringId]/plan'>['params'] }) {
  const plan = await getPlanEditor((await params).offeringId);
  const ready = Boolean(plan.doc) && plan.calendar.length > 0;
  return (
    <>
      <PageHeader
        icon={<PageIcon name="plan" />}
        title="Course plan"
        description="Three steps: write the plan, schedule the sessions, then publish. Students see the plan once you publish it."
        actions={
          plan.publishedAt ? (
            <Badge variant="success">
              Version {plan.version} published {formatDate(plan.publishedAt)}
            </Badge>
          ) : (
            <Badge variant="secondary">Not published yet</Badge>
          )
        }
      />
      <ol className="grid gap-6">
        <Step
          n={1}
          id="plan"
          done={Boolean(plan.doc)}
          title="Write the course plan"
          description="How the course will run: how you teach it, how students are assessed and what you expect of them."
        >
          <ActionForm action={savePlan} submitLabel="Save plan" successMessage="Plan saved.">
            <input type="hidden" name="offeringId" value={plan.offeringId} />
            <div className="grid gap-2">
              <RichTextEditor
                name="doc"
                initial={plan.doc}
                placeholder="For example: two lectures and one lab a week; a quiz after each unit; the project is due in week 12…"
              />
              <FieldErrors name="doc" />
            </div>
          </ActionForm>
        </Step>

        <Step
          n={2}
          id="calendar"
          done={plan.calendar.length > 0}
          title="Schedule the sessions"
          description="One row per class: its date, its topic and the course outcomes it covers. Rows are sorted by date when you save."
        >
          {plan.sessionPlan > 0 && <FromSessionPlan plan={plan} />}
          <Calendar plan={plan} />
        </Step>

        <Step
          n={3}
          id="publish"
          done={Boolean(plan.publishedAt)}
          title="Publish to students"
          description={
            plan.publishedAt
              ? 'Students already see your saved plan. Publish again after a change to notify and email them the new version.'
              : 'Students get a notification and an email with the calendar, syllabus, objectives and outcomes.'
          }
        >
          <div className="ring-border/80 flex flex-wrap items-center justify-between gap-4 rounded-xl px-4 py-3 ring-1">
            <ul className="grid gap-1.5 text-sm">
              <Check ok={Boolean(plan.doc)}>Plan written</Check>
              <Check ok={plan.calendar.length > 0}>
                {plan.calendar.length > 0
                  ? `${plan.calendar.length} sessions scheduled`
                  : 'At least one session scheduled'}
              </Check>
              <li className="text-muted-foreground">
                {plan.students === 0
                  ? 'No students are enrolled yet, so nobody will be emailed.'
                  : `${plan.students} enrolled student${plan.students === 1 ? '' : 's'} will be emailed.`}
              </li>
            </ul>
            {ready ? (
              <ActionForm
                action={publishPlan}
                submitLabel={plan.publishedAt ? `Publish version ${plan.version + 1}` : 'Publish plan'}
                submitIcon={<PaperPlaneTiltIcon />}
                successMessage="Published. Students are being notified."
                confirm={{
                  title: plan.publishedAt ? `Publish version ${plan.version + 1}?` : 'Publish the course plan?',
                  message: `Every enrolled student (${plan.students}) gets a notification and an email with the plan, the calendar, the syllabus and the course outcomes.`,
                }}
              >
                <input type="hidden" name="offeringId" value={plan.offeringId} />
                <input type="hidden" name="version" value={plan.version} />
              </ActionForm>
            ) : (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <WarningCircleIcon className="size-4" />
                Finish steps 1 and 2 first.
              </p>
            )}
          </div>
        </Step>
      </ol>
    </>
  );
}

function Step({
  n,
  id,
  done,
  title,
  description,
  children,
}: {
  n: number;
  id: string;
  done: boolean;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <li id={id} className="surface grid scroll-mt-24 gap-5 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold',
            done ? 'bg-success text-white' : 'bg-primary/10 text-primary ring-primary/20 ring-1',
          )}
        >
          {done ? <CheckIcon weight="bold" className="size-4" /> : n}
          <span className="sr-only">{done ? `Step ${n}, done` : `Step ${n}`}</span>
        </span>
        <div className="grid min-w-0 gap-0.5">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </div>
      {children}
    </li>
  );
}

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={cn('flex items-center gap-2', !ok && 'text-muted-foreground')}>
      <span
        className={cn(
          'grid size-4 place-items-center rounded-full',
          ok ? 'bg-success text-white' : 'ring-border ring-1',
        )}
      >
        {ok && <CheckIcon weight="bold" className="size-2.5" />}
      </span>
      {children}
    </li>
  );
}

// Monday to Saturday, numbered as Date.getDay() does (classDates, 07 §11).
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// M01b: the catalogue course's session plan, dated from the first class on the weekdays classes are held.
function FromSessionPlan({ plan }: { plan: CoursePlan }) {
  return (
    <div className="bg-primary/4 ring-primary/20 mb-4 grid gap-3 rounded-xl p-4 ring-1">
      <div>
        <p className="text-sm font-medium">Start from the course&apos;s session plan</p>
        <p className="text-muted-foreground text-sm">
          The course has {plan.sessionPlan} sessions in order. Choose the first class and the days you teach, and they
          are dated for you; then adjust any row below.
        </p>
      </div>
      <ActionForm action={fillCalendarFromCourse} submitLabel="Fill sessions" successMessage="Sessions filled.">
        <input type="hidden" name="offeringId" value={plan.offeringId} />
        <div className="flex flex-wrap items-end gap-4">
          <label className="grid gap-1.5 text-sm font-medium">
            First class
            <Input type="date" name="firstDay" required className="w-44" />
            <FieldErrors name="firstDay" />
          </label>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Class days</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day, i) => (
                <label
                  key={day}
                  className="ring-border has-checked:bg-primary has-checked:text-primary-foreground has-checked:ring-primary cursor-pointer rounded-md px-2.5 py-1 text-sm ring-1 transition-colors"
                >
                  <input type="checkbox" name="weekdays[]" value={i + 1} className="sr-only" />
                  {day}
                </label>
              ))}
            </div>
            <FieldErrors name="weekdays[]" />
          </fieldset>
        </div>
        {plan.calendar.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="replace" value="true" className="accent-destructive size-4" />
            Replace the {plan.calendar.length} sessions already scheduled
          </label>
        )}
        <FieldErrors name="replace" />
      </ActionForm>
    </div>
  );
}

function Calendar({ plan }: { plan: CoursePlan }) {
  const blanks = Math.min(BLANK_ROWS, MAX_ROWS - plan.calendar.length);
  const rows = [
    ...plan.calendar.map((row) => ({ key: row.id, date: row.day, topic: row.topic, coIds: row.coIds })),
    ...Array.from({ length: blanks }, (_, i) => ({ key: `new-${i}`, date: '', topic: '', coIds: [] as string[] })),
  ];
  return (
    <ActionForm action={saveCalendar} submitLabel="Save sessions" successMessage="Sessions saved.">
      <input type="hidden" name="offeringId" value={plan.offeringId} />
      <input type="hidden" name="rows" value={rows.length} />
      <div className="grid gap-2">
        <div className="text-muted-foreground hidden grid-cols-[2rem_11rem_minmax(0,1fr)] gap-3 px-3 text-xs font-medium sm:grid">
          <span>#</span>
          <span>Date</span>
          <span>Topic{plan.cos.length > 0 && ' and outcomes'}</span>
        </div>
        {rows.map((row, i) => (
          <div
            key={row.key}
            className={cn(
              'group/session grid gap-x-3 gap-y-2 rounded-xl px-3 py-2.5 ring-1 sm:grid-cols-[2rem_11rem_minmax(0,1fr)] sm:items-start',
              row.topic ? 'ring-border/80' : 'ring-border/50 bg-background/50',
            )}
          >
            <span className="text-muted-foreground pt-2 text-xs tabular-nums max-sm:hidden">{i + 1}</span>
            <label className="grid gap-1">
              <span className="text-muted-foreground text-xs sm:sr-only">Date</span>
              <Input type="date" name={`date_${i}`} defaultValue={row.date} aria-label={`Session ${i + 1} date`} />
              <FieldErrors name={`date_${i}`} />
            </label>
            <div className="grid min-w-0 gap-2">
              <label className="grid gap-1">
                <span className="text-muted-foreground text-xs sm:sr-only">Topic</span>
                <Input
                  name={`topic_${i}`}
                  defaultValue={row.topic}
                  maxLength={200}
                  placeholder="Add a session topic"
                  aria-label={`Session ${i + 1} topic`}
                />
                <FieldErrors name={`topic_${i}`} />
              </label>
              {plan.cos.length > 0 && (
                // The outcome chips appear once the row has a topic, so empty rows stay one line high.
                <fieldset className="flex flex-wrap gap-1.5 group-has-[input[name^=topic]:placeholder-shown]/session:hidden">
                  <legend className="sr-only">Course outcomes covered in session {i + 1}</legend>
                  {plan.cos.map((co) => (
                    <label
                      key={co.id}
                      title={co.statement}
                      className="ring-border has-checked:bg-primary has-checked:text-primary-foreground has-checked:ring-primary has-focus-visible:ring-ring cursor-pointer rounded-md px-2 py-0.5 text-xs font-medium ring-1 transition-colors"
                    >
                      <input
                        type="checkbox"
                        name={`cos_${i}[]`}
                        value={co.id}
                        defaultChecked={row.coIds.includes(co.id)}
                        className="sr-only"
                      />
                      {co.code}
                    </label>
                  ))}
                  <FieldErrors name={`cos_${i}[]`} />
                </fieldset>
              )}
            </div>
          </div>
        ))}
        <p className="text-muted-foreground text-xs">
          To remove a session, clear its date and topic. Need more rows? Save, and {BLANK_ROWS} empty rows appear again.
        </p>
      </div>
    </ActionForm>
  );
}
