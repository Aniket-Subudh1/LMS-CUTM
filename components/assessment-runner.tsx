'use client';

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  CircleNotchIcon,
  ClockCountdownIcon,
  CloudCheckIcon,
  PaperPlaneTiltIcon,
  TimerIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import { saveAnswer, submitAttempt } from '@/app/(attempt)/courses/[offeringId]/assessments/[aid]/attempt/actions';
import { FileUpload } from '@/components/file-upload';
import { RichTextEditor } from '@/components/rich-text-editor';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import type { AnswerValue, AttemptDTO } from '@/lib/data/assessments';
import { ITEM_LABEL } from '@/lib/format';

type Payload = Extract<Parameters<typeof saveAnswer>[0], { answer: unknown }>['answer'];
type Item = AttemptDTO['items'][number];
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SAVE_AFTER_MS = 2_000;
const RETRY_MS = 5_000;
const WARN_MS = 5 * 60_000;

const tick = (notify: () => void) => {
  const timer = window.setInterval(notify, 1000);
  return () => window.clearInterval(timer);
};

// What the student has saved, as the runner sends it back (a written answer is the editor's JSON string).
function payloadOf(saved: AnswerValue): Payload {
  return saved.type === 'text' ? { type: 'text', text: saved.text ? JSON.stringify(saved.text) : '' } : saved;
}

const answered = (p: Payload) =>
  p.type === 'mcq'
    ? p.optionId !== null
    : p.type === 'msq'
      ? p.optionIds.length > 0
      : p.type === 'numeric'
        ? p.value !== null
        : p.type === 'text'
          ? (p.text ?? '') !== ''
          : p.files.length > 0;

const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

