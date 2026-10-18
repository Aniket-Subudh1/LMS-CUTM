import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeftIcon,
  ChatTextIcon,
  CheckSquareIcon,
  CloudCheckIcon,
  InfoIcon,
  ClockCountdownIcon,
  ListNumbersIcon,
  LockSimpleIcon,
  PaperPlaneTiltIcon,
  TimerIcon,
} from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import { startAttempt } from '@/app/(attempt)/courses/[offeringId]/assessments/[aid]/attempt/actions';
import { ActionForm } from '@/components/action-form';
import { RichTextView } from '@/components/rich-text-view';
import { Fact, Section } from '@/components/section';
import { ModeChip, STATE_LABEL } from '@/components/assessment-lists';
import { Countdown, DeviceCheck } from '@/components/test-lobby';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { getAssessmentPage, type AssessmentPage } from '@/lib/data/assessments';
import { assessmentPath } from '@/lib/domain/test-links';
import { formatDateTime, formatDue, formatDuration, MODE_LABEL, statusTone } from '@/lib/format';

type StudentPage = Extract<AssessmentPage, { view: 'student' }>;

// T5 and TP-04 ("Lobby B", M04b decision 5): what a student or candidate reads before starting — the device check on
// the left; the test, its rules, the countdown and Start on the right — and their marks once results are published.
// Whoever teaches or owns it works in the builder. Shared by a course's assessments and standalone tests.
export async function AssessmentOverview({ params }: { params: Promise<{ offeringId?: string; aid: string }> }) {
  const { offeringId, aid } = await params;
  const page = await getAssessmentPage(aid);
  if (page.path !== assessmentPath(offeringId ?? null, aid)) notFound();
  if (page.view === 'staff') redirect(`${page.path}/edit`);
  const { assessment: a, check, attempts, result } = page;
  const now = new Date();
  const end = a.lateUntil ?? a.closesAt;
  const lobby = check === 'start' || check === 'resume' || check === 'not_open';
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={offeringId ? `/courses/${offeringId}/assessments` : '/tests'}>
          <ArrowLeftIcon /> {offeringId ? 'All assessments' : 'All tests'}
        </Link>
      </Button>
      <section className="surface mb-4 flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="grid min-w-0 gap-1.5">
          <ModeChip mode={a.mode} />
          <h1 className="text-[1.0625rem] font-semibold tracking-tight text-balance">{a.title}</h1>
          <p className="text-muted-foreground text-[0.8125rem]">
            {a.questions} question{a.questions === 1 ? '' : 's'} · {a.maxMarks} marks
            {a.sections.length > 0 && ` · ${a.sections.length} sections`}
          </p>
        </div>
        {result ? (
          <div className="text-right">
            <b className="text-3xl font-semibold tabular-nums">
              {result.total}
              <span className="text-muted-foreground text-lg"> / {a.maxMarks}</span>
            </b>
            <p className="text-muted-foreground text-xs">Your counted marks</p>
          </div>
        ) : (
          <Badge variant={statusTone(page.state)} className="normal-case">
            {page.state === 'open' ? `Open now · ${formatDue(a.closesAt, now).toLowerCase()}` : STATE_LABEL[page.state]}
          </Badge>
        )}
      </section>

      {result ? (
        <Results page={page} />
      ) : lobby ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="grid gap-4">
            <DeviceCheck />
            {a.instructions && (
              <Section icon={<InfoIcon />} title="Instructions" description="Read these before you start.">
                <RichTextView doc={a.instructions} />
              </Section>
            )}
          </div>
          <div className="grid gap-4">
            <BeforeYouStart page={page} />
            <section className="surface grid gap-3 p-5">
              {check === 'not_open' ? (
                <>
                  <Countdown
                    opensAt={a.opensAt.toISOString()}
                    serverNow={now.getTime()}
                    caption={`${formatDateTime(a.opensAt)}${a.durationMin ? ` · ${formatDuration(a.durationMin * 60)} from when you start` : ''}`}
                  />
                  <Button size="lg" disabled className="w-full">
                    Start
                  </Button>
                </>
              ) : (
                <ActionForm
                  action={startAttempt}
                  submitLabel={check === 'resume' ? 'Continue' : `Start ${MODE_LABEL[a.mode].toLowerCase()}`}
                  fullWidth
                >
                  <input type="hidden" name="assessmentId" value={aid} />
                  {check === 'start' && (
                    <label className="flex items-start gap-2.5 text-[0.8125rem]">
                      <input type="checkbox" name="agree" required className="accent-foreground mt-0.5 size-4" />I have
                      read the rules and will take it on my own.
                    </label>
                  )}
                </ActionForm>
              )}
              <Attempts attempts={attempts} />
            </section>
          </div>
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Section icon={<InfoIcon />} title="Instructions" description="As they were given.">
            {a.instructions ? (
              <RichTextView doc={a.instructions} />
            ) : (
              <p className="text-muted-foreground text-[0.8125rem]">No instructions for this one.</p>
            )}
          </Section>
          <section className="surface grid gap-3 p-5">
            <h2 className="text-[0.9375rem] font-semibold">{check === 'closed' ? 'Closed' : 'All attempts used'}</h2>
            <p className="text-muted-foreground text-[0.8125rem]">
              {attempts.length > 0
                ? 'Your answers are handed in. You will see your marks here once they are published.'
                : `It closed on ${formatDateTime(end)}.`}
            </p>
            {attempts[attempts.length - 1]?.autoSubmitted && (
              <p className="bg-muted flex items-center gap-2 rounded-md px-3 py-2 text-[0.8125rem]">
                <CheckSquareIcon className="size-4 shrink-0" />
                Time ran out on your last attempt; the answers you had saved were handed in.
              </p>
            )}
            <Attempts attempts={attempts} />
          </section>
        </div>
      )}
    </>
  );
}

