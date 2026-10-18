import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  FileIcon,
  LockIcon,
  XIcon,
} from '@phosphor-icons/react/ssr';
import { gradeSubmission } from '@/app/(app)/courses/[offeringId]/assessments/actions';
import { ActionForm, FieldErrors } from '@/components/action-form';
import { RichTextView } from '@/components/rich-text-view';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getSubmissionForGrading, type AnswerValue, type GradingView, type TeacherItem } from '@/lib/data/assessments';
import { assessmentPath } from '@/lib/domain/test-links';
import { formatDateTime, initials, ITEM_LABEL, statusTone } from '@/lib/format';

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
  const questions = (
    <div className="grid gap-4">
      {a.items.map((item, i) => (
        <QuestionCard key={item.id} item={item} n={i + 1} view={view} />
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
            {s.submittedAt ? `handed in ${formatDateTime(s.submittedAt)}` : 'still writing'}
            {s.late && <Badge variant="warning">Late</Badge>}
            {s.autoSubmitted && <Badge variant="secondary">By the timer</Badge>}
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
            {questions}
          </ActionForm>
        </div>
      ) : (
        <fieldset disabled>{questions}</fieldset>
      )}
    </>
  );
}

function QuestionCard({ item, n, view }: { item: TeacherItem; n: number; view: GradingView }) {
  const answer = view.submission.answers[item.id];
  const score = view.submission.scores[item.id];
  const auto = item.type === 'mcq' || item.type === 'msq' || item.type === 'numeric';
  return (
    <article className="surface grid gap-3 p-4 sm:p-5">
      <input type="hidden" name="item[]" value={item.id} />
      <header className="flex flex-wrap items-start gap-3">
        <span className="bg-muted grid size-6 shrink-0 place-items-center rounded-sm text-xs font-semibold">{n}</span>
        <div className="grid min-w-0 flex-1 gap-1 text-[0.8125rem]">
          {item.prompt && <RichTextView doc={item.prompt} />}
          <span className="text-muted-foreground text-xs">
            {ITEM_LABEL[item.type]}
            {auto ? ' · marked automatically, you can change it' : item.rubric ? ' · rubric' : ''}
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
              type="number"
              min={0}
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
        <AnswerView item={item} answer={answer} />
        {item.rubric?.map((criterion) => (
          <div key={criterion.id} className="grid gap-1">
            <label className="flex items-center justify-between gap-3 text-[0.8125rem]">
              <span>{criterion.criterion}</span>
              <span className="flex items-center gap-1.5">
                <input type="hidden" name="criterion[]" value={`${item.id}:${criterion.id}`} />
                <Input
                  name="criterionMarks[]"
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

function AnswerView({ item, answer }: { item: TeacherItem; answer: AnswerValue | undefined }) {
  const options = new Map((item.options ?? []).map((o) => [o.id, o.text]));
  const key = item.key;
  if (!answer) return <p className="text-muted-foreground text-[0.8125rem]">No answer.</p>;
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
              {correct.includes(id) ? (
                <CheckIcon className="text-success size-4" />
              ) : (
                <XIcon className="text-destructive size-4" />
              )}
              {options.get(id)}
            </p>
          ))
        )}
        <p className="text-muted-foreground text-xs">Correct: {correct.map((id) => options.get(id)).join(', ')}</p>
      </div>
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
