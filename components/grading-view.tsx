import { Fragment } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  CodeIcon,
  FileIcon,
  LockIcon,
  WarningIcon,
  ShieldCheckIcon,
  XIcon,
} from '@phosphor-icons/react/ssr';
import { gradeSubmission, rerunCode, waivePenalty } from '@/app/(app)/courses/[offeringId]/assessments/actions';
import { ActionForm, FieldErrors } from '@/components/action-form';
import { RichTextView } from '@/components/rich-text-view';
import { SuggestMarks } from '@/components/suggest-marks';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getSubmissionForGrading, type AnswerValue, type GradingView, type TeacherItem } from '@/lib/data/assessments';
import { normalizeBlank } from '@/lib/domain/grading';
import { assessmentPath } from '@/lib/domain/test-links';
import {
  formatDateTime,
  formatDuration,
  formatTimeSeconds,
  initials,
  ITEM_LABEL,
  PROCTOR_EVENT_LABEL,
  statusTone,
} from '@/lib/format';
import { OBJECTIVE_TYPES, type RunStatus } from '@/lib/schemas/assessment';

// T6: one hand-in. Each answer sits beside the key and its marks (automatic marks can be changed), a rubric question's
// criteria, and a comment; "Save and open the next" goes to the next hand-in waiting for marks (M04 decision 5).
// Shared by a course's assessments and standalone tests (M04b).
export async function GradingPage({
  params,
}: {
  params: Promise<{ offeringId?: string; aid: string; submissionId: string }>;
}) {
  const { offeringId, aid, submissionId } = await params;
  const view = await getSubmissionForGrading(aid, submissionId);
  if (view.path !== assessmentPath(offeringId ?? null, aid)) notFound();
  const { submission: s, assessment: a } = view;
  const list = `${view.path}/grade`;
  // M04b: this attempt's own paper, under each section's title.
  const questions = (
    <div className="grid gap-4">
      {view.items.map((item, i) => (
        <Fragment key={item.id}>
          {item.sectionTitle && item.sectionTitle !== view.items[i - 1]?.sectionTitle && (
            <h2 className="text-muted-foreground mt-2 text-xs font-semibold tracking-wide uppercase">
              {item.sectionTitle}
            </h2>
          )}
          <QuestionCard item={item} n={i + 1} view={view} />
        </Fragment>
      ))}
    </div>
  );
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={list}>
            <ArrowLeftIcon /> All hand-ins
          </Link>
        </Button>
        <span className="ml-auto flex gap-2">
          {view.previousId && (
            <Button asChild variant="outline" size="sm">
              <Link href={`${list}/${view.previousId}`}>
                <CaretLeftIcon /> Previous
              </Link>
            </Button>
          )}
          {view.nextToGradeId && (
            <Button asChild variant="outline" size="sm">
              <Link href={`${list}/${view.nextToGradeId}`}>
                Next to grade <CaretRightIcon />
              </Link>
            </Button>
          )}
        </span>
      </div>
      <section className="surface mb-4 flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <Avatar className="size-10">
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
            {initials(s.student.name)}
          </AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h1 className="text-[1.0625rem] font-semibold">
            {s.student.name}{' '}
            {offeringId && <span className="text-muted-foreground font-normal">· {s.student.rollNo}</span>}
          </h1>
          <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-[0.8125rem]">
            {a.title} · attempt {s.attemptNo} ·{' '}
            {s.submittedAt
              ? `handed in ${formatDateTime(s.submittedAt)}, ${formatDuration(
                  Math.max(0, Math.round((s.submittedAt.getTime() - s.startedAt.getTime()) / 1000)),
                )} after starting`
              : 'still writing'}
            {s.late && <Badge variant="warning">Late</Badge>}
            {s.autoSubmitted && <Badge variant="secondary">By the timer</Badge>}
            {s.endedBy && (
              <Badge variant="destructive">
                {s.endedBy === 'warnings' ? 'Ended at the warning limit' : 'Ended by staff'}
              </Badge>
            )}
            {s.addedMin > 0 && <Badge variant="secondary">+{s.addedMin} min added</Badge>}
          </p>
        </div>
        <div className="text-right">
          <b className="text-xl font-semibold tabular-nums">
            {s.total ?? '—'} <span className="text-muted-foreground text-sm">/ {a.maxMarks}</span>
          </b>
          <p>
            <Badge variant={statusTone(s.status === 'submitted' ? 'to_grade' : s.status)}>
              {s.status === 'submitted' ? 'To grade' : s.status === 'graded' ? 'Graded' : 'In progress'}
            </Badge>
          </p>
        </div>
      </section>
      {view.proctor && <Proctoring view={view} proctor={view.proctor} />}
      {view.similar.length > 0 && (
        <section className="surface border-warning/40 mb-4 grid gap-1 border p-4 text-[0.8125rem] sm:p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <WarningIcon className="text-warning size-4" /> Alike answers — worth a look, not a verdict
          </h2>
          <ul className="grid gap-1">
            {view.similar.map((entry) => (
              <li key={`${entry.submissionId}-${entry.question}`}>
                Question {entry.question} is {Math.round(entry.score * 100)}% like{' '}
                <Link
                  href={`${list}/${entry.submissionId}`}
                  className="text-primary font-medium underline-offset-2 hover:underline"
                >
                  {entry.name}’s answer
                </Link>
                .
              </li>
            ))}
          </ul>
        </section>
      )}
      {view.items.some((item) => item.type === 'code') && s.status !== 'in_progress' && (
        <section className="surface mb-4 flex flex-wrap items-center justify-between gap-3 p-4 text-[0.8125rem] sm:p-5">
          <span className="flex items-center gap-2">
            <CodeIcon className="text-muted-foreground size-5" />
            {s.codeGradedAt
              ? `Code tested on every test, hidden ones too, at ${formatDateTime(s.codeGradedAt)}.`
              : 'The code is being tested on every test. Reload in a minute.'}
          </span>
          {view.canGrade && (
            <ActionForm
              action={rerunCode}
              submitLabel="Run the tests again"
              submitVariant="outline"
              submitSize="sm"
              successMessage="Testing again. Reload in a minute."
            >
              <input type="hidden" name="submissionId" value={s.id} />
            </ActionForm>
          )}
        </section>
      )}
      {view.locked && (
        <p className="text-muted-foreground bg-muted/60 mb-4 flex items-center gap-2 rounded-md px-3 py-2 text-[0.8125rem]">
          <LockIcon className="size-4 shrink-0" /> Marks for this course are locked, so nothing here can change.
        </p>
      )}
      {view.canGrade && s.status !== 'in_progress' ? (
        // The form's buttons stay in view at the foot of the screen while a long hand-in scrolls.
        <div className="[&_[data-slot=form-footer]]:bg-card [&_[data-slot=form-footer]]:ring-border/70 [&_[data-slot=form-footer]]:sticky [&_[data-slot=form-footer]]:bottom-3 [&_[data-slot=form-footer]]:rounded-md [&_[data-slot=form-footer]]:p-3 [&_[data-slot=form-footer]]:ring-1">
          <ActionForm
            action={gradeSubmission}
            submitLabel="Save marks"
            successMessage="Marks saved."
            secondary={
              view.nextToGradeId && (
                <Button type="submit" name="then" value="next" variant="outline">
                  Save and open the next
                </Button>
              )
            }
          >
            <input type="hidden" name="submissionId" value={s.id} />
            {view.aiReady && view.items.some((item) => item.type === 'text' || item.type === 'code') && (
              <SuggestMarks />
            )}
            {questions}
          </ActionForm>
        </div>
      ) : (
        <fieldset disabled>{questions}</fieldset>
      )}
    </>
  );
}