function BeforeYouStart({ page }: { page: StudentPage }) {
  const { assessment: a, attempts } = page;
  const end = a.lateUntil ?? a.closesAt;
  const facts = [
    ['Time limit', a.durationMin ? formatDuration(a.durationMin * 60) : 'None'],
    ...(a.sections.length > 0 ? [['Sections', String(a.sections.length)]] : []),
    ['Questions', String(a.questions)],
    ['Attempts used', `${attempts.length} of ${a.attemptsAllowed}`],
  ];
  const timed = a.sections.filter((section) => section.durationMin);
  const locked = a.sections.filter((section) => section.locked);
  const rules: { icon: Icon; text: string }[] = [
    a.durationMin
      ? {
          icon: TimerIcon,
          text: `You have ${formatDuration(a.durationMin * 60)} from when you press Start. The clock keeps running if you close the tab.`,
        }
      : { icon: TimerIcon, text: `Hand it in by ${formatDateTime(end)}.` },
    {
      icon: CloudCheckIcon,
      text: 'Every answer saves itself a moment after you change it, and retries if the connection drops.',
    },
    { icon: PaperPlaneTiltIcon, text: 'When time is up, your saved answers are handed in for you.' },
    ...(a.attemptsAllowed > 1
      ? [{ icon: ListNumbersIcon, text: `You have ${a.attemptsAllowed} attempts; your ${a.attemptPolicy} one counts.` }]
      : []),
    // TP-06: the sections' own clocks and order rules.
    ...(timed.length > 0
      ? [
          {
            icon: ClockCountdownIcon,
            text: `${timed.map((section) => `${section.title} has ${formatDuration((section.durationMin ?? 0) * 60)}`).join('; ')}, from when you open it.`,
          },
        ]
      : []),
    ...(locked.length > 0
      ? [
          {
            icon: LockSimpleIcon,
            text: `No going back from ${locked.map((section) => section.title).join(', ')}: once you leave ${locked.length === 1 ? 'it' : 'one'}, its answers cannot change.`,
          },
        ]
      : []),
    ...(page.extraMin > 0
      ? [{ icon: TimerIcon, text: `You have ${page.extraMin} extra minutes, added to your time.` }]
      : []),
  ];
  return (
    <section className="surface grid gap-4 p-5">
      <h2 className="text-[0.9375rem] font-semibold">Before you start</h2>
      <dl className={cn('grid grid-cols-2 gap-2 sm:gap-3', facts.length === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
        {facts.map(([label, value]) => (
          <div key={label} className="bg-muted/60 grid rounded-md p-3">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="text-[0.9375rem] font-semibold tabular-nums sm:text-base">{value}</dd>
          </div>
        ))}
      </dl>
      <ul className="grid gap-2 text-[0.8125rem]">
        {rules.map(({ icon: RuleIcon, text }) => (
          <li key={text} className="flex gap-2.5">
            <RuleIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            {text}
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-2 gap-3 border-t pt-4">
        <Fact label="Opens">{formatDateTime(a.opensAt)}</Fact>
        <Fact label="Closes">{formatDateTime(a.closesAt)}</Fact>
        {a.lateUntil && <Fact label="Late hand-ins">Until {formatDateTime(a.lateUntil)}</Fact>}
      </dl>
    </section>
  );
}

function Attempts({ attempts }: { attempts: StudentPage['attempts'] }) {
  if (attempts.length === 0) return null;
  return (
    <ul className="grid gap-1 border-t pt-3 text-xs">
      {attempts.map((attempt) => (
        <li key={attempt.attemptNo} className="text-muted-foreground flex flex-wrap items-center gap-2">
          Attempt {attempt.attemptNo} ·{' '}
          {attempt.submittedAt ? `handed in ${formatDateTime(attempt.submittedAt)}` : 'in progress'}
          {attempt.late && <Badge variant="warning">Late</Badge>}
        </li>
      ))}
    </ul>
  );
}

// T5: the counted attempt's marks per question, the rubric's criteria and the grader's comments. No answer keys.
function Results({ page }: { page: StudentPage }) {
  const { result } = page;
  if (!result) return null;
  return (
    <Section
      icon={<CheckSquareIcon />}
      title="Your marks"
      description="Per question, with the grader’s comments. Correct answers are not shown."
    >
      <ol className="grid">
        {result.items.map((item, i) => {
          return (
            <li key={item.id} className="border-border/70 flex gap-3 border-b py-3 last:border-0">
              <span className="bg-muted grid size-6 shrink-0 place-items-center rounded-sm text-xs font-semibold">
                {i + 1}
              </span>
              <div className="grid min-w-0 flex-1 gap-2 text-[0.8125rem]">
                {item.prompt && <RichTextView doc={item.prompt} />}
                {item.criteria && (
                  <div className="bg-muted/60 grid gap-1.5 rounded-md p-3 text-xs">
                    {item.criteria.map((c) => (
                      <div key={c.criterion} className="flex justify-between gap-3">
                        <span>{c.criterion}</span>
                        <b className="tabular-nums">
                          {c.marks ?? '—'} / {c.maxMarks}
                        </b>
                      </div>
                    ))}
                  </div>
                )}
                {item.comment && (
                  <p className="flex gap-2">
                    <ChatTextIcon className="text-primary size-4 shrink-0" />
                    {item.comment}
                  </p>
                )}
              </div>
              <b className="text-[0.8125rem] font-semibold whitespace-nowrap tabular-nums">
                {item.marks ?? '—'} / {item.maxMarks}
              </b>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
