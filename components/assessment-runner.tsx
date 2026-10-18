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
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  CircleIcon,
  CircleNotchIcon,
  ClockCountdownIcon,
  CloudCheckIcon,
  CloudSlashIcon,
  FlagIcon,
  LockSimpleIcon,
  PaperPlaneTiltIcon,
  TextAaIcon,
  TimerIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import {
  enterSection,
  flagItem,
  saveAnswer,
  submitAttempt,
} from '@/app/(attempt)/courses/[offeringId]/assessments/[aid]/attempt/actions';
import { FileUpload } from '@/components/file-upload';
import { RichTextEditor } from '@/components/rich-text-editor';
import { clock, useServerSeconds } from '@/components/test-lobby';
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { cn } from '@/lib/cn';
import type { AnswerValue, AttemptDTO } from '@/lib/data/assessments';
import { ITEM_LABEL } from '@/lib/format';

type Payload = Extract<Parameters<typeof saveAnswer>[0], { answer: unknown }>['answer'];
type Item = AttemptDTO['items'][number];
type Section = AttemptDTO['sections'][number];
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type Prefs = { size: number; contrast: boolean };

const SAVE_AFTER_MS = 2_000;
const RETRY_MS = 5_000;
const WARN_MS = 5 * 60_000;
const SIZES = [
  { zoom: 1, label: 'Normal' },
  { zoom: 1.15, label: 'Large' },
  { zoom: 1.3, label: 'Larger' },
] as const;
const LETTERS = 'ABCDEFGHIJ';
const BLANK = /_{3,}/;

// What the person has saved, as the runner sends it back (a written answer is the editor's JSON string).
function payloadOf(saved: AnswerValue): Payload {
  return saved.type === 'text' ? { type: 'text', text: saved.text ? JSON.stringify(saved.text) : '' } : saved;
}

function emptyOf(item: Item): Payload {
  switch (item.type) {
    case 'mcq':
      return { type: 'mcq', optionId: null };
    case 'msq':
    case 'ordering':
      return { type: item.type, optionIds: [] };
    case 'true_false':
      return { type: 'true_false', truth: null };
    case 'numeric':
      return { type: 'numeric', value: null };
    case 'fill_blank':
      return { type: 'fill_blank', texts: [] };
    case 'matching':
      return { type: 'matching', matches: [] };
    case 'text':
      return { type: 'text', text: '' };
    case 'file':
      return { type: 'file', files: [] };
  }
}

function answered(p: Payload): boolean {
  switch (p.type) {
    case 'mcq':
      return p.optionId !== null;
    case 'msq':
    case 'ordering':
      return p.optionIds.length > 0;
    case 'true_false':
      return p.truth !== null;
    case 'numeric':
      return p.value !== null;
    case 'fill_blank':
      return p.texts.some((text) => text.trim() !== '');
    case 'matching':
      return p.matches.length > 0;
    case 'text':
      return (p.text ?? '') !== '';
    case 'file':
      return p.files.length > 0;
  }
}

// TP-07: this device keeps answers not yet sent (a lost connection, a reload while offline) and the reading
// preferences. A browser that refuses storage (some private windows) keeps them only in memory: `null` here.
function deviceStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
const STORE_EVENT = 'lms-runner-store';
const watchStore = (notify: () => void) => {
  window.addEventListener(STORE_EVENT, notify);
  window.addEventListener('storage', notify);
  return () => {
    window.removeEventListener(STORE_EVENT, notify);
    window.removeEventListener('storage', notify);
  };
};
function writeStore(key: string, value: string | null) {
  const storage = deviceStorage();
  if (!storage) return;
  if (value === null) storage.removeItem(key);
  else storage.setItem(key, value);
  window.dispatchEvent(new Event(STORE_EVENT));
}
function useStored(key: string): string | null {
  return useSyncExternalStore(
    watchStore,
    () => deviceStorage()?.getItem(key) ?? null,
    () => null,
  );
}
const onlineEvents = (notify: () => void) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
};