// T5 ("Runner B", M04 decision 4): the attempt on a page of its own. Each answer saves 2 s after its last change and
// retries until it is saved; the countdown runs on the server's clock (`serverNow` corrects this device's), and at
// 0:00 the attempt is handed in. The server keeps the real deadline (AC-M04-03): a closed tab is handed in by the
// hourly sweep. `prompts` are the questions rendered on the server; no key is ever in `attempt` (09 §10).
export function AssessmentRunner({
  attempt,
  prompts,
  serverNow,
}: {
  attempt: AttemptDTO;
  prompts: Record<string, ReactNode>;
  serverNow: number;
}) {
  const router = useRouter();
  const summary = `/courses/${attempt.offeringId}/assessments/${attempt.assessmentId}`;
  const [answers, setAnswers] = useState<Record<string, Payload>>(() =>
    Object.fromEntries(attempt.items.map((item) => [item.id, payloadOf(item.saved)])),
  );
  const [saving, setSaving] = useState<Record<string, SaveState>>({});
  const [closed, setClosed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [handingIn, setHandingIn] = useState(false);
  const timers = useRef(new Map<string, number>());
  const latest = useRef(new Map<string, Payload>());

  // This device's clock, moved onto the server's: the offset is fixed at the first snapshot after the page arrived.
  const offset = useRef<number | null>(null);
  const now = useSyncExternalStore(
    tick,
    () => {
      offset.current ??= serverNow - Date.now();
      return Math.floor((Date.now() + offset.current) / 1000);
    },
    () => 0,
  );
  const remaining = now === 0 ? null : new Date(attempt.deadlineAt).getTime() - now * 1000;

  async function save(itemId: string) {
    const payload = latest.current.get(itemId);
    if (!payload) return;
    latest.current.delete(itemId);
    setSaving((s) => ({ ...s, [itemId]: 'saving' }));
    const result = await saveAnswer({
      offeringId: attempt.offeringId,
      submissionId: attempt.submissionId,
      itemId,
      answer: payload,
    });
    if (result.ok) {
      setSaving((s) => ({ ...s, [itemId]: latest.current.has(itemId) ? 'saving' : 'saved' }));
      return;
    }
    if (result.code === 'CLOSED') {
      setClosed(result.message);
      return;
    }
    // Keep the newest answer and try again; a later change replaces it.
    if (!latest.current.has(itemId)) latest.current.set(itemId, payload);
    setSaving((s) => ({ ...s, [itemId]: 'error' }));
    schedule(itemId, RETRY_MS);
  }

  function schedule(itemId: string, delay: number) {
    window.clearTimeout(timers.current.get(itemId));
    timers.current.set(
      itemId,
      window.setTimeout(() => {
        timers.current.delete(itemId);
        void save(itemId);
      }, delay),
    );
  }

  function change(itemId: string, payload: Payload) {
    setAnswers((a) => ({ ...a, [itemId]: payload }));
    latest.current.set(itemId, payload);
    setSaving((s) => ({ ...s, [itemId]: 'saving' }));
    schedule(itemId, SAVE_AFTER_MS);
  }

  // Saves waiting for their 2 s go now: before handing in, and when the tab is hidden.
  const flush = () =>
    Promise.all(
      [...latest.current.keys()].map((itemId) => {
        window.clearTimeout(timers.current.get(itemId));
        timers.current.delete(itemId);
        return save(itemId);
      }),
    );

  // Once only: the Submit button and the timer may both get here.
  const handing = useRef(false);
  async function handIn() {
    if (handing.current) return;
    handing.current = true;
    await flush();
    setHandingIn(true);
    startTransition(async () => {
      await submitAttempt({ offeringId: attempt.offeringId, submissionId: attempt.submissionId });
    });
  }

  const timeUp = remaining !== null && remaining <= 0;
  const onTimeUp = useEffectEvent(() => void handIn());
  useEffect(() => {
    if (timeUp) onTimeUp();
  }, [timeUp]);

  const hidden = useEffectEvent(() => {
    if (document.visibilityState === 'hidden') void flush();
  });
  useEffect(() => {
    const onHide = () => hidden();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  const states = Object.values(saving);
  const status: { icon: ReactNode; text: string; tone: string } = states.includes('error')
    ? {
        icon: <WarningIcon className="size-4" />,
        text: 'Not saved — retrying. Keep this page open.',
        tone: 'text-warning',
      }
    : states.includes('saving')
      ? { icon: <CircleNotchIcon className="size-4 animate-spin" />, text: 'Saving…', tone: 'text-muted-foreground' }
      : states.includes('saved')
        ? { icon: <CloudCheckIcon className="size-4" />, text: 'All answers saved', tone: 'text-success' }
        : {
            icon: <CloudCheckIcon className="size-4" />,
            text: 'Answers save as you go',
            tone: 'text-muted-foreground',
          };
  const done = attempt.items.filter((item) => answered(answers[item.id])).length;
  const empty = attempt.items.flatMap((item, i) => (answered(answers[item.id]) ? [] : [i + 1]));
  const warn = attempt.timed && remaining !== null && remaining > 0 && remaining <= WARN_MS;

  const timer = (
    <span
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-md px-3 text-base font-semibold tabular-nums',
        warn ? 'bg-warning text-white' : 'bg-foreground text-background',
      )}
    >
      <TimerIcon className="size-4" />
      {remaining === null ? '—' : clock(remaining)}
      <span className="sr-only">left</span>
    </span>
  );
  const saveStatus = (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', status.tone)} aria-live="polite">
      {status.icon}
      {status.text}
    </span>
  );
  const questionMap = attempt.items.map((item, i) => (
    <a
      key={item.id}
      href={`#q${i + 1}`}
      aria-label={`Question ${i + 1}${answered(answers[item.id]) ? ', answered' : ''}`}
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-md text-xs font-semibold',
        answered(answers[item.id]) ? 'bg-foreground text-background' : 'ring-border ring-1',
      )}
    >
      {i + 1}
    </a>
  ));

  if (closed) {
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <div className="surface grid max-w-md gap-3 p-6 text-center">
          <h1 className="text-lg font-semibold">{closed}</h1>
          <p className="text-muted-foreground text-sm">
            You can see your marks on the assessment’s page once your teacher publishes them.
          </p>
          <Button onClick={() => router.replace(summary)}>Back to the assessment</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-dvh">
      <header className="bg-card sticky top-0 z-10 flex h-14 items-center gap-3 border-b px-3 sm:h-16 sm:px-6">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Back to the assessment (the timer keeps running)">
          <Link href={summary}>
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="grid min-w-0 flex-1 leading-tight">
          <b className="truncate text-[0.875rem] font-semibold">{attempt.title}</b>
          <span className="text-muted-foreground truncate text-xs">{attempt.offeringTitle}</span>
        </div>
        <span className="hidden sm:inline-flex">{saveStatus}</span>
        {attempt.timed && timer}
        <Button onClick={() => setConfirming(true)} disabled={handingIn}>
          {handingIn ? <CircleNotchIcon className="animate-spin" /> : <PaperPlaneTiltIcon />}
          Submit
        </Button>
      </header>
      <div className="bg-card flex items-center gap-2 overflow-x-auto border-b px-3 py-2 lg:hidden">
        {questionMap}
        <span className="ml-auto shrink-0 sm:hidden">{saveStatus}</span>
      </div>
      {warn && (
        <p
          className="bg-warning/10 text-warning flex items-center justify-center gap-2 px-4 py-2 text-[0.8125rem] font-medium"
          role="status"
        >
          <ClockCountdownIcon className="size-4 shrink-0" />
          {clock(remaining)} left. Your answers are saved; it is handed in by itself at 0:00.
        </p>
      )}
      <div className="mx-auto grid max-w-6xl items-start gap-6 p-3 sm:p-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="surface sticky top-22 hidden gap-4 p-4 lg:grid">
          <div className="grid gap-1">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Questions</span>
            <span className="text-[0.8125rem]">
              {done} of {attempt.items.length} answered
            </span>
          </div>
          <div className="flex flex-wrap gap-2">{questionMap}</div>
          <div className="text-muted-foreground grid gap-1.5 border-t pt-3 text-xs">
            {attempt.timed && (
              <span className="flex items-center gap-2">
                <TimerIcon className="size-3.5" /> Hands in by itself at 0:00
              </span>
            )}
            <span className="flex items-center gap-2">
              <CloudCheckIcon className="size-3.5" /> Saves as you go
            </span>
          </div>
        </aside>
        <main className="grid min-w-0 gap-4">
          {attempt.items.map((item, i) => (
            <Question
              key={item.id}
              item={item}
              n={i + 1}
              prompt={prompts[item.id]}
              answer={answers[item.id]}
              state={saving[item.id] ?? 'idle'}
              assessmentId={attempt.assessmentId}
              onChange={(payload) => change(item.id, payload)}
            />
          ))}
        </main>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hand in your answers?</AlertDialogTitle>
            <AlertDialogDescription>
              You answered {done} of {attempt.items.length} question{attempt.items.length === 1 ? '' : 's'}.
              {empty.length > 0 &&
                ` Question${empty.length === 1 ? '' : 's'} ${empty.join(', ')} ${empty.length === 1 ? 'is' : 'are'} empty.`}{' '}
              After you hand in, you cannot change your answers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handIn()}>Hand in</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Question({
  item,
  n,
  prompt,
  answer,
  state,
  assessmentId,
  onChange,
}: {
  item: Item;
  n: number;
  prompt: ReactNode;
  answer: Payload;
  state: SaveState;
  assessmentId: string;
  onChange: (payload: Payload) => void;
}) {
  const [typed, setTyped] = useState(() =>
    answer.type === 'numeric' && answer.value !== null ? String(answer.value) : '',
  );
  const options = item.options ?? [];
  return (
    <article id={`q${n}`} className="surface grid scroll-mt-24 gap-4 p-4 sm:p-5" aria-labelledby={`q${n}-title`}>
      <header className="flex items-start gap-3">
        <span
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-sm text-xs font-semibold',
            answered(answer) ? 'bg-foreground text-background' : 'bg-muted',
          )}
        >
          {n}
        </span>
        <div id={`q${n}-title`} className="min-w-0 flex-1 text-[0.875rem] leading-relaxed font-medium">
          {prompt}
        </div>
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          {ITEM_LABEL[item.type]} · {item.maxMarks} mark{item.maxMarks === 1 ? '' : 's'}
        </span>
      </header>
      <div className="grid gap-2 sm:pl-9">
        {answer.type === 'mcq' && (
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby={`q${n}-title`}>
            {options.map((option) => (
              <label
                key={option.id}
                className="ring-border has-checked:ring-foreground has-checked:bg-muted/50 has-focus-visible:ring-ring flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-[0.8125rem] ring-1 has-checked:ring-2"
              >
                <input
                  type="radio"
                  name={`q-${item.id}`}
                  checked={answer.optionId === option.id}
                  onChange={() => onChange({ type: 'mcq', optionId: option.id })}
                  className="accent-foreground size-4 shrink-0"
                />
                <span className="min-w-0 break-words">{option.text}</span>
              </label>
            ))}
          </div>
        )}
        {answer.type === 'msq' && (
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((option) => {
              const on = answer.optionIds.includes(option.id);
              return (
                <label
                  key={option.id}
                  className="ring-border has-checked:ring-foreground has-checked:bg-muted/50 has-focus-visible:ring-ring flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-[0.8125rem] ring-1 has-checked:ring-2"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      onChange({
                        type: 'msq',
                        optionIds: on
                          ? answer.optionIds.filter((id) => id !== option.id)
                          : [...answer.optionIds, option.id],
                      })
                    }
                    className="accent-foreground size-4 shrink-0"
                  />
                  <span className="min-w-0 break-words">{option.text}</span>
                </label>
              );
            })}
          </div>
        )}
        {answer.type === 'numeric' && (
          <Input
            type="text"
            inputMode="decimal"
            aria-label={`Answer to question ${n}`}
            value={typed}
            onChange={(event) => {
              const text = event.target.value;
              setTyped(text);
              const value = text.trim() === '' ? null : Number(text);
              if (value === null || Number.isFinite(value)) onChange({ type: 'numeric', value });
            }}
            className="w-48"
          />
        )}
        {answer.type === 'text' && (
          <RichTextEditor
            name={`q-${item.id}`}
            initial={item.saved.type === 'text' ? item.saved.text : null}
            placeholder="Write your answer…"
            onChange={(text) => onChange({ type: 'text', text })}
          />
        )}
        {answer.type === 'file' && (
          <FileUpload
            name={`q-${item.id}`}
            purpose="submission"
            contextId={assessmentId}
            multiple
            max={10}
            initial={item.saved.type === 'file' ? item.saved.files : []}
            onChange={(files) => onChange({ type: 'file', files })}
          />
        )}
        {state === 'saving' && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <CircleNotchIcon className="size-3.5 animate-spin" /> Saving…
          </p>
        )}
        {state === 'error' && (
          <p className="text-warning flex items-center gap-1.5 text-xs font-medium">
            <WarningIcon className="size-3.5" /> Not saved — retrying.
          </p>
        )}
      </div>
    </article>
  );
}
