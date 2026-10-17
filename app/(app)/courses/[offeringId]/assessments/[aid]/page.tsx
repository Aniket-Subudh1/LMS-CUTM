import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowLeftIcon,
  ChatTextIcon,
  CheckSquareIcon,
  CloudCheckIcon,
  InfoIcon,
  PaperPlaneTiltIcon,
  TimerIcon,
} from '@phosphor-icons/react/ssr';
import Loading from '../../../../loading';
import { ModeChip, STATE_LABEL } from '../student-list';
import { startAttempt } from '@/app/(attempt)/courses/[offeringId]/assessments/[aid]/attempt/actions';
import { ActionForm } from '@/components/action-form';
import { RichTextView } from '@/components/rich-text-view';
import { Fact, Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getAssessmentPage, type AssessmentPage } from '@/lib/data/assessments';
import { formatDateTime, formatDue, formatDuration, MODE_LABEL, statusTone } from '@/lib/format';

export const metadata: Metadata = { title: 'Assessment' };

export default function AssessmentPage({ params }: PageProps<'/courses/[offeringId]/assessments/[aid]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <AssessmentView params={params} />
    </Suspense>
  );
}

// T5: what a student reads before starting, and their marks once results are published. Whoever teaches or oversees
// the class works in the builder.
async function AssessmentView({ params }: { params: PageProps<'/courses/[offeringId]/assessments/[aid]'>['params'] }) {
  const { offeringId, aid } = await params;
  const page = await getAssessmentPage(offeringId, aid);
  if (page.view === 'staff') redirect(`/courses/${offeringId}/assessments/${aid}/edit`);
  const { assessment: a, check, attempts, result } = page;
  const now = new Date();
  const last = attempts[attempts.length - 1];
  const noun = MODE_LABEL[a.mode].toLowerCase();
  const end = a.lateUntil ?? a.closesAt;
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`/courses/${offeringId}/assessments`}>
          <ArrowLeftIcon /> All assessments
        </Link>
      </Button>
      <section className="surface mb-4 flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="grid min-w-0 gap-1.5">
          <ModeChip mode={a.mode} />
          <h1 className="text-[1.0625rem] font-semibold tracking-tight text-balance">{a.title}</h1>
          <p className="text-muted-foreground text-[0.8125rem]">
            {a.items.length} question{a.items.length === 1 ? '' : 's'} · {a.maxMarks} marks
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
          <Badge variant={statusTone(page.state)}>
            {page.state === 'open' ? `Open now · ${formatDue(a.closesAt, now).toLowerCase()}` : STATE_LABEL[page.state]}
          </Badge>
        )}
      </section>

      <dl className="surface mb-4 grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Fact label="Opens">{formatDateTime(a.opensAt)}</Fact>
        <Fact label="Closes">{formatDateTime(a.closesAt)}</Fact>
        <Fact label="Time limit">{a.durationMin ? formatDuration(a.durationMin * 60) : 'None'}</Fact>
        <Fact label="Attempts">
          {attempts.length} of {a.attemptsAllowed}
        </Fact>
        <Fact label="Late hand-ins">{a.lateUntil ? `Until ${formatDateTime(a.lateUntil)}` : 'Not allowed'}</Fact>
        <Fact label="Counts">{a.attemptsAllowed > 1 ? `Your ${a.attemptPolicy} attempt` : 'Your attempt'}</Fact>
      </dl>

      {result ? (
        <Results page={page} />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Section icon={<InfoIcon />} title="Instructions" description="From your teacher.">
            {a.instructions ? (
              <RichTextView doc={a.instructions} />
            ) : (
              <p className="text-muted-foreground text-[0.8125rem]">No instructions for this one.</p>
            )}
          </Section>
          <section className="surface grid gap-3 p-5">
            {check === 'start' || check === 'resume' ? (
              <>
                <h2 className="text-[0.9375rem] font-semibold">
                  {check === 'resume' ? 'Your attempt is running' : 'Ready when you are'}
                </h2>
                <ul className="text-muted-foreground grid gap-2 text-[0.8125rem]">
                  {a.durationMin ? (
                    <li className="flex gap-2">
                      <TimerIcon className="text-foreground size-4 shrink-0" />
                      The {formatDuration(a.durationMin * 60)} start when you press Start and keep running if you close
                      the tab.
                    </li>
                  ) : (
                    <li className="flex gap-2">
                      <TimerIcon className="text-foreground size-4 shrink-0" />
                      Hand it in by {formatDateTime(end)}.
                    </li>
                  )}
                  <li className="flex gap-2">
                    <CloudCheckIcon className="text-foreground size-4 shrink-0" />
                    Every answer saves itself a moment after you change it.
                  </li>
                  <li className="flex gap-2">
                    <PaperPlaneTiltIcon className="text-foreground size-4 shrink-0" />
                    When time is up, your saved answers are handed in for you.
                  </li>
                </ul>
                <ActionForm
                  action={startAttempt}
                  submitLabel={check === 'resume' ? 'Continue' : `Start ${noun}`}
                  fullWidth
                >
                  <input type="hidden" name="offeringId" value={offeringId} />
                  <input type="hidden" name="assessmentId" value={aid} />
                </ActionForm>
              </>
            ) : (
              <>
                <h2 className="text-[0.9375rem] font-semibold">
                  {check === 'not_open' ? 'Not open yet' : check === 'closed' ? 'Closed' : 'All attempts used'}
                </h2>
                <p className="text-muted-foreground text-[0.8125rem]">
                  {check === 'not_open'
                    ? `It opens on ${formatDateTime(a.opensAt)}.`
                    : last
                      ? 'Your answers are handed in. You will see your marks here once your teacher publishes them.'
                      : `It closed on ${formatDateTime(end)}.`}
                </p>
                {last?.autoSubmitted && (
                  <p className="bg-muted flex items-center gap-2 rounded-md px-3 py-2 text-[0.8125rem]">
                    <CheckSquareIcon className="size-4 shrink-0" />
                    Time ran out on your last attempt; the answers you had saved were handed in.
                  </p>
                )}
              </>
            )}
            {attempts.length > 0 && (
              <ul className="grid gap-1 border-t pt-3 text-xs">
                {attempts.map((attempt) => (
                  <li key={attempt.attemptNo} className="text-muted-foreground flex flex-wrap items-center gap-2">
                    Attempt {attempt.attemptNo} ·{' '}
                    {attempt.submittedAt ? `handed in ${formatDateTime(attempt.submittedAt)}` : 'in progress'}
                    {attempt.late && <Badge variant="warning">Late</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}

// T5: the counted attempt's marks per question, the rubric's criteria and the teacher's comments. No answer keys.
function Results({ page }: { page: Extract<AssessmentPage, { view: 'student' }> }) {
  const { assessment: a, result } = page;
  if (!result) return null;
  const scoreOf = new Map(result.items.map((item) => [item.id, item]));
  return (
    <Section
      icon={<CheckSquareIcon />}
      title="Your marks"
      description="Per question, with your teacher’s comments. Correct answers are not shown."
    >
      <ol className="grid">
        {a.items.map((item, i) => {
          const score = scoreOf.get(item.id);
          return (
            <li key={item.id} className="border-border/70 flex gap-3 border-b py-3 last:border-0">
              <span className="bg-muted grid size-6 shrink-0 place-items-center rounded-sm text-xs font-semibold">
                {i + 1}
              </span>
              <div className="grid min-w-0 flex-1 gap-2 text-[0.8125rem]">
                {item.prompt && <RichTextView doc={item.prompt} />}
                {score?.criteria && (
                  <div className="bg-muted/60 grid gap-1.5 rounded-md p-3 text-xs">
                    {score.criteria.map((c) => (
                      <div key={c.criterion} className="flex justify-between gap-3">
                        <span>{c.criterion}</span>
                        <b className="tabular-nums">
                          {c.marks ?? '—'} / {c.maxMarks}
                        </b>
                      </div>
                    ))}
                  </div>
                )}
                {score?.comment && (
                  <p className="flex gap-2">
                    <ChatTextIcon className="text-primary size-4 shrink-0" />
                    {score.comment}
                  </p>
                )}
              </div>
              <b className="text-[0.8125rem] font-semibold whitespace-nowrap tabular-nums">
                {score?.marks ?? '—'} / {item.maxMarks}
              </b>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
