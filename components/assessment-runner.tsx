'use client';

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CameraSlashIcon,
  ChatCircleTextIcon,
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  CircleIcon,
  CircleNotchIcon,
  ClockCountdownIcon,
  CloudCheckIcon,
  CloudSlashIcon,
  CornersOutIcon,
  DevicesIcon,
  FlagIcon,
  LockSimpleIcon,
  PaperPlaneTiltIcon,
  PlayIcon,
  ShieldCheckIcon,
  TextAaIcon,
  TimerIcon,
  WarningIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import { createUpload } from '@/app/(app)/actions';
import {
  addSnapshot,
  enterSection,
  flagItem,
  proctorBeat,
  runCode,
  saveAnswer,
  submitAttempt,
} from '@/app/(attempt)/courses/[offeringId]/assessments/[aid]/attempt/actions';
import { FileUpload } from '@/components/file-upload';
import { RichTextEditor } from '@/components/rich-text-editor';
import { openCamera, useServerSeconds } from '@/components/test-lobby';
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
import type { SampleRun } from '@/lib/data/code';
import { BEAT_MS } from '@/lib/domain/proctoring';
import { formatClock, formatTime, ITEM_LABEL, ordinal } from '@/lib/format';
import { PROCTOR_LIMITS, type ReportedEvent, type RunStatus } from '@/lib/schemas/assessment';

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

// TP-09: CodeMirror is loaded only when a code question shows (bundle size on slow connections, 03 §5).
const CodeEditor = dynamic(() => import('@/components/code-editor').then((m) => m.CodeEditor), {
  ssr: false,
  loading: () => <p className="text-muted-foreground p-4 text-sm">Loading the editor…</p>,
});

// TP-09: a code question starts in its first language, with that language's starter.
const starterOf = (item: Item, language: string) =>
  item.code?.starter.find((starter) => starter.language === language)?.source ?? '';

// What the person has saved, as the runner sends it back (a written answer is the editor's JSON string).
function payloadOf(item: Item, saved: AnswerValue): Payload {
  if (saved.type === 'text') return { type: 'text', text: saved.text ? JSON.stringify(saved.text) : '' };
  if (saved.type === 'code') {
    return saved.language ? { type: 'code', language: saved.language, source: saved.source } : emptyOf(item);
  }
  return saved;
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
    case 'code': {
      const language = item.code?.languages[0] ?? '';
      return { type: 'code', language, source: starterOf(item, language) };
    }
  }
}