// TP-07 ("Runner A", M04b decision 5): one question at a time on a page of its own. Sections are tabs (a "no going
// back" one closes when left, a timed one at its time — the server decides both); the question map flags questions
// for review; a review page comes before handing in. Each answer saves 2 s after its last change and retries until
// saved, kept on this device while offline; the seconds spent on each question go with its saves. The countdown runs
// on the server's clock, and at 0:00 the attempt is handed in. `prompts` and `passages` are rendered on the server;
// no key is ever in `attempt` (09 §10).
export function AssessmentRunner({
  attempt,
  prompts,
  passages,
  serverNow,
}: {
  attempt: AttemptDTO;
  prompts: Record<string, ReactNode>;
  passages: Record<string, ReactNode>;
  serverNow: number;
}) {
  const router = useRouter();
  const summary = attempt.path;
  const sections = attempt.sections;
  const backupKey = `lms-attempt-${attempt.submissionId}`;
  const [answers, setAnswers] = useState<Record<string, Payload>>(() =>
    Object.fromEntries(attempt.items.map((item) => [item.id, payloadOf(item.saved)])),
  );
  const [saving, setSaving] = useState<Record<string, SaveState>>({});
  const [flags, setFlags] = useState(() => new Set(attempt.flags));
  const [sectionId, setSectionId] = useState(attempt.currentSectionId);
  const [at, setAt] = useState(0);
  const [view, setView] = useState<'question' | 'review'>('question');
  const [closed, setClosed] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'hand-in' } | { kind: 'leave'; to: string } | null>(null);
  const [handingIn, setHandingIn] = useState(false);
  const timers = useRef(new Map<string, number>());
  const latest = useRef(new Map<string, Payload>());
  const spent = useRef(new Map<string, number>());
  const shownAt = useRef<{ itemId: string; at: number } | null>(null);
  const online = useSyncExternalStore(
    onlineEvents,
    () => navigator.onLine,
    () => true,
  );
  const storedPrefs = useStored('lms-runner-prefs');
  const prefs: Prefs = storedPrefs ? JSON.parse(storedPrefs) : { size: 0, contrast: false };
  const setPrefs = (next: Prefs) => writeStore('lms-runner-prefs', JSON.stringify(next));
  const backup = useStored(backupKey);

  const now = useServerSeconds(serverNow);
  const remaining = now === 0 ? null : new Date(attempt.deadlineAt).getTime() - now * 1000;
  const section = sections.find((s) => s.id === sectionId) ?? null;
  const sectionLeft = now === 0 || !section?.closesAt ? null : new Date(section.closesAt).getTime() - now * 1000;
  const visible = section ? attempt.items.filter((item) => item.sectionId === section.id) : attempt.items;
  const item: Item | undefined = visible[Math.min(at, visible.length - 1)];

  function keepOnDevice(itemId: string, payload: Payload | null) {
    const pending: Record<string, Payload> = backup ? JSON.parse(backup) : {};
    if (payload) pending[itemId] = payload;
    else delete pending[itemId];
    writeStore(backupKey, Object.keys(pending).length > 0 ? JSON.stringify(pending) : null);
  }

  // Seconds on the question shown so far (on the runner's clock), added to what it will send next.
  function noteTime() {
    const shown = shownAt.current;
    if (!shown) return;
    spent.current.set(shown.itemId, (spent.current.get(shown.itemId) ?? 0) + Math.max(0, now - shown.at));
    shownAt.current = null;
  }

  async function save(itemId: string) {
    const payload = latest.current.get(itemId);
    if (!payload) return;
    latest.current.delete(itemId);
    const seconds = Math.min(600, spent.current.get(itemId) ?? 0);
    spent.current.delete(itemId);
    setSaving((s) => ({ ...s, [itemId]: 'saving' }));
    const result = await saveAnswer({ submissionId: attempt.submissionId, itemId, answer: payload, spentSec: seconds });
    if (result.ok) {
      if (!latest.current.has(itemId)) keepOnDevice(itemId, null);
      setSaving((s) => ({ ...s, [itemId]: latest.current.has(itemId) ? 'saving' : 'saved' }));
      return;
    }
    if (result.code === 'CLOSED') {
      keepOnDevice(itemId, null);
      if (result.message.startsWith('This section is closed')) {
        setNotice(result.message);
        setSaving((s) => ({ ...s, [itemId]: 'idle' }));
        router.refresh();
      } else setClosed(result.message);
      return;
    }
    // Keep the newest answer and try again; a later change replaces it.
    if (!latest.current.has(itemId)) latest.current.set(itemId, payload);
    spent.current.set(itemId, (spent.current.get(itemId) ?? 0) + seconds);
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
    keepOnDevice(itemId, payload);
    setSaving((s) => ({ ...s, [itemId]: 'saving' }));
    schedule(itemId, SAVE_AFTER_MS);
  }

  // Saves waiting for their 2 s go now: before handing in, moving section, and when the tab is hidden.
  const flush = () =>
    Promise.all(
      [...latest.current.keys()].map((itemId) => {
        window.clearTimeout(timers.current.get(itemId));
        timers.current.delete(itemId);
        return save(itemId);
      }),
    );

  // Leaving a question sends its time with an unchanged answer too, so time per question adds up (TP-07).
  function leaveQuestion() {
    noteTime();
    if (item && (spent.current.get(item.id) ?? 0) >= 5 && !latest.current.has(item.id)) {
      latest.current.set(item.id, answers[item.id]);
      schedule(item.id, 0);
    }
  }

  function show(index: number) {
    leaveQuestion();
    setNotice(null);
    setView('question');
    setAt(index);
  }

  async function moveTo(to: string, index = 0) {
    leaveQuestion();
    await flush();
    const result = await enterSection({ submissionId: attempt.submissionId, sectionId: to });
    if (!result.ok) {
      setNotice(result.message);
      router.refresh();
      return;
    }
    setNotice(null);
    setSectionId(to);
    setAt(index);
    setView('question');
    router.refresh();
  }

  function requestSection(to: string, index = 0) {
    if (to === sectionId) return show(index);
    if (section?.locked) setConfirm({ kind: 'leave', to });
    else void moveTo(to, index);
  }

  const toggleFlag = (itemId: string) => {
    const on = !flags.has(itemId);
    setFlags((current) => {
      const next = new Set(current);
      if (on) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
    void flagItem({ submissionId: attempt.submissionId, itemId, flagged: on });
  };

  // Once only: the Submit button and the timer may both get here.
  const handing = useRef(false);
  async function handIn() {
    if (handing.current) return;
    handing.current = true;
    noteTime();
    await flush();
    setHandingIn(true);
    startTransition(async () => {
      await submitAttempt({ submissionId: attempt.submissionId });
      writeStore(backupKey, null);
    });
  }

  const timeUp = remaining !== null && remaining <= 0;
  const onTimeUp = useEffectEvent(() => void handIn());
  useEffect(() => {
    if (timeUp) onTimeUp();
  }, [timeUp]);

  // A timed section that runs out moves on to the next section, or to the review page after the last.
  const sectionUp = sectionLeft !== null && sectionLeft <= 0;
  async function openReview() {
    leaveQuestion();
    await flush();
    setView('review');
    router.refresh();
  }
  async function sectionTimeUp() {
    const next = sections[sections.findIndex((s) => s.id === sectionId) + 1];
    if (next && next.state !== 'closed') await moveTo(next.id);
    else await openReview();
  }
  const onSectionUp = useEffectEvent(() => void sectionTimeUp());
  useEffect(() => {
    if (!sectionUp) return;
    const timer = window.setTimeout(onSectionUp, 0);
    return () => window.clearTimeout(timer);
  }, [sectionUp]);

  // Answers this device kept while offline (or before a reload) are sent again once.
  const onBackup = useEffectEvent(() => {
    const pending: Record<string, Payload> = backup ? JSON.parse(backup) : {};
    for (const [itemId, payload] of Object.entries(pending)) {
      if (attempt.items.some((i) => i.id === itemId)) change(itemId, payload);
    }
  });
  const replayed = useRef(false);
  useEffect(() => {
    if (replayed.current || backup === null) return;
    replayed.current = true;
    onBackup();
  }, [backup]);

  const onReconnect = useEffectEvent(() => void flush());
  useEffect(() => {
    if (online) onReconnect();
  }, [online]);

  // The question now shown starts its clock (once the clock has its first reading).
  const shownId = view === 'question' && now > 0 ? (item?.id ?? null) : null;
  const onShown = useEffectEvent((id: string | null) => {
    shownAt.current = id ? { itemId: id, at: now } : null;
  });
  useEffect(() => {
    onShown(shownId);
  }, [shownId]);

  const hidden = useEffectEvent(() => {
    if (document.visibilityState === 'hidden') {
      noteTime();
      void flush();
    }
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
  const status: { icon: ReactNode; text: string; tone: string } = !online
    ? {
        icon: <CloudSlashIcon className="size-4" />,
        text: 'Offline — answers are kept on this device',
        tone: 'text-warning',
      }
    : states.includes('error')
      ? { icon: <WarningIcon className="size-4" />, text: 'Not saved — retrying', tone: 'text-warning' }
      : states.includes('saving')
        ? { icon: <CircleNotchIcon className="size-4 animate-spin" />, text: 'Saving…', tone: 'text-muted-foreground' }
        : { icon: <CloudCheckIcon className="size-4" />, text: 'Saved', tone: 'text-success' };
  const isDone = (i: Item) => answered(answers[i.id]);
  const done = attempt.items.filter(isDone).length;
  const flagged = attempt.items.filter((i) => flags.has(i.id)).length;
  const warn = attempt.timed && remaining !== null && remaining > 0 && remaining <= WARN_MS;
  const sectionIndex = sections.findIndex((s) => s.id === sectionId);
  const nextSection = sections[sectionIndex + 1] ?? null;
  const prevSection = sections[sectionIndex - 1] ?? null;
  const groups: { section: Section | null; items: Item[] }[] =
    sections.length > 0
      ? sections.map((s) => ({ section: s, items: attempt.items.filter((i) => i.sectionId === s.id) }))
      : [{ section: null, items: attempt.items }];

  if (closed) {
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <div className="surface grid max-w-md gap-3 p-6 text-center">
          <h1 className="text-lg font-semibold">{closed}</h1>
          <p className="text-muted-foreground text-sm">Your marks appear on the test’s page once they are published.</p>
          <Button onClick={() => router.replace(summary)}>Back to the test</Button>
        </div>
      </div>
    );
  }

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

  return (
    <div
      className={cn(
        'bg-background min-h-dvh',
        prefs.contrast &&
          'bg-white text-black [&_.ring-border]:ring-black/60 [&_.surface]:ring-black/60 [&_.text-muted-foreground]:text-black',
      )}
    >
      <header className="bg-card sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-3 sm:h-16 sm:gap-3 sm:px-6">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Back to the test's page (the timer keeps running)">
          <Link href={summary}>
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="grid min-w-0 flex-1 leading-tight">
          <b className="truncate text-[0.875rem] font-semibold">{attempt.title}</b>
          <span className="text-muted-foreground truncate text-xs">{attempt.takerName}</span>
        </div>
        <span
          className={cn('hidden items-center gap-1.5 text-xs font-medium md:inline-flex', status.tone)}
          aria-live="polite"
        >
          {status.icon}
          {status.text}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label="Text size and contrast">
              <TextAaIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Text size</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={String(prefs.size)}
              onValueChange={(value) => setPrefs({ ...prefs, size: Number(value) })}
            >
              {SIZES.map((size, i) => (
                <DropdownMenuRadioItem key={size.label} value={String(i)}>
                  {size.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={prefs.contrast}
              onCheckedChange={(checked) => setPrefs({ ...prefs, contrast: checked })}
            >
              High contrast
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {sectionLeft !== null && (
          <span className="ring-border hidden h-9 items-center gap-2 rounded-md px-3 text-sm ring-1 sm:inline-flex">
            <span className="text-muted-foreground">Section</span>
            <b className="font-semibold tabular-nums">{clock(sectionLeft)}</b>
          </span>
        )}
        {attempt.timed && timer}
        <Button onClick={() => void openReview()} disabled={handingIn} aria-label="Submit">
          {handingIn ? <CircleNotchIcon className="animate-spin" /> : <PaperPlaneTiltIcon />}
          <span className="hidden sm:inline">Submit</span>
        </Button>
      </header>

      {sections.length > 0 && (
        <nav aria-label="Sections" className="bg-card flex items-center gap-1 overflow-x-auto border-b px-3 sm:px-6">
          {sections.map((s) => {
            const current = s.id === sectionId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => requestSection(s.id)}
                disabled={s.state === 'closed' && !current}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2 border-b-2 px-2 py-3 text-[0.8125rem] font-medium whitespace-nowrap disabled:opacity-50',
                  current ? 'border-foreground' : 'text-muted-foreground border-transparent',
                )}
              >
                {s.state === 'closed' && <LockSimpleIcon className="size-3.5" />}
                {s.title}
                <span className="bg-muted rounded-sm px-1.5 text-xs tabular-nums">{s.questions}</span>
              </button>
            );
          })}
          {sections.some((s) => s.locked) && (
            <span className="text-muted-foreground ml-auto hidden shrink-0 items-center gap-1.5 text-xs sm:flex">
              <LockSimpleIcon className="size-3.5" /> Some sections have no going back
            </span>
          )}
        </nav>
      )}

      {warn && (
        <p
          className="bg-warning/10 text-warning flex items-center justify-center gap-2 px-4 py-2 text-[0.8125rem] font-medium"
          role="status"
        >
          <ClockCountdownIcon className="size-4 shrink-0" />
          {clock(remaining)} left. Your answers are saved; it is handed in by itself at 0:00.
        </p>
      )}
      {notice && (
        <p className="bg-muted flex items-center justify-center gap-2 px-4 py-2 text-[0.8125rem]" role="status">
          <LockSimpleIcon className="size-4 shrink-0" />
          {notice}
        </p>
      )}

      {view === 'review' ? (
        <div className="mx-auto grid max-w-4xl gap-4 p-3 sm:p-6">
          <section className="surface grid gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-1">
                <h1 className="text-[1.0625rem] font-semibold">Review before you hand in</h1>
                <p className="text-muted-foreground text-[0.8125rem]">
                  Open any question to change it. Sections that are closed cannot change.
                </p>
              </div>
              <Button onClick={() => setConfirm({ kind: 'hand-in' })} disabled={handingIn}>
                <PaperPlaneTiltIcon /> Hand in now
              </Button>
            </div>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { icon: CheckCircleIcon, value: String(done), label: 'Answered', tone: '' },
                { icon: FlagIcon, value: String(flagged), label: 'Flagged', tone: flagged > 0 ? 'text-warning' : '' },
                { icon: CircleIcon, value: String(attempt.items.length - done), label: 'Not answered', tone: '' },
                {
                  icon: TimerIcon,
                  value: attempt.timed && remaining !== null ? clock(remaining) : '—',
                  label: 'Time left',
                  tone: '',
                },
              ].map((tile) => (
                <div key={tile.label} className="ring-border/70 flex items-center gap-3 rounded-md px-3.5 py-3 ring-1">
                  <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md">
                    <tile.icon className="size-4.5" />
                  </span>
                  <div className="grid min-w-0">
                    <dd className={cn('text-lg leading-tight font-semibold tabular-nums', tile.tone)}>{tile.value}</dd>
                    <dt className="text-muted-foreground order-first truncate text-xs">{tile.label}</dt>
                  </div>
                </div>
              ))}
            </dl>
          </section>
          {groups.map((group) => (
            <section key={group.section?.id ?? 'all'} className="surface grid gap-3 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
                  {group.section?.state === 'closed' && <LockSimpleIcon className="size-4" />}
                  {group.section?.title ?? 'Questions'}
                </h2>
                <span className="text-muted-foreground text-xs">
                  {group.items.filter(isDone).length} of {group.items.length} answered
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {group.items.map((i, n) => (
                  <MapButton
                    key={i.id}
                    n={n + 1}
                    done={isDone(i)}
                    flagged={flags.has(i.id)}
                    current={false}
                    disabled={group.section?.state === 'closed' && group.section.id !== sectionId}
                    onPick={() => (group.section ? requestSection(group.section.id, n) : show(n))}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : item ? (
        <div
          className={cn(
            'mx-auto grid items-start gap-6 p-3 sm:p-6 lg:grid-cols-[minmax(0,1fr)_20rem]',
            section && passages[section.id] ? 'max-w-7xl' : 'max-w-6xl',
          )}
        >
          <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {visible.map((i, n) => (
              <MapButton
                key={i.id}
                n={n + 1}
                done={isDone(i)}
                flagged={flags.has(i.id)}
                current={n === at}
                onPick={() => show(n)}
              />
            ))}
          </div>
          <div
            className={cn(
              'grid min-w-0 items-start gap-4',
              section && passages[section.id] && 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]',
            )}
            style={{ zoom: SIZES[prefs.size]?.zoom ?? 1 }}
          >
            {section && passages[section.id] && (
              <aside className="surface bg-muted/40 max-h-[70dvh] overflow-y-auto p-4 text-[0.875rem] leading-relaxed sm:p-5">
                {passages[section.id]}
              </aside>
            )}
            <article className="surface grid gap-4 p-4 sm:p-6" aria-labelledby={`q-${item.id}-title`}>
              <header className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  <b className="text-foreground font-semibold tracking-wide uppercase">
                    Question {at + 1} of {visible.length}
                  </b>{' '}
                  · {ITEM_LABEL[item.type]} · {item.maxMarks} mark{item.maxMarks === 1 ? '' : 's'}
                  {item.negativeMarks > 0 && ` · −${item.negativeMarks} if wrong`}
                  {item.partialCredit && ' · part marks'}
                </p>
                <Button
                  variant={flags.has(item.id) ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => toggleFlag(item.id)}
                  aria-pressed={flags.has(item.id)}
                >
                  <FlagIcon weight={flags.has(item.id) ? 'fill' : 'regular'} />
                  {flags.has(item.id) ? 'Flagged' : 'Flag for review'}
                </Button>
              </header>
              <div id={`q-${item.id}-title`} className="text-[0.9375rem] leading-relaxed font-medium">
                {prompts[item.id]}
              </div>
              <Answer
                key={item.id}
                item={item}
                answer={answers[item.id]}
                assessmentId={attempt.assessmentId}
                onChange={(payload) => change(item.id, payload)}
              />
              {saving[item.id] === 'error' && (
                <p className="text-warning flex items-center gap-1.5 text-xs font-medium">
                  <WarningIcon className="size-3.5" /> Not saved — retrying.
                </p>
              )}
              <footer className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button
                  variant="outline"
                  disabled={at === 0 && !(prevSection && prevSection.state !== 'closed' && !section?.locked)}
                  onClick={() =>
                    at > 0
                      ? show(at - 1)
                      : prevSection &&
                        requestSection(
                          prevSection.id,
                          attempt.items.filter((i) => i.sectionId === prevSection.id).length - 1,
                        )
                  }
                >
                  <ArrowLeftIcon /> Previous
                </Button>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!answered(answers[item.id])}
                    onClick={() => change(item.id, emptyOf(item))}
                  >
                    Clear answer
                  </Button>
                  <Button
                    onClick={() =>
                      at < visible.length - 1
                        ? show(at + 1)
                        : nextSection && nextSection.state !== 'closed'
                          ? requestSection(nextSection.id)
                          : void openReview()
                    }
                  >
                    {at < visible.length - 1 ? 'Save and next' : nextSection ? 'Next section' : 'Review answers'}
                    <ArrowRightIcon />
                  </Button>
                </div>
              </footer>
            </article>
          </div>
          <aside className="surface sticky top-22 hidden gap-4 p-4 lg:grid">
            <div className="grid gap-1">
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {section?.title ?? 'Questions'}
              </span>
              <span className="text-[0.8125rem]">
                {visible.filter(isDone).length} answered · {visible.filter((i) => flags.has(i.id)).length} flagged ·{' '}
                {visible.length - visible.filter(isDone).length} left
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {visible.map((i, n) => (
                <MapButton
                  key={i.id}
                  n={n + 1}
                  done={isDone(i)}
                  flagged={flags.has(i.id)}
                  current={n === at}
                  onPick={() => show(n)}
                />
              ))}
            </div>
            <ul className="text-muted-foreground grid grid-cols-2 gap-2 text-xs">
              <li className="flex items-center gap-2">
                <span className="bg-foreground size-3 rounded-sm" /> Answered
              </li>
              <li className="flex items-center gap-2">
                <span className="bg-warning/40 size-3 rounded-sm" /> Flagged
              </li>
              <li className="flex items-center gap-2">
                <span className="ring-border size-3 rounded-sm ring-1" /> Not answered
              </li>
              <li className="flex items-center gap-2">
                <span className="ring-primary size-3 rounded-sm ring-2" /> Current
              </li>
            </ul>
            <Button variant="outline" onClick={() => void openReview()}>
              Review all answers
            </Button>
          </aside>
        </div>
      ) : (
        <p className="text-muted-foreground p-6 text-center text-sm">This section has no questions.</p>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          {confirm?.kind === 'leave' ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Leave “{section?.title}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  This section has no going back: once you leave it, its answers cannot change.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Stay</AlertDialogCancel>
                <AlertDialogAction onClick={() => void moveTo(confirm.to)}>Leave the section</AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Hand in your answers?</AlertDialogTitle>
                <AlertDialogDescription>
                  You answered {done} of {attempt.items.length} question{attempt.items.length === 1 ? '' : 's'}
                  {flagged > 0 && `, and ${flagged} ${flagged === 1 ? 'is' : 'are'} flagged for review`}. After you hand
                  in, you cannot change your answers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep working</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handIn()}>Hand in</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const CHOICE =
  'ring-border has-checked:ring-foreground has-checked:bg-muted/50 has-focus-visible:ring-ring flex cursor-pointer items-center gap-3 rounded-md px-3.5 py-3 text-[0.875rem] ring-1 has-checked:ring-2';
const BADGE =
  'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ring-1 ring-border [:checked+&]:bg-foreground [:checked+&]:text-background [:checked+&]:ring-foreground';

// One question's answer, by its type (TP-06).
function Answer({
  item,
  answer,
  assessmentId,
  onChange,
}: {
  item: Item;
  answer: Payload;
  assessmentId: string;
  onChange: (payload: Payload) => void;
}) {
  const [typed, setTyped] = useState(() =>
    answer.type === 'numeric' && answer.value !== null ? String(answer.value) : '',
  );
  const options = item.options ?? [];
  const label = `q-${item.id}-title`;
  switch (answer.type) {
    case 'mcq':
      return (
        <div className="grid gap-2" role="radiogroup" aria-labelledby={label}>
          {options.map((option, i) => (
            <label key={option.id} className={CHOICE}>
              <input
                type="radio"
                name={`q-${item.id}`}
                checked={answer.optionId === option.id}
                onChange={() => onChange({ type: 'mcq', optionId: option.id })}
                className="sr-only"
              />
              <span className={BADGE}>{LETTERS[i]}</span>
              <span className="min-w-0 wrap-break-word">{option.text}</span>
            </label>
          ))}
        </div>
      );
    case 'msq':
      return (
        <div className="grid gap-2" role="group" aria-labelledby={label}>
          <p className="text-muted-foreground text-xs">Tick every answer that is right.</p>
          {options.map((option) => {
            const on = answer.optionIds.includes(option.id);
            return (
              <label key={option.id} className={CHOICE}>
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
                <span className="min-w-0 wrap-break-word">{option.text}</span>
              </label>
            );
          })}
        </div>
      );
    case 'true_false':
      return (
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby={label}>
          {[true, false].map((truth) => (
            <label key={String(truth)} className={CHOICE}>
              <input
                type="radio"
                name={`q-${item.id}`}
                checked={answer.truth === truth}
                onChange={() => onChange({ type: 'true_false', truth })}
                className="sr-only"
              />
              <span className={BADGE}>{truth ? 'T' : 'F'}</span>
              {truth ? 'True' : 'False'}
            </label>
          ))}
        </div>
      );
    case 'numeric':
      return (
        <Input
          type="text"
          inputMode="decimal"
          aria-labelledby={label}
          value={typed}
          onChange={(event) => {
            const text = event.target.value;
            setTyped(text);
            const value = text.trim() === '' ? null : Number(text);
            if (value === null || Number.isFinite(value)) onChange({ type: 'numeric', value });
          }}
          className="w-48"
        />
      );
    case 'fill_blank': {
      const parts = (item.template ?? '').split(BLANK);
      return (
        <p className="text-[0.9375rem] leading-[2.4]">
          {parts.map((part, i) => (
            <span key={i}>
              {part}
              {i < parts.length - 1 && (
                <input
                  aria-label={`Blank ${i + 1}`}
                  value={answer.texts[i] ?? ''}
                  onChange={(event) => {
                    const texts = Array.from({ length: parts.length - 1 }, (_, j) => answer.texts[j] ?? '');
                    texts[i] = event.target.value;
                    onChange({ type: 'fill_blank', texts });
                  }}
                  maxLength={200}
                  className="border-foreground/40 focus:border-foreground mx-1 w-40 border-b-2 bg-transparent px-1 font-medium outline-none"
                />
              )}
            </span>
          ))}
        </p>
      );
    }
    case 'matching': {
      const pairs = item.pairs ?? { lefts: [], rights: [] };
      const chosen = new Map(answer.matches.map((m) => [m.left, m.right]));
      return (
        <div className="grid gap-2">
          {pairs.lefts.map((left) => (
            <div
              key={left.id}
              className="grid items-center gap-2 **:data-[slot=native-select-wrapper]:w-full sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
            >
              <span className="ring-border rounded-md px-3.5 py-2.5 text-[0.875rem] ring-1">{left.text}</span>
              <ArrowRightIcon className="text-muted-foreground hidden size-4 sm:block" />
              <NativeSelect
                aria-label={`Match for ${left.text}`}
                className="w-full"
                value={chosen.get(left.id) ?? ''}
                onChange={(event) => {
                  const next = new Map(chosen);
                  if (event.target.value) next.set(left.id, event.target.value);
                  else next.delete(left.id);
                  onChange({ type: 'matching', matches: [...next].map(([l, right]) => ({ left: l, right })) });
                }}
              >
                <NativeSelectOption value="">Choose one</NativeSelectOption>
                {pairs.rights.map((right) => (
                  <NativeSelectOption key={right.id} value={right.id}>
                    {right.text}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          ))}
        </div>
      );
    }
    case 'ordering': {
      const order = answer.optionIds.length > 0 ? answer.optionIds : options.map((o) => o.id);
      const textOf = new Map(options.map((o) => [o.id, o.text]));
      const move = (from: number, to: number) => {
        const next = [...order];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        onChange({ type: 'ordering', optionIds: next });
      };
      return (
        <div className="grid gap-2">
          <ol className="grid gap-2">
            {order.map((id, i) => (
              <li key={id} className="ring-border flex items-center gap-3 rounded-md px-3 py-2 text-[0.875rem] ring-1">
                <span className="bg-muted grid size-6 shrink-0 place-items-center rounded-sm text-xs font-semibold">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 wrap-break-word">{textOf.get(id)}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  aria-label={`Move “${textOf.get(id)}” up`}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === order.length - 1}
                  onClick={() => move(i, i + 1)}
                  aria-label={`Move “${textOf.get(id)}” down`}
                >
                  <ArrowDownIcon />
                </Button>
              </li>
            ))}
          </ol>
          <p className="text-muted-foreground text-xs">
            {answer.optionIds.length > 0
              ? 'Your order is saved.'
              : 'Put the steps in order. Nothing is saved until you move one.'}
          </p>
        </div>
      );
    }
    case 'text':
      return (
        <RichTextEditor
          name={`q-${item.id}`}
          initial={item.saved.type === 'text' ? item.saved.text : null}
          placeholder="Write your answer…"
          onChange={(text) => onChange({ type: 'text', text })}
        />
      );
    case 'file':
      return (
        <FileUpload
          name={`q-${item.id}`}
          purpose="submission"
          contextId={assessmentId}
          multiple
          max={10}
          initial={item.saved.type === 'file' ? item.saved.files : []}
          onChange={(files) => onChange({ type: 'file', files })}
        />
      );
  }
}

// One question on the map (TP-07): answered, flagged for review, or not yet; the current one ringed.
function MapButton({
  n,
  done,
  flagged,
  current,
  disabled = false,
  onPick,
}: {
  n: number;
  done: boolean;
  flagged: boolean;
  current: boolean;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-label={`Question ${n}${done ? ', answered' : ''}${flagged ? ', flagged' : ''}${current ? ', current' : ''}`}
      aria-current={current ? 'step' : undefined}
      className={cn(
        'relative grid size-9 shrink-0 place-items-center rounded-md text-xs font-semibold transition-colors disabled:opacity-40',
        flagged
          ? 'bg-warning/15 text-warning ring-warning/40 ring-1'
          : done
            ? 'bg-foreground text-background'
            : 'bg-card ring-border ring-1',
        current && 'ring-primary ring-2',
      )}
    >
      {n}
      {flagged && (
        <FlagIcon
          weight="fill"
          className="bg-card text-warning absolute -top-1.5 -right-1.5 size-3.5 rounded-full p-px"
        />
      )}
    </button>
  );
}
