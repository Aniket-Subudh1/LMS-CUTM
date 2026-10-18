import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeftIcon,
  CertificateIcon,
  CheckIcon,
  TrophyIcon,
  XIcon,
  CameraIcon,
  ChatTextIcon,
  CheckSquareIcon,
  CloudCheckIcon,
  CopyIcon,
  DownloadSimpleIcon,
  InfoIcon,
  ClockCountdownIcon,
  ListNumbersIcon,
  LockSimpleIcon,
  MinusCircleIcon,
  PaperPlaneTiltIcon,
  ShieldCheckIcon,
  TimerIcon,
  WarningIcon,
  WifiSlashIcon,
} from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import { startAttempt } from '@/app/(attempt)/courses/[offeringId]/assessments/[aid]/attempt/actions';
import { ActionForm } from '@/components/action-form';
import { RichTextView } from '@/components/rich-text-view';
import { Fact, Section } from '@/components/section';
import { ModeChip, STATE_LABEL } from '@/components/assessment-lists';
import { TestFileButton } from '@/components/test-file-button';
import { Countdown, DeviceCheck } from '@/components/test-lobby';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { getAssessmentPage, type AssessmentPage } from '@/lib/data/assessments';
import { assessmentPath } from '@/lib/domain/test-links';
import { formatDateTime, formatDue, formatDuration, MODE_LABEL, ordinal, statusTone } from '@/lib/format';

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
      {result ? (
        <Results page={page} />
      ) : (
        <section className="surface mb-4 flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div className="grid min-w-0 gap-1.5">
            <ModeChip mode={a.mode} />
            <h1 className="text-[1.0625rem] font-semibold tracking-tight text-balance">{a.title}</h1>
            <p className="text-muted-foreground text-[0.8125rem]">
              {a.questions} question{a.questions === 1 ? '' : 's'} · {a.maxMarks} marks
              {a.sections.length > 0 && ` · ${a.sections.length} sections`}
            </p>
          </div>
          <Badge variant={statusTone(page.state)} className="normal-case">
            {page.state === 'open' ? `Open now · ${formatDue(a.closesAt, now).toLowerCase()}` : STATE_LABEL[page.state]}
          </Badge>
        </section>
      )}

      {/* TP-11: with marks shown at once, someone with attempts left sees the lobby under their result. */}
      {lobby ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="grid gap-4">
            <DeviceCheck fullscreen={a.proctoring?.fullscreen} camera={a.proctoring?.camera} />
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
        !result && (
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
              {attempts[attempts.length - 1]?.endedBy && (
                <p className="bg-muted flex items-center gap-2 rounded-md px-3 py-2 text-[0.8125rem]">
                  <WarningIcon className="size-4 shrink-0" />
                  {attempts[attempts.length - 1]?.endedBy === 'warnings'
                    ? 'Your last attempt reached the limit of serious warnings, so the answers you had saved were handed in.'
                    : 'Your teacher ended your last attempt; the answers you had saved were handed in.'}
                </p>
              )}
              {attempts[attempts.length - 1]?.autoSubmitted && (
                <p className="bg-muted flex items-center gap-2 rounded-md px-3 py-2 text-[0.8125rem]">
                  <CheckSquareIcon className="size-4 shrink-0" />
                  Time ran out on your last attempt; the answers you had saved were handed in.
                </p>
              )}
              <Attempts attempts={attempts} />
            </section>
          </div>
        )
      )}
    </>
  );
}