// TP-08: what proctoring recorded, the penalty for serious warnings (a grader may waive it, 07 §15) and the camera's
// snapshots, which only staff see (09 §11).
function Proctoring({ view, proctor: p }: { view: GradingView; proctor: NonNullable<GradingView['proctor']> }) {
  const s = view.submission;
  return (
    <section className="surface mb-4 grid gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
          <ShieldCheckIcon className="text-muted-foreground size-5" /> Proctoring
        </h2>
        <span className="text-muted-foreground text-[0.8125rem]">
          <b className={p.hard > 0 ? 'text-warning' : 'text-foreground'}>
            {p.hard} serious warning{p.hard === 1 ? '' : 's'}
          </b>{' '}
          · {p.soft} minor
        </span>
      </div>
      {p.rules.penaltyEach > 0 && p.hard > 0 && (
        <div className="bg-muted/60 flex flex-wrap items-center justify-between gap-3 rounded-md px-3 py-2 text-[0.8125rem]">
          <span>
            Penalty {p.waived ? <s>−{p.penalty}</s> : <b className="tabular-nums">−{p.penalty}</b>} ({p.hard} ×{' '}
            {p.rules.penaltyEach}){p.waived && ' · waived'}
          </span>
          {view.canGrade && s.status !== 'in_progress' && (
            <ActionForm
              action={waivePenalty}
              submitLabel={p.waived ? 'Put the penalty back' : 'Waive the penalty'}
              submitVariant="outline"
              submitSize="sm"
              successMessage={p.waived ? 'Penalty put back.' : 'Penalty waived.'}
            >
              <input type="hidden" name="submissionId" value={s.id} />
              <input type="hidden" name="waived" value={p.waived ? 'false' : 'true'} />
            </ActionForm>
          )}
        </div>
      )}
      {p.events.length > 0 && (
        <details className="text-[0.8125rem]">
          <summary className="cursor-pointer font-medium">Everything recorded ({p.events.length})</summary>
          <ol className="mt-2 grid gap-1">
            {p.events.map((event, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-muted-foreground w-24 shrink-0 tabular-nums">{formatTimeSeconds(event.at)}</span>
                <span className={event.counted ? 'text-warning font-medium' : 'text-muted-foreground'}>
                  {PROCTOR_EVENT_LABEL[event.type]}
                  {event.type === 'connection_gap' && event.detail && ` for ${event.detail}`}
                  {!event.counted &&
                    ['fullscreen_exit', 'left_page', 'second_device'].includes(event.type) &&
                    ' (counted with the one before)'}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {p.rules.camera &&
        (p.snapshotsDeletedAt ? (
          <p className="text-muted-foreground text-[0.8125rem]">
            The camera snapshots were deleted on {formatDateTime(p.snapshotsDeletedAt)}.
          </p>
        ) : p.snapshots.length === 0 ? (
          <p className="text-muted-foreground text-[0.8125rem]">No camera snapshots were taken.</p>
        ) : (
          <details className="text-[0.8125rem]">
            <summary className="cursor-pointer font-medium">Camera snapshots ({p.snapshots.length})</summary>
            <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
              {p.snapshots.map((snapshot) => (
                <li key={snapshot.key} className="grid gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a redirect to storage; next/image would proxy the bytes */}
                  <img
                    src={`/api/files/${snapshot.key}`}
                    alt={`Snapshot at ${formatTimeSeconds(snapshot.at)}`}
                    loading="lazy"
                    className="bg-muted aspect-4/3 w-full rounded-sm object-cover"
                  />
                  <span className="text-muted-foreground text-xs tabular-nums">{formatTimeSeconds(snapshot.at)}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
    </section>
  );
}

function QuestionCard({ item, n, view }: { item: TeacherItem; n: number; view: GradingView }) {
  const answer = view.submission.answers[item.id];
  const score = view.submission.scores[item.id];
  const auto = OBJECTIVE_TYPES.some((type) => type === item.type) || item.type === 'code';
  const spent = view.submission.spent[item.id] ?? 0;
  return (
    <article className="surface grid gap-3 p-4 sm:p-5">
      <input type="hidden" name="item[]" value={item.id} />
      <header className="flex flex-wrap items-start gap-3">
        <span className="bg-muted grid size-6 shrink-0 place-items-center rounded-sm text-xs font-semibold">{n}</span>
        <div className="grid min-w-0 flex-1 gap-1 text-[0.8125rem]">
          {item.prompt && <RichTextView doc={item.prompt} />}
          <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {ITEM_LABEL[item.type]}
            {auto ? ' · marked automatically, you can change it' : item.rubric ? ' · rubric' : ''}
            {item.negativeMarks > 0 && ` · −${item.negativeMarks} if wrong`}
            {item.partialCredit && ' · part marks'}
            {spent > 0 && ` · ${formatDuration(spent)} on it`}
            {item.drawn && <Badge variant="secondary">From the bank</Badge>}
            {view.submission.flags.includes(item.id) && (
              <Badge variant="warning" className="normal-case">
                Flagged by them
              </Badge>
            )}
          </span>
        </div>
        {item.rubric ? (
          <span className="grid justify-items-end gap-1">
            <input type="hidden" name="marks[]" value="" />
            <b className="text-[0.8125rem] tabular-nums">
              {score?.marks ?? '—'} / {item.maxMarks}
            </b>
          </span>
        ) : (
          <label className="flex items-center gap-1.5 text-[0.8125rem]">
            <span className="sr-only">Marks for question {n}</span>
            <Input
              name="marks[]"
              data-marks={item.id}
              type="number"
              min={-item.negativeMarks}
              max={item.maxMarks}
              step={0.01}
              defaultValue={score?.marks ?? ''}
              className="w-20 text-right tabular-nums"
            />
            <span className="text-muted-foreground">/ {item.maxMarks}</span>
          </label>
        )}
      </header>
      <div className="grid gap-3 sm:pl-9">
        <AnswerView item={item} answer={answer} view={view} />
        {item.rubric?.map((criterion) => (
          <div key={criterion.id} className="grid gap-1">
            <label className="flex items-center justify-between gap-3 text-[0.8125rem]">
              <span>{criterion.criterion}</span>
              <span className="flex items-center gap-1.5">
                <input type="hidden" name="criterion[]" value={`${item.id}:${criterion.id}`} />
                <Input
                  name="criterionMarks[]"
                  data-criterion={criterion.id}
                  type="number"
                  min={0}
                  max={criterion.maxMarks}
                  step={0.01}
                  defaultValue={score?.criteria[criterion.id] ?? ''}
                  aria-label={`${criterion.criterion}, out of ${criterion.maxMarks}`}
                  className="w-20 text-right tabular-nums"
                />
                <span className="text-muted-foreground">/ {criterion.maxMarks}</span>
              </span>
            </label>
            <FieldErrors name={`criterion-${criterion.id}`} />
          </div>
        ))}
        <FieldErrors name={`marks-${item.id}`} />
        <label className="grid gap-2">
          <span className="text-sm font-medium">Comment for the student</span>
          <Textarea
            name="comment[]"
            maxLength={1000}
            rows={2}
            defaultValue={score?.comment ?? ''}
            placeholder="Optional"
          />
        </label>
      </div>
    </article>
  );
}

const RUN_LABEL: Record<RunStatus, string> = {
  accepted: 'Passed',
  wrong_answer: 'Wrong output',
  time_limit: 'Took too long',
  compile_error: 'Did not compile',
  runtime_error: 'Stopped with an error',
  internal_error: 'Could not run',
};

function AnswerView({ item, answer, view }: { item: TeacherItem; answer: AnswerValue | undefined; view: GradingView }) {
  const options = new Map((item.options ?? []).map((o) => [o.id, o.text]));
  const key = item.key;
  if (!answer) return <p className="text-muted-foreground text-[0.8125rem]">No answer.</p>;
  if (answer.type === 'code') {
    // TP-09 (LAB-03): the code handed in, every test as graded (hidden ones too), and the runs of the visible ones.
    const results = view.submission.results[item.id] ?? [];
    const runs = view.submission.runs[item.id] ?? [];
    const best = runs.reduce((top, run) => Math.max(top, run.passed), 0);
    return (
      <div className="grid gap-2 text-[0.8125rem]">
        {answer.source.trim() === '' ? (
          <p className="text-muted-foreground">No code.</p>
        ) : (
          <pre className="max-h-96 overflow-auto rounded-md bg-[#282c34] p-3 font-mono text-xs leading-relaxed text-[#abb2bf]">
            {answer.source}
          </pre>
        )}
        <p className="text-muted-foreground text-xs">
          {view.languages.find((l) => l.key === answer.language)?.label ?? answer.language ?? 'No language'} ·{' '}
          {runs.length === 0
            ? 'never ran the sample tests'
            : `ran the sample tests ${runs.length} time${runs.length === 1 ? '' : 's'}, best ${best} of ${runs[0].total} passed`}
        </p>
        {runs.length > 0 && (
          <details className="text-xs">
            <summary className="text-muted-foreground cursor-pointer">Every run</summary>
            <ol className="text-muted-foreground mt-1 grid gap-0.5 tabular-nums">
              {runs.map((run, i) => (
                <li key={i}>
                  {formatDateTime(run.at)} · {run.passed} of {run.total} passed
                </li>
              ))}
            </ol>
          </details>
        )}
        <ol className="grid gap-1">
          {(item.tests ?? []).map((test, i) => {
            const result = results.find((r) => r.testCaseId === test.id);
            return (
              <li key={test.id} className="flex flex-wrap items-center gap-2">
                {result ? <Mark ok={result.status === 'accepted'} /> : <span className="size-4" />}
                <span className="font-medium">Test {i + 1}</span>
                {test.hidden && <Badge variant="secondary">Hidden</Badge>}
                <span className="text-muted-foreground text-xs">
                  weight {test.weight} · {result ? RUN_LABEL[result.status] : 'not run'}
                  {result?.timeMs !== null &&
                    result?.timeMs !== undefined &&
                    ` · ${(result.timeMs / 1000).toFixed(2)} s`}
                </span>
                <span className="text-muted-foreground min-w-0 truncate font-mono text-xs" title={test.input}>
                  {test.input.split('\n')[0] || '(no input)'} → {test.expected.split('\n')[0]}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }
  if (answer.type === 'mcq' || answer.type === 'msq') {
    const chosen = answer.type === 'mcq' ? (answer.optionId ? [answer.optionId] : []) : answer.optionIds;
    const correct = key && 'optionIds' in key ? key.optionIds : [];
    return (
      <div className="grid gap-1 text-[0.8125rem]">
        {chosen.length === 0 ? (
          <p className="text-muted-foreground">No answer.</p>
        ) : (
          chosen.map((id) => (
            <p key={id} className="flex items-center gap-2">
              <Mark ok={correct.includes(id)} />
              {options.get(id)}
            </p>
          ))
        )}
        <p className="text-muted-foreground text-xs">Correct: {correct.map((id) => options.get(id)).join(', ')}</p>
      </div>
    );
  }
  if (answer.type === 'true_false') {
    const truth = key && 'truth' in key ? key.truth : null;
    return (
      <p className="flex items-center gap-2 text-[0.8125rem]">
        {answer.truth === null ? (
          <span className="text-muted-foreground">No answer.</span>
        ) : (
          <>
            <Mark ok={answer.truth === truth} />
            {answer.truth ? 'True' : 'False'}
          </>
        )}
        <span className="text-muted-foreground text-xs">· key {truth ? 'True' : 'False'}</span>
      </p>
    );
  }
  if (answer.type === 'fill_blank') {
    return (
      <ol className="grid gap-1 text-[0.8125rem]">
        {(item.blanks ?? []).map((accepted, i) => {
          const given = answer.texts[i] ?? '';
          return (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs">Blank {i + 1}</span>
              {given.trim() ? (
                <>
                  <Mark ok={accepted.some((a) => normalizeBlank(a) === normalizeBlank(given))} />
                  <b className="font-medium">{given}</b>
                </>
              ) : (
                <span className="text-muted-foreground">empty</span>
              )}
              <span className="text-muted-foreground text-xs">· accepts {accepted.join(' or ')}</span>
            </li>
          );
        })}
      </ol>
    );
  }
  if (answer.type === 'matching') {
    const chosen = new Map(answer.matches.map((m) => [m.left, m.right]));
    const rightText = new Map((item.pairs ?? []).map((pair) => [pair.rightId, pair.right]));
    return (
      <ul className="grid gap-1 text-[0.8125rem]">
        {(item.pairs ?? []).map((pair) => {
          const picked = chosen.get(pair.id);
          return (
            <li key={pair.id} className="flex flex-wrap items-center gap-2">
              {picked ? <Mark ok={picked === pair.rightId} /> : <span className="size-4" />}
              {pair.left} → {picked ? rightText.get(picked) : <span className="text-muted-foreground">no match</span>}
              {picked !== pair.rightId && <span className="text-muted-foreground text-xs">· key {pair.right}</span>}
            </li>
          );
        })}
      </ul>
    );
  }
  if (answer.type === 'ordering') {
    const right = key && 'optionIds' in key ? key.optionIds : [];
    if (answer.optionIds.length === 0) return <p className="text-muted-foreground text-[0.8125rem]">Left untouched.</p>;
    return (
      <ol className="grid gap-1 text-[0.8125rem]">
        {answer.optionIds.map((id, i) => (
          <li key={id} className="flex items-center gap-2">
            <Mark ok={right[i] === id} />
            <span className="text-muted-foreground text-xs tabular-nums">{i + 1}.</span>
            {options.get(id)}
          </li>
        ))}
        <li className="text-muted-foreground text-xs">Right order: {right.map((id) => options.get(id)).join(' → ')}</li>
      </ol>
    );
  }
  if (answer.type === 'numeric') {
    return (
      <p className="text-[0.8125rem]">
        {answer.value === null ? (
          <span className="text-muted-foreground">No answer.</span>
        ) : (
          <>
            Answered <b>{answer.value}</b>
          </>
        )}
        {key && 'value' in key && (
          <span className="text-muted-foreground">
            {' '}
            · key {key.value} ± {key.tolerance}
          </span>
        )}
      </p>
    );
  }
  if (answer.type === 'text') {
    return answer.text ? (
      <div className="bg-muted/50 rounded-md p-3 text-[0.8125rem]">
        <RichTextView doc={answer.text} />
      </div>
    ) : (
      <p className="text-muted-foreground text-[0.8125rem]">No answer.</p>
    );
  }
  return answer.files.length === 0 ? (
    <p className="text-muted-foreground text-[0.8125rem]">No files.</p>
  ) : (
    <div className="flex flex-wrap gap-3">
      {answer.files.map((file) => (
        <a
          key={file.key}
          href={`/api/files/${file.key}`}
          target="_blank"
          rel="noreferrer"
          className="ring-border hover:ring-foreground/30 grid w-40 gap-1 rounded-md p-2 text-xs ring-1"
        >
          {file.contentType === 'image/jpeg' || file.contentType === 'image/png' ? (
            // eslint-disable-next-line @next/next/no-img-element -- a student's photo, served through /api/files
            <img src={`/api/files/${file.key}`} alt="" className="bg-muted h-24 w-full rounded-sm object-cover" />
          ) : (
            <span className="bg-muted grid h-24 place-items-center rounded-sm">
              <FileIcon className="text-muted-foreground size-6" />
            </span>
          )}
          <span className="flex items-center justify-between gap-1">
            <span className="truncate">{file.fileName}</span>
            <ArrowSquareOutIcon className="text-muted-foreground size-3.5 shrink-0" />
          </span>
        </a>
      ))}
    </div>
  );
}

const Mark = ({ ok }: { ok: boolean }) =>
  ok ? <CheckIcon className="text-success size-4 shrink-0" /> : <XIcon className="text-destructive size-4 shrink-0" />;