// A code question's untouched starter is not an answer.
function answered(p: Payload, item: Item): boolean {
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
    case 'code':
      return p.source.trim() !== '' && p.source !== starterOf(item, p.language);
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

const never = () => () => {};
const fullscreenEvents = (notify: () => void) => {
  document.addEventListener('fullscreenchange', notify);
  return () => document.removeEventListener('fullscreenchange', notify);
};

// TP-08: this tab's name in the beat. sessionStorage keeps it through a reload; another tab or device has its own. A
// browser that refuses storage (some private windows) gets a new name on each load, so a reload there waits out the
// old name's 45 s.
function tabSession(submissionId: string): string {
  const key = `lms-tab-${submissionId}`;
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  const known = storage?.getItem(key);
  if (known) return known;
  const id = crypto.randomUUID();
  storage?.setItem(key, id);
  return id;
}

const ENDED = {
  warnings: 'Your answers were handed in: you reached the limit of serious warnings.',
  teacher: 'Your teacher ended your attempt; the answers you had saved were handed in.',
  time: 'Time is up — your answers were submitted.',
};

// The keys that open developer tools or print; on a proctored test they do nothing and are recorded.
function blockedKey(event: KeyboardEvent): ReportedEvent | null {
  const mod = event.ctrlKey || event.metaKey;
  if (event.key === 'F12' || (mod && (event.shiftKey || event.altKey) && ['KeyI', 'KeyJ', 'KeyC'].includes(event.code)))
    return 'devtools';
  if (mod && event.code === 'KeyU') return 'devtools';
  if (mod && event.code === 'KeyP') return 'print';
  return null;
}

// TP-08 (07 §15). Every attempt beats every BEAT_MS: the beat keeps a proctored attempt to one tab or device, brings
// the monitor's extra time and messages, and learns when the attempt was ended. A proctored test also watches full
// screen, leaving the page, copy, paste and right-click, printing and developer tools, and takes camera snapshots.
// Each event goes at once; the server counts them, merges close ones and decides the end.
function useProctor(
  attempt: AttemptDTO,
  video: RefObject<HTMLVideoElement | null>,
  onEnded: (message: string) => void,
) {
  const p = attempt.proctoring;
  const [deadline, setDeadline] = useState(attempt.deadlineAt);
  const [warnings, setWarnings] = useState(attempt.warnings);
  const [blocked, setBlocked] = useState(false);
  const [messages, setMessages] = useState<{ id: string; text: string; at: Date }[]>([]);
  const [cameraOn, setCameraOn] = useState<boolean | null>(null);
  const [entered, setEntered] = useState(false);
  const [refused, setRefused] = useState(false);
  const full = useSyncExternalStore(
    fullscreenEvents,
    () => document.fullscreenElement !== null,
    () => false,
  );
  const canFill = useSyncExternalStore(
    never,
    () => document.fullscreenEnabled,
    () => true,
  );
  const pending = useRef<ReportedEvent[]>([]);
  const sending = useRef(false);
  const again = useRef(false);
  const stopped = useRef(false);
  const tab = useRef<string | null>(null);
  const picking = useRef(false);
  const stream = useRef<MediaStream | null>(null);

  function stop() {
    stopped.current = true;
    stream.current?.getTracks().forEach((track) => track.stop());
    if (document.fullscreenElement) void document.exitFullscreen();
  }

  async function beat() {
    if (stopped.current) return;
    if (sending.current) {
      again.current = true;
      return;
    }
    sending.current = true;
    tab.current ??= tabSession(attempt.submissionId);
    const events = pending.current.splice(0, PROCTOR_LIMITS.perBeat);
    const result = await proctorBeat({ submissionId: attempt.submissionId, sessionId: tab.current, events }).then(
      (answer) => answer,
      () => null,
    );
    sending.current = false;
    // Not heard (offline, or too many at once): the events go again with the next beat.
    if (!result?.ok) pending.current.unshift(...events);
    else if (result.data.state === 'ended') {
      stop();
      onEnded(ENDED[result.data.endedBy ?? 'time']);
      return;
    } else {
      setWarnings(result.data.hard);
      setBlocked(result.data.state === 'blocked');
      setDeadline(result.data.deadlineAt);
      setMessages(result.data.messages);
    }
    if (again.current) {
      again.current = false;
      void beat();
    }
  }

  function report(type: ReportedEvent) {
    if (!p || stopped.current) return;
    pending.current.push(type);
    void beat();
  }

  async function snap() {
    const view = video.current;
    if (stopped.current || !view) return;
    if (!stream.current) {
      const opened = await openCamera();
      if (!opened) {
        if (cameraOn !== false) {
          setCameraOn(false);
          report('camera_off');
        }
        return;
      }
      stream.current = opened;
      opened.getVideoTracks()[0]?.addEventListener('ended', () => {
        stream.current = null;
        setCameraOn(false);
        report('camera_off');
      });
      view.srcObject = opened;
      setCameraOn(true);
      await new Promise((done) => window.setTimeout(done, 2_000));
    }
    if (view.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    canvas.getContext('2d')?.drawImage(view, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.7));
    if (!blob) return;
    // A snapshot that does not reach the server is simply missing; the next one is taken on time.
    const ticket = await createUpload({
      purpose: 'proctor-snapshot',
      contextId: attempt.submissionId,
      fileName: 'snapshot.jpg',
      contentType: 'image/jpeg',
      size: blob.size,
    }).then(
      (answer) => answer,
      () => null,
    );
    if (!ticket?.ok) return;
    const stored = await fetch(ticket.data.url, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': 'image/jpeg' },
    }).then(
      (response) => response.ok,
      () => false,
    );
    if (stored) await addSnapshot({ submissionId: attempt.submissionId, key: ticket.data.key });
  }

  function enterFullscreen() {
    setRefused(false);
    document.documentElement.requestFullscreen().then(
      () => setEntered(true),
      () => setRefused(true),
    );
  }

  const onBeat = useEffectEvent(() => void beat());
  useEffect(() => {
    const first = window.setTimeout(onBeat, 0);
    const timer = window.setInterval(onBeat, BEAT_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  const onWatch = useEffectEvent((type: ReportedEvent) => report(type));
  const onFullscreen = useEffectEvent(() => {
    if (document.fullscreenElement) setEntered(true);
    else if (entered) report('fullscreen_exit');
  });
  useEffect(() => {
    if (!p) return;
    // Blocked in the capture phase and stopped there, so a rich-text editor never sees the paste either.
    const guard = (type: ReportedEvent) => (event: Event) => {
      if (p.blockCopy) {
        event.preventDefault();
        event.stopPropagation();
      }
      onWatch(type);
    };
    const listeners: [EventTarget, string, (event: Event) => void][] = [
      [
        document,
        'visibilitychange',
        () => {
          if (document.visibilityState === 'hidden') onWatch('left_page');
        },
      ],
      // The window's own focus only: listening in the capture phase, every field and button losing focus arrives here
      // too. A file chooser takes the focus away; that is not leaving the test.
      [
        window,
        'blur',
        (event) => {
          if (event.target === window && !picking.current) onWatch('left_page');
        },
      ],
      [
        window,
        'focus',
        (event) => {
          if (event.target === window) picking.current = false;
        },
      ],
      [
        window,
        'click',
        (event) => {
          if (event.target instanceof HTMLInputElement && event.target.type === 'file') picking.current = true;
        },
      ],
      [document, 'fullscreenchange', () => onFullscreen()],
      [window, 'copy', guard('copy')],
      [window, 'cut', guard('copy')],
      [window, 'paste', guard('paste')],
      [
        window,
        'contextmenu',
        (event) => {
          if (!p.blockCopy) return;
          event.preventDefault();
          onWatch('right_click');
        },
      ],
      [window, 'beforeprint', () => onWatch('print')],
      [
        window,
        'keydown',
        (event) => {
          const blockedType = event instanceof KeyboardEvent ? blockedKey(event) : null;
          if (!blockedType) return;
          event.preventDefault();
          onWatch(blockedType);
        },
      ],
    ];
    for (const [target, type, listener] of listeners) target.addEventListener(type, listener, true);
    return () => {
      for (const [target, type, listener] of listeners) target.removeEventListener(type, listener, true);
    };
  }, [p]);

  const onSnap = useEffectEvent(() => void snap());
  useEffect(() => {
    if (!p?.camera) return;
    const first = window.setTimeout(onSnap, 0);
    const timer = window.setInterval(onSnap, p.snapshotEverySec * 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    };
  }, [p]);

  return {
    deadline,
    warnings,
    blocked,
    messages,
    cameraOn,
    // Full screen is required and not on: the gate covers the test.
    gate: Boolean(p?.fullscreen) && !full,
    canFill,
    entered,
    refused,
    enterFullscreen,
    retry: () => void beat(),
    stop,
  };
}

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
    Object.fromEntries(attempt.items.map((item) => [item.id, payloadOf(item, item.saved)])),
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
  // TP-08: the camera's picture, shown to the taker and drawn into each snapshot.
  const cameraView = useRef<HTMLVideoElement>(null);
  const proctor = useProctor(attempt, cameraView, setClosed);
  const p = attempt.proctoring;
  const readKey = `lms-attempt-${attempt.submissionId}-read`;
  const read: string[] = JSON.parse(useStored(readKey) ?? '[]');
  const message = proctor.messages.findLast((m) => !read.includes(m.id)) ?? null;
  const [seenWarnings, setSeenWarnings] = useState(attempt.warnings);
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
  const remaining = now === 0 ? null : new Date(proctor.deadline).getTime() - now * 1000;
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
    proctor.stop();
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
  const isDone = (i: Item) => answered(answers[i.id], i);
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
      {remaining === null ? '—' : formatClock(remaining)}
      <span className="sr-only">left</span>
    </span>
  );

  // TP-08: the taker's email and the time across the page, so a photo of the screen says whose it was.
  const watermark = p
    ? `url("data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='340' height='180'><text x='20' y='100' transform='rotate(-20 170 90)' font-family='sans-serif' font-size='13' fill='rgba(128,128,128,0.16)'>${escapeXml(attempt.takerEmail)} · ${now === 0 ? '' : formatTime(new Date(Math.floor(now / 60) * 60_000))}</text></svg>`,
      )}")`
    : null;
  const limit = p?.hardLimit ?? 0;

  return (
    <div
      className={cn(
        'bg-background min-h-dvh',
        p && 'print:hidden',
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
        {p && (
          <span
            className={cn(
              'hidden items-center gap-1.5 text-xs font-medium lg:inline-flex',
              proctor.warnings > 0 || proctor.cameraOn === false ? 'text-warning' : 'text-success',
            )}
          >
            {proctor.cameraOn === false ? (
              <CameraSlashIcon className="size-4" />
            ) : (
              <ShieldCheckIcon className="size-4" />
            )}
            Proctored ·{' '}
            {proctor.warnings === 0
              ? 'no warnings'
              : `${proctor.warnings}${limit > 0 ? ` of ${limit}` : ''} warning${proctor.warnings === 1 && limit === 0 ? '' : 's'}`}
            {proctor.cameraOn === false && ' · camera off'}
          </span>
        )}
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
            <b className="font-semibold tabular-nums">{formatClock(sectionLeft)}</b>
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
          {formatClock(remaining)} left. Your answers are saved; it is handed in by itself at 0:00.
        </p>
      )}
      {message && (
        <div className="bg-primary/10 flex items-center justify-center gap-3 px-4 py-2 text-[0.8125rem]" role="alert">
          <ChatCircleTextIcon className="text-primary size-4 shrink-0" />
          <span>
            <b className="font-semibold">Message from your teacher:</b> {message.text}
          </span>
          <Button
            size="xs"
            variant="outline"
            onClick={() => writeStore(readKey, JSON.stringify([...read, message.id]))}
          >
            OK
          </Button>
        </div>
      )}
      {proctor.warnings > seenWarnings && (
        <div
          className="bg-warning/10 text-warning flex items-center justify-center gap-3 px-4 py-2 text-[0.8125rem] font-medium"
          role="alert"
        >
          <WarningIcon className="size-4 shrink-0" />
          Serious warning {proctor.warnings}
          {limit > 0 && ` of ${limit}`} recorded. Stay on this page until you hand in.
          <Button size="xs" variant="outline" onClick={() => setSeenWarnings(proctor.warnings)}>
            OK
          </Button>
        </div>
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
                  value: attempt.timed && remaining !== null ? formatClock(remaining) : '—',
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
            'mx-auto grid items-start gap-6 p-3 sm:p-6',
            item.code
              ? 'max-w-[100rem]'
              : cn('lg:grid-cols-[minmax(0,1fr)_20rem]', section && passages[section.id] ? 'max-w-7xl' : 'max-w-6xl'),
          )}
        >
          <div className={cn('flex gap-2 overflow-x-auto pb-1', !item.code && 'lg:hidden')}>
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
              ((section && passages[section.id]) || item.code) && 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]',
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
                  {item.code &&
                    item.code.hidden > 0 &&
                    ` · ${item.code.hidden} hidden test${item.code.hidden === 1 ? '' : 's'}`}
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
              {!item.code && (
                <Answer
                  key={item.id}
                  item={item}
                  answer={answers[item.id]}
                  assessmentId={attempt.assessmentId}
                  onChange={(payload) => change(item.id, payload)}
                />
              )}
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
                    disabled={!answered(answers[item.id], item)}
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
            {item.code && (
              <CodePanel
                key={item.id}
                item={item}
                n={at + 1}
                answer={answers[item.id]}
                submissionId={attempt.submissionId}
                languages={attempt.languages}
                cooldownSec={attempt.runCooldownSec}
                onChange={(payload) => change(item.id, payload)}
              />
            )}
          </div>
          <aside className={cn('surface sticky top-22 hidden gap-4 p-4', !item.code && 'lg:grid')}>
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

      {watermark && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-30 select-none"
          style={{ backgroundImage: watermark }}
        />
      )}
      {p?.camera && (
        <figure className="bg-card fixed bottom-3 left-3 z-30 grid gap-1 rounded-md p-1.5 shadow-sm ring-1 ring-black/10">
          <video
            ref={cameraView}
            autoPlay
            muted
            playsInline
            className="bg-muted aspect-4/3 w-24 rounded-sm object-cover"
          />
          <figcaption className="text-muted-foreground px-0.5 text-[0.6875rem]">
            {proctor.cameraOn === false ? 'Camera off' : 'Your camera'}
          </figcaption>
        </figure>
      )}
      {(proctor.gate || proctor.blocked) && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4">
          <div className="bg-card grid w-full max-w-md justify-items-center gap-3 rounded-lg p-6 text-center shadow-lg">
            <span className="bg-warning/15 text-warning grid size-12 place-items-center rounded-full">
              {proctor.blocked ? <DevicesIcon className="size-6" /> : <WarningIcon className="size-6" />}
            </span>
            {proctor.blocked ? (
              <>
                <h2 className="text-lg font-semibold">This test is open somewhere else</h2>
                <p className="text-muted-foreground text-[0.875rem] leading-relaxed">
                  It is open in another tab or on another device. Close it there; this tab can take over a minute after
                  the other one stops. Opening it twice is recorded as a serious warning.
                </p>
                <Button className="w-full" onClick={proctor.retry}>
                  Try again
                </Button>
              </>
            ) : !proctor.canFill ? (
              <>
                <h2 className="text-lg font-semibold">This test needs full screen</h2>
                <p className="text-muted-foreground text-[0.875rem] leading-relaxed">
                  This browser cannot go full screen. Open the test on a computer; your saved answers are kept.
                </p>
                <Button asChild variant="outline" className="w-full">
                  <Link href={summary}>Back to the test</Link>
                </Button>
              </>
            ) : proctor.entered ? (
              <>
                <h2 className="text-lg font-semibold">You left full screen</h2>
                <p className="text-muted-foreground text-[0.875rem] leading-relaxed">
                  This is recorded as warning{' '}
                  <b className="text-foreground">
                    {proctor.warnings}
                    {limit > 0 && ` of ${limit}`}
                  </b>
                  .{limit > 0 && ` At the ${ordinal(limit)}, your answers are handed in for you.`} Your teacher sees
                  each warning with its time.
                </p>
                {limit > 0 && limit <= 10 && (
                  <span className="flex gap-1.5" aria-hidden>
                    {Array.from({ length: limit }, (_, i) => (
                      <span
                        key={i}
                        className={cn('h-1.5 w-12 rounded-full', i < proctor.warnings ? 'bg-warning' : 'bg-muted')}
                      />
                    ))}
                  </span>
                )}
                <Button className="w-full" onClick={proctor.enterFullscreen}>
                  <CornersOutIcon /> Return to full screen
                </Button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">This test runs in full screen</h2>
                <p className="text-muted-foreground text-[0.875rem] leading-relaxed">
                  Your time is running. Leaving full screen or this page while you write is a serious warning.
                </p>
                <Button className="w-full" onClick={proctor.enterFullscreen}>
                  <CornersOutIcon /> Enter full screen
                </Button>
              </>
            )}
            {proctor.refused && (
              <p className="text-destructive text-xs">
                The browser refused. Press F11, or allow full screen, then try again.
              </p>
            )}
          </div>
        </div>
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

const RUN_LABEL: Record<RunStatus, string> = {
  accepted: 'Passed',
  wrong_answer: 'Wrong output',
  time_limit: 'Took too long',
  compile_error: 'Did not compile',
  runtime_error: 'Stopped with an error',
  internal_error: 'Could not run',
};

// The first line of a test's text, with … when there is more.
const firstLine = (text: string) => {
  const [line = '', ...more] = text.split('\n');
  return more.some((rest) => rest.trim() !== '') ? `${line} …` : line;
};

// TP-09 (mock-up B3): a code question's language, runs left, Reset and "Run sample tests" over the editor, and below
// it the visible tests with what the last run printed. The code saves like any answer; a run saves it as well, and
// runs only the visible tests — the hidden ones are run after hand-in.
function CodePanel({
  item,
  n,
  answer,
  submissionId,
  languages,
  cooldownSec,
  onChange,
}: {
  item: Item;
  n: number;
  answer: Payload;
  submissionId: string;
  languages: AttemptDTO['languages'];
  cooldownSec: number;
  onChange: (payload: Payload) => void;
}) {
  const [runsLeft, setRunsLeft] = useState(item.code ? item.code.runLimit - item.runs : 0);
  const [running, setRunning] = useState(false);
  const [cooling, setCooling] = useState(false);
  const [outcome, setOutcome] = useState<{ results: SampleRun[] } | { error: string } | null>(null);
  const [resetting, setResetting] = useState(false);
  const code = item.code;
  if (!code || answer.type !== 'code') return null;
  const { language, source } = answer;

  // Untouched code follows the language picked; written code stays as it is.
  function pick(next: string) {
    const untouched = source.trim() === '' || source === starterOf(item, language);
    onChange({ type: 'code', language: next, source: untouched ? starterOf(item, next) : source });
  }

  async function run() {
    setRunning(true);
    setOutcome(null);
    const response = await runCode({ submissionId, itemId: item.id, language, source }).then(
      (answered) => answered,
      () => null,
    );
    setRunning(false);
    setCooling(true);
    window.setTimeout(() => setCooling(false), cooldownSec * 1000);
    if (!response) setOutcome({ error: 'Not sent. Check your connection, then run again.' });
    else if (!response.ok) setOutcome({ error: response.message });
    else {
      setOutcome({ results: response.data.results });
      setRunsLeft(response.data.runsLeft);
    }
  }

  const results = outcome && 'results' in outcome ? outcome.results : null;
  const passed = results?.filter((result) => result.status === 'accepted').length ?? 0;
  const compileError = results?.find((result) => result.status === 'compile_error');
  return (
    <section className="surface grid min-w-0 overflow-hidden" aria-label={`Your code for question ${n}`}>
      <div className="flex flex-wrap items-center gap-2 border-b p-2 sm:gap-3 sm:p-3">
        <NativeSelect
          aria-label="Language"
          value={language}
          onChange={(event) => pick(event.target.value)}
          className="w-auto"
        >
          {code.languages.map((key) => (
            <NativeSelectOption key={key} value={key}>
              {languages.find((l) => l.key === key)?.label ?? key}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <span className="text-muted-foreground text-[0.8125rem]">
          Runs left:{' '}
          <b className="text-foreground tabular-nums">
            {runsLeft} of {code.runLimit}
          </b>
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setResetting(true)}>
            <ArrowCounterClockwiseIcon /> Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void run()}
            disabled={running || cooling || runsLeft <= 0 || source.trim() === ''}
          >
            {running ? <CircleNotchIcon className="animate-spin" /> : <PlayIcon />}
            {running ? 'Running…' : 'Run sample tests'}
          </Button>
        </span>
      </div>
      <div className="h-[55dvh] min-h-80 bg-[#282c34]">
        <CodeEditor
          value={source}
          language={language}
          label={`Code for question ${n}`}
          onChange={(next) => onChange({ type: 'code', language, source: next })}
        />
      </div>
      <div className="grid gap-2 border-t p-3 sm:p-4" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[0.875rem] font-semibold">
            Sample tests
            {results && (
              <span className={cn('text-xs font-medium', passed === results.length ? 'text-success' : 'text-warning')}>
                · {passed} of {results.length} passed
              </span>
            )}
          </h3>
          {results && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {(Math.max(0, ...results.map((r) => r.timeMs ?? 0)) / 1000).toFixed(2)} s ·{' '}
              {(Math.max(0, ...results.map((r) => r.memoryKb ?? 0)) / 1024).toFixed(1)} MB
            </span>
          )}
        </div>
        {outcome && 'error' in outcome && <p className="text-destructive text-[0.8125rem]">{outcome.error}</p>}
        {compileError && (
          <pre className="bg-muted max-h-48 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">
            {compileError.error || 'Your code did not compile.'}
          </pre>
        )}
        <ul className="grid gap-2">
          {code.samples.map((sample, i) => {
            const result = results?.find((r) => r.id === sample.id);
            const ok = result?.status === 'accepted';
            return (
              <li
                key={sample.id}
                className="ring-border/70 grid gap-1 rounded-md px-3 py-2 text-[0.8125rem] ring-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {!result ? (
                    <CircleIcon className="text-muted-foreground size-4 shrink-0" />
                  ) : ok ? (
                    <CheckCircleIcon weight="fill" className="text-success size-4 shrink-0" />
                  ) : (
                    <XCircleIcon weight="fill" className="text-destructive size-4 shrink-0" />
                  )}
                  <span className="truncate font-mono" title={sample.input}>
                    Test {i + 1} · {firstLine(sample.input) || '(no input)'}
                  </span>
                </span>
                <span className="truncate" title={sample.expected}>
                  Expected <b className="font-mono">{firstLine(sample.expected)}</b>
                </span>
                <span className="truncate">
                  {!result ? (
                    <span className="text-muted-foreground">Not run yet</span>
                  ) : ok || result.status === 'wrong_answer' ? (
                    <span title={result.stdout}>
                      Yours{' '}
                      <b className={cn('font-mono', !ok && 'text-destructive')}>
                        {firstLine(result.stdout) || '(nothing)'}
                      </b>
                    </span>
                  ) : (
                    <b className="text-destructive font-medium">{RUN_LABEL[result.status]}</b>
                  )}
                </span>
                {result?.status === 'runtime_error' && result.error && (
                  <pre className="bg-muted max-h-32 overflow-auto rounded-sm p-2 text-xs whitespace-pre-wrap sm:col-span-3">
                    {result.error}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-muted-foreground text-xs">
          Your code saves as you type. When you hand in it is also tested on{' '}
          {code.hidden === 0 ? 'these tests only' : `${code.hidden} hidden test${code.hidden === 1 ? '' : 's'}`}.
        </p>
      </div>
      <AlertDialog open={resetting} onOpenChange={setResetting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start again from the starter code?</AlertDialogTitle>
            <AlertDialogDescription>
              Your code for this question is replaced and cannot be brought back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my code</AlertDialogCancel>
            <AlertDialogAction onClick={() => onChange({ type: 'code', language, source: starterOf(item, language) })}>
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

const escapeXml = (text: string) =>
  text.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' })[c] ?? c);

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