function BeforeYouStart({ page }: { page: StudentPage }) {
  const { assessment: a, attempts } = page;
  const p = a.proctoring;
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
    // TP-08 (09 §11): exactly what is watched, before anyone starts.
    ...(p
      ? [
          {
            icon: ShieldCheckIcon,
            text: `This test is proctored. ${p.fullscreen ? 'It runs in full screen. Leaving full screen or the test’s page' : 'Leaving the test’s page'}, or opening it in a second tab or on another device, is a serious warning${p.hardLimit > 0 ? `; at the ${ordinal(p.hardLimit)} your saved answers are handed in for you` : ''}.`,
          },
          ...(p.penaltyEach > 0
            ? [
                {
                  icon: MinusCircleIcon,
                  text: `Each serious warning takes ${p.penaltyEach} mark${p.penaltyEach === 1 ? '' : 's'} off your total. Your teacher can waive it.`,
                },
              ]
            : []),
          {
            icon: CopyIcon,
            text: p.blockCopy
              ? 'Copy, paste and right-click are blocked. Trying them, printing or opening developer tools is recorded.'
              : 'Copying, pasting, printing and opening developer tools are recorded.',
          },
          ...(p.camera
            ? [
                {
                  icon: CameraIcon,
                  text: `Your camera takes a still picture every ${p.snapshotEverySec} seconds: no video, no sound. Only the test’s staff see them.`,
                },
              ]
            : []),
          { icon: WifiSlashIcon, text: 'A lost connection is recorded with how long it lasted.' },
        ]
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

function Bar({ label, marks, maxMarks }: { label: string; marks: number; maxMarks: number }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 text-[0.8125rem]">
      <div className="flex justify-between gap-3">
        <span className="min-w-0 truncate">{label}</span>
        <b className="font-semibold whitespace-nowrap tabular-nums">
          {marks} / {maxMarks}
        </b>
      </div>
      <span className="bg-muted h-2 overflow-hidden rounded-full">
        <span
          className="bg-primary block h-full rounded-full"
          style={{ width: `${maxMarks > 0 ? Math.min(100, (100 * marks) / maxMarks) : 0}%` }}
        />
      </span>
    </div>
  );
}

// T5 and TP-11 (mock-up C5): the counted attempt's result — its percentage, band and, once the results are out, its
// place among the others; marks by section and by outcome; each question with its marks, what was answered and, as the
// test's rules allow, the right answer and the explanation; and a leaderboard when the test shows one. Nothing else of
// the key reaches the page (09 §10).
function Results({ page }: { page: StudentPage }) {
  const { result, assessment: a } = page;
  if (!result) return null;
  const ring = 2 * Math.PI * 44;
  const you = result.leaderboard?.some((row) => row.you);
  return (
    <div className="mb-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid min-w-0 gap-4">
        <section className="surface flex flex-wrap items-center gap-5 p-4 sm:p-6">
          <span className="relative grid size-28 shrink-0 place-items-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r="44" fill="none" strokeWidth="8" className="stroke-muted" />
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                strokeWidth="8"
                strokeLinecap="round"
                className="stroke-primary"
                strokeDasharray={`${(ring * Math.min(100, result.pct)) / 100} ${ring}`}
              />
            </svg>
            <span className="grid text-center leading-tight">
              <b className="text-2xl font-semibold tabular-nums">{Math.round(result.pct)}%</b>
              <span className="text-muted-foreground text-xs">final</span>
            </span>
          </span>
          <div className="grid min-w-0 flex-1 gap-1.5">
            <ModeChip mode={a.mode} />
            <h1 className="text-[1.0625rem] font-semibold tracking-tight text-balance">{a.title}</h1>
            <p>
              <b className="text-2xl font-semibold tabular-nums">{result.total}</b>
              <span className="text-muted-foreground text-lg"> / {result.maxMarks} marks</span>
            </p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem]">
              {result.band && (
                <span className="text-success flex items-center gap-1.5 font-medium">
                  <span className="bg-success size-1.5 rounded-full" />
                  {result.band}
                </span>
              )}
              {result.standing ? (
                <span className="text-muted-foreground">
                  Rank <b className="text-foreground">{result.standing.rank}</b> of {result.standing.of} ·{' '}
                  <b className="text-foreground">{ordinal(result.standing.percentile)}</b> percentile
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {a.resultsPublished
                    ? 'Your place is being worked out.'
                    : 'Your place appears when the results are published.'}
                </span>
              )}
            </p>
            {(result.warnings > 0 || result.penalty > 0) && (
              <p className="text-muted-foreground flex items-center gap-2 text-[0.8125rem]">
                <MinusCircleIcon className="size-4 shrink-0" />
                Proctoring: {result.warnings} serious warning{result.warnings === 1 ? '' : 's'},{' '}
                {result.penalty > 0 ? `${result.penalty} marks taken off` : 'no deduction'}
              </p>
            )}
          </div>
          {/* TP-12 (mock-up C5): the certificate when the result earns one, and the scorecard. */}
          <div className="flex flex-wrap gap-2 sm:grid">
            {result.files.certificate && (
              <TestFileButton
                assessmentId={a.id}
                kind="certificate"
                label="Certificate"
                icon={<CertificateIcon />}
                file={result.files.certificate}
              />
            )}
            <TestFileButton
              assessmentId={a.id}
              kind="scorecard"
              label="Scorecard"
              icon={<DownloadSimpleIcon />}
              file={result.files.scorecard}
            />
          </div>
        </section>

        {result.sections.length > 0 && (
          <section className="surface grid gap-4 p-4 sm:p-6">
            <h2 className="text-[0.9375rem] font-semibold">By section</h2>
            {result.sections.map((section) => (
              <Bar key={section.title} label={section.title} marks={section.marks} maxMarks={section.maxMarks} />
            ))}
          </section>
        )}

        <Section
          icon={<CheckSquareIcon />}
          title="Your answers"
          description="Each question with your marks and the grader’s comments."
        >
          <ol className="grid gap-3">
            {result.items.map((item, i) => {
              const full = item.marks !== null && item.marks >= item.maxMarks;
              const none = item.marks !== null && item.marks <= 0;
              return (
                <li key={item.id} className="ring-border/70 grid gap-2 rounded-md p-3 text-[0.8125rem] ring-1 sm:p-4">
                  <div className="flex items-start gap-3">
                    <span className="bg-muted grid size-6 shrink-0 place-items-center rounded-sm text-xs font-semibold">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">{item.prompt && <RichTextView doc={item.prompt} />}</div>
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                        item.marks === null
                          ? 'bg-muted text-muted-foreground'
                          : full
                            ? 'bg-success/10 text-success'
                            : none
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-warning/10 text-warning',
                      )}
                    >
                      {item.marks !== null &&
                        (full ? <CheckIcon className="size-3.5" /> : none && <XIcon className="size-3.5" />)}
                      {item.marks === null ? 'Not marked' : `${item.marks} / ${item.maxMarks}`}
                    </span>
                  </div>
                  <p className="pl-9">
                    <span className="text-muted-foreground">You:</span> {item.given ?? 'No answer'}
                    {item.correct && (
                      <>
                        {' '}
                        · <span className="text-muted-foreground">Right answer:</span> {item.correct}
                      </>
                    )}
                  </p>
                  {item.explanation && (
                    <div className="bg-muted/60 ml-9 flex gap-2 rounded-md p-3">
                      <InfoIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                      <div className="min-w-0">
                        <RichTextView doc={item.explanation} />
                      </div>
                    </div>
                  )}
                  {item.criteria && (
                    <div className="bg-muted/60 ml-9 grid gap-1.5 rounded-md p-3 text-xs">
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
                    <p className="ml-9 flex gap-2">
                      <ChatTextIcon className="text-primary size-4 shrink-0" />
                      {item.comment}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </Section>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4">
        {result.leaderboard && (
          <section className="surface grid grid-cols-1 gap-2 p-4 sm:p-5">
            <h2 className="mb-1 flex items-center gap-2 text-[0.9375rem] font-semibold">
              <TrophyIcon className="text-warning size-5" /> Leaderboard
            </h2>
            <ol className="grid grid-cols-1 gap-1 text-[0.8125rem]">
              {result.leaderboard.map((row) => (
                <li
                  key={`${row.rank}-${row.name}`}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-2 py-1.5',
                    row.you && 'bg-primary/10 font-semibold',
                  )}
                >
                  <span className="text-muted-foreground w-5 tabular-nums">{row.rank}</span>
                  <span className="min-w-0 flex-1 truncate">{row.you ? 'You' : row.name}</span>
                  <b className="tabular-nums">{row.total}</b>
                </li>
              ))}
              {!you && result.standing && (
                <>
                  <li className="text-muted-foreground text-center" aria-hidden>
                    …
                  </li>
                  <li className="bg-primary/10 flex items-center gap-3 rounded-md px-2 py-1.5 font-semibold">
                    <span className="w-5 tabular-nums">{result.standing.rank}</span>
                    <span className="flex-1">You</span>
                    <b className="tabular-nums">{result.total}</b>
                  </li>
                </>
              )}
            </ol>
          </section>
        )}
        {result.outcomes.length > 0 && (
          <section className="surface grid grid-cols-1 gap-4 p-4 sm:p-5">
            <h2 className="text-[0.9375rem] font-semibold">By outcome</h2>
            {result.outcomes.map((co) => (
              <Bar key={co.code} label={`${co.code} · ${co.statement}`} marks={co.marks} maxMarks={co.maxMarks} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
