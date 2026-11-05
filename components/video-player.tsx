'use client';

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  ArrowClockwiseIcon,
  CheckIcon,
  CircleNotchIcon,
  ClockClockwiseIcon,
  ClockCounterClockwiseIcon,
  CornersInIcon,
  CornersOutIcon,
  GearSixIcon,
  PauseIcon,
  PictureInPictureIcon,
  PlayIcon,
  SpeakerHighIcon,
  SpeakerLowIcon,
  SpeakerSlashIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/cn';

type Quality = 'hd' | 'low';
type Range = [number, number];
type Flash = { id: number; side: 'left' | 'center' | 'right'; icon: ReactNode; text?: string };

const STORED = 'lms-video-quality';
const STORED_SPEED = 'lms-video-speed';
const STORED_VOLUME = 'lms-video-volume';
const PHONE = '(max-width: 767px)';
const BEACON_MS = 30_000;
const HIDE_MS = 2_800;
const DOUBLE_TAP_MS = 300;
const SKIP_SEC = 10;
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const QUALITIES = [
  { key: 'hd', label: 'HD', hint: 'best picture' },
  { key: 'low', label: 'Data saver', hint: '480p, for mobile data' },
] as const;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Storage can be blocked (private mode); the default applies.
    return null;
  }
}

function remember(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked (private mode); the choice lasts for this page.
  }
}

function storedQuality(): Quality | null {
  const value = read(STORED);
  return value === 'hd' || value === 'low' ? value : null;
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(PHONE);
  media.addEventListener('change', onChange);
  window.addEventListener('storage', onChange);
  return () => {
    media.removeEventListener('change', onChange);
    window.removeEventListener('storage', onChange);
  };
}

// 08 §5: a phone starts in Data saver unless the viewer chose otherwise (NFR-07, AC-M02-09).
const deviceQuality = (): Quality => storedQuality() ?? (window.matchMedia(PHONE).matches ? 'low' : 'hd');
const noSubscription = () => () => {};

function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(total % 60)}` : `${minutes}:${pad(total % 60)}`;
}

function bufferedEnd(node: HTMLVideoElement): number {
  for (let i = 0; i < node.buffered.length; i++) {
    if (node.buffered.start(i) <= node.currentTime && node.currentTime <= node.buffered.end(i)) {
      return node.buffered.end(i);
    }
  }
  return 0;
}

// A slider that a finger or a mouse can drag anywhere along (a native range only follows its thumb on an iPhone), over a
// real range input for the keyboard and screen readers.
function Slider({
  label,
  value,
  max,
  step,
  text,
  buffered = 0,
  tip,
  onDrag,
  onDone,
  className,
}: {
  label: string;
  value: number;
  max: number;
  step: number;
  text: string;
  buffered?: number;
  tip?: (value: number) => string;
  onDrag?: (value: number) => void;
  onDone: (value: number) => void;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const share = (n: number) => (max > 0 ? Math.min(100, (100 * n) / max) : 0);
  const at = (event: PointerEvent<HTMLDivElement>) => {
    const { left, width } = event.currentTarget.getBoundingClientRect();
    return max * Math.min(1, Math.max(0, (event.clientX - left) / width));
  };
  return (
    <div
      className={cn('group/slider relative flex h-5 cursor-pointer touch-none items-center', className)}
      onPointerDown={(event) => {
        if (max <= 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        (onDrag ?? onDone)(at(event));
      }}
      onPointerMove={(event) => {
        const position = at(event);
        setHover(event.pointerType === 'mouse' || event.buttons > 0 ? position : null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) (onDrag ?? onDone)(position);
      }}
      onPointerUp={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        onDone(at(event));
        if (event.pointerType !== 'mouse') setHover(null);
      }}
      onPointerLeave={() => setHover(null)}
    >
      <input
        type="range"
        aria-label={label}
        aria-valuetext={text}
        min={0}
        max={max || 1}
        step={step}
        value={value}
        disabled={max <= 0}
        onChange={(event) => onDone(Number(event.target.value))}
        className="peer sr-only"
      />
      <span className="peer-focus-visible:ring-primary relative h-1 w-full rounded-full bg-white/25 ring-offset-1 ring-offset-black transition-[height] duration-100 group-hover/slider:h-1.5 peer-focus-visible:ring-2">
        <span className="absolute inset-y-0 left-0 rounded-full bg-white/35" style={{ width: `${share(buffered)}%` }} />
        <span className="bg-primary absolute inset-y-0 left-0 rounded-full" style={{ width: `${share(value)}%` }} />
        <span
          className="bg-primary absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${share(value)}%` }}
        />
      </span>
      {tip && hover !== null && (
        <span
          className="absolute bottom-full mb-1 -translate-x-1/2 rounded bg-black/85 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums"
          style={{ left: `clamp(1.5rem, ${share(hover)}%, calc(100% - 1.5rem))` }}
        >
          {tip(hover)}
        </span>
      )}
    </div>
  );
}

function Control({
  label,
  onClick,
  active,
  disabled,
  children,
  expanded,
  className,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-md text-white transition-colors outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40 [&_svg]:size-5',
        active && 'bg-white/15',
        className,
      )}
    >
      {children}
    </button>
  );
}

// The lecture player (mock-up A, 5 Nov 2026): the browser's own <video> under our controls, so MP4 needs no library and
// the same player serves a lesson, a teacher's preview and a recording. With a `lessonId` it also reports the seconds
// actually played (07 §8): a seek starts a new interval, so skipping ahead is never counted. Intervals go to /api/beacon
// every 30 s, on pause and when the page is hidden.
export function VideoPlayer({
  lessonId,
  src,
  lowSrc = null,
  poster,
  title,
}: {
  lessonId?: string;
  src: string;
  lowSrc?: string | null;
  // The lesson's thumbnail, shown before playback starts (M03b).
  poster?: string;
  // Named over the picture in full screen, where the page's own heading is out of sight.
  title?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const menuBox = useRef<HTMLDivElement>(null);
  const pending = useRef<Range[]>([]);
  const start = useRef<number | null>(null);
  const last = useRef(0);
  const resume = useRef<{ at: number; play: boolean } | null>(null);
  const retried = useRef(false);
  const wantsPlay = useRef(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const lastTap = useRef(-DOUBLE_TAP_MS);
  const flashes = useRef(0);
  const device = useSyncExternalStore(subscribe, deviceQuality, () => 'hd');
  const canMiniWindow = useSyncExternalStore(
    noSubscription,
    () => document.pictureInPictureEnabled === true,
    () => false,
  );
  const [choice, setChoice] = useState<Quality | null>(null);
  const [fresh, setFresh] = useState(0);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(true);
  const [ended, setEnded] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [awake, setAwake] = useState(true);
  const [menu, setMenu] = useState(false);
  const [touch, setTouch] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const quality = lowSrc ? (choice ?? device) : 'hd';
  const file = quality === 'low' && lowSrc ? lowSrc : src;
  const length = Number.isFinite(duration) ? duration : 0;
  const shown = paused || awake || menu || dragging !== null || failed;
  const silent = muted || volume === 0;

  const close = () => {
    if (start.current !== null && last.current > start.current) pending.current.push([start.current, last.current]);
    start.current = null;
  };
  const flush = () => {
    const running = start.current !== null;
    close();
    if (running) start.current = last.current;
    if (pending.current.length === 0) return;
    if (lessonId) {
      navigator.sendBeacon('/api/beacon', JSON.stringify({ kind: 'video', lessonId, ranges: pending.current }));
    }
    pending.current = [];
  };
  const flushLater = useEffectEvent(flush);

  // The signed link behind the file lasts 10 minutes (09 §5), so a later seek or reconnect fails: ask /api/files for a
  // new one, which checks access again, and carry on from the same place. Once only, until it loads.
  function recover(node: HTMLVideoElement) {
    if (retried.current || node.error?.code === MediaError.MEDIA_ERR_DECODE) {
      setWaiting(false);
      setFailed(true);
      return;
    }
    retried.current = true;
    flush();
    // A source that failed while loading (its clock reads 0) keeps the place it was meant to resume from. Otherwise, not
    // node.paused: the browser sets that before this event, and its pause event comes after.
    resume.current ??= { at: node.currentTime, play: wantsPlay.current };
    setWaiting(true);
    setFresh((n) => n + 1);
  }

  // Whatever happened before hydration fired no events: a file that failed, and metadata already read.
  const catchUp = useEffectEvent((node: HTMLVideoElement) => {
    if (node.error) recover(node);
    if (node.readyState >= HTMLMediaElement.HAVE_METADATA) setDuration(node.duration);
    setSpeed(node.playbackRate);
    setVolume(node.volume);
  });

  useEffect(() => {
    const node = video.current;
    if (!node) return;
    const savedSpeed = Number(read(STORED_SPEED));
    if (SPEEDS.includes(savedSpeed)) {
      node.defaultPlaybackRate = savedSpeed;
      node.playbackRate = savedSpeed;
    }
    const savedVolume = read(STORED_VOLUME);
    if (savedVolume !== null && Number(savedVolume) >= 0 && Number(savedVolume) <= 1) {
      node.volume = Number(savedVolume);
    }
    catchUp(node);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(flushLater, BEACON_MS);
    const hidden = () => document.visibilityState === 'hidden' && flushLater();
    window.addEventListener('pagehide', flushLater);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pagehide', flushLater);
      document.removeEventListener('visibilitychange', hidden);
      window.clearTimeout(hideTimer.current);
      flushLater();
    };
  }, []);

  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === box.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const outside = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !box.current?.contains(event.target)) setMenu(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [menu]);

  const wake = () => {
    setAwake(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setAwake(false), HIDE_MS);
  };

  const show = (side: Flash['side'], icon: ReactNode, text?: string) => {
    flashes.current += 1;
    setFlash({ id: flashes.current, side, icon, text });
  };

  const play = (node: HTMLVideoElement) => {
    // A refused play (no gesture yet) leaves the big play button showing, which is the way to ask again.
    node.play().catch(() => setPaused(true));
  };

  const toggle = () => {
    const node = video.current;
    if (!node || failed) return;
    if (node.paused || node.ended) {
      play(node);
      show('center', <PlayIcon weight="fill" />);
    } else {
      node.pause();
      show('center', <PauseIcon weight="fill" />);
    }
    wake();
  };

  const seekBy = (delta: number) => {
    const node = video.current;
    if (!node || length <= 0) return;
    node.currentTime = Math.min(length, Math.max(0, node.currentTime + delta));
    setTime(node.currentTime);
    show(
      delta < 0 ? 'left' : 'right',
      delta < 0 ? <ClockCounterClockwiseIcon /> : <ClockClockwiseIcon />,
      `${SKIP_SEC} s`,
    );
    wake();
  };

  const seekTo = (seconds: number) => {
    const node = video.current;
    setDragging(null);
    if (!node) return;
    node.currentTime = seconds;
    setTime(seconds);
    wake();
  };

  const changeVolume = (level: number) => {
    const node = video.current;
    if (!node) return;
    node.volume = level;
    node.muted = level === 0;
    remember(STORED_VOLUME, String(level));
    wake();
  };

  const toggleMute = () => {
    const node = video.current;
    if (!node) return;
    node.muted = !node.muted;
    if (!node.muted && node.volume === 0) node.volume = 1;
    wake();
  };

  const changeSpeed = (next: number) => {
    const node = video.current;
    if (!node) return;
    // The default survives a new source (a change of quality, a fresh link); the rate itself does not.
    node.defaultPlaybackRate = next;
    node.playbackRate = next;
    remember(STORED_SPEED, String(next));
    setMenu(false);
    wake();
  };

  function switchTo(next: Quality) {
    const node = video.current;
    setMenu(false);
    if (!node || next === quality) return;
    flush();
    resume.current = { at: node.currentTime, play: !node.paused };
    setChoice(next);
    remember(STORED, next);
    wake();
  }

  const toggleFullscreen = () => {
    const node = video.current;
    if (!node || !box.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (document.fullscreenEnabled) {
      // A phone turns sideways where the browser lets it; refused, the video still fills the screen it has.
      void box.current
        .requestFullscreen()
        .then(() => (touch ? screen.orientation.lock?.('landscape') : undefined))
        .catch(() => undefined);
    } else if ('webkitEnterFullscreen' in node && typeof node.webkitEnterFullscreen === 'function') {
      // An iPhone has full screen only for the video itself, with its own controls.
      node.webkitEnterFullscreen();
    }
    wake();
  };

  const toggleMiniWindow = () => {
    const node = video.current;
    if (!node) return;
    void (document.pictureInPictureElement === node ? document.exitPictureInPicture() : node.requestPictureInPicture());
    wake();
  };

  const tryAgain = () => {
    const node = video.current;
    if (!node) return;
    retried.current = false;
    resume.current = { at: resume.current?.at ?? node.currentTime, play: true };
    setFailed(false);
    setWaiting(true);
    setFresh((n) => n + 1);
  };

  const onStageClick = (event: MouseEvent<HTMLDivElement>) => {
    if (menu) {
      setMenu(false);
      return;
    }
    if (!touch) {
      toggle();
      return;
    }
    // A finger: one tap shows or hides the controls (or plays, if paused); two on either side skip, as on YouTube.
    const { left, width } = event.currentTarget.getBoundingClientRect();
    const across = (event.clientX - left) / width;
    const twice = event.timeStamp - lastTap.current < DOUBLE_TAP_MS;
    lastTap.current = event.timeStamp;
    if (twice && (across < 1 / 3 || across > 2 / 3)) {
      seekBy(across < 1 / 3 ? -SKIP_SEC : SKIP_SEC);
    } else if (paused) {
      toggle();
    } else if (shown) {
      setAwake(false);
    } else {
      wake();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const onButton = event.target instanceof HTMLButtonElement;
    const onSlider = event.target instanceof HTMLInputElement;
    const node = video.current;
    const actions: Record<string, (() => void) | undefined> = {
      // On a button Space presses that button, and on a slider the arrows move it.
      ' ': onButton ? undefined : toggle,
      k: toggle,
      j: () => seekBy(-SKIP_SEC),
      l: () => seekBy(SKIP_SEC),
      ArrowLeft: onSlider ? undefined : () => seekBy(-SKIP_SEC),
      ArrowRight: onSlider ? undefined : () => seekBy(SKIP_SEC),
      ArrowUp: onSlider || !node ? undefined : () => changeVolume(Math.min(1, node.volume + 0.1)),
      ArrowDown: onSlider || !node ? undefined : () => changeVolume(Math.max(0, node.volume - 0.1)),
      m: toggleMute,
      f: toggleFullscreen,
      Escape: menu ? () => setMenu(false) : undefined,
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const position = dragging ?? time;
  return (
    <div
      ref={box}
      role="group"
      aria-label={title ? `Video: ${title}` : 'Video'}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => setTouch(event.pointerType !== 'mouse')}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse') wake();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setAwake(false);
      }}
      className={cn(
        'focus-visible:ring-primary group/player @container relative aspect-video w-full overflow-hidden rounded-md bg-black outline-none select-none focus-visible:ring-2',
        fullscreen && 'aspect-auto size-full rounded-none',
        !shown && 'cursor-none',
      )}
    >
      <video
        ref={video}
        playsInline
        preload="metadata"
        poster={poster}
        src={fresh > 0 ? `${file}?fresh=${fresh}` : file}
        className="absolute inset-0 size-full object-contain"
        onTimeUpdate={(event) => {
          const node = event.currentTarget;
          const now = node.currentTime;
          // A jump of more than 2 s (or backwards) is a seek, not playback.
          if (start.current === null || now < last.current || now - last.current > 2) {
            close();
            start.current = now;
          }
          last.current = now;
          setTime(now);
          setBuffered(bufferedEnd(node));
        }}
        onProgress={(event) => setBuffered(bufferedEnd(event.currentTarget))}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onRateChange={(event) => setSpeed(event.currentTarget.playbackRate)}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setMuted(event.currentTarget.muted);
        }}
        onSeeking={() => {
          close();
          setEnded(false);
          setWaiting(true);
        }}
        onSeeked={() => setWaiting(false)}
        onWaiting={() => setWaiting(true)}
        onCanPlay={() => setWaiting(false)}
        onPlaying={() => {
          setWaiting(false);
          wake();
        }}
        onPlay={() => {
          wantsPlay.current = true;
          setPaused(false);
          setEnded(false);
        }}
        onPause={() => {
          wantsPlay.current = false;
          setPaused(true);
          flush();
        }}
        onEnded={() => {
          setEnded(true);
          flush();
        }}
        onError={(event) => recover(event.currentTarget)}
        onLoadedMetadata={(event) => {
          const node = event.currentTarget;
          retried.current = false;
          setFailed(false);
          setDuration(node.duration);
          if (!resume.current) return;
          node.currentTime = resume.current.at;
          if (resume.current.play) play(node);
          else setWaiting(false);
          resume.current = null;
        }}
      />

      <div className="absolute inset-0" onClick={onStageClick} onDoubleClick={() => !touch && toggleFullscreen()} />

      {flash && (
        <span
          key={flash.id}
          onAnimationEnd={() => setFlash(null)}
          className={cn(
            'animate-out fade-out zoom-out-125 pointer-events-none absolute top-1/2 grid size-16 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white duration-500 motion-reduce:hidden [&_svg]:size-7',
            flash.side === 'left' && 'left-[12%]',
            flash.side === 'center' && 'left-1/2 -translate-x-1/2',
            flash.side === 'right' && 'right-[12%]',
          )}
        >
          {flash.icon}
          {flash.text && <span className="-mt-1 text-[0.625rem] font-semibold">{flash.text}</span>}
        </span>
      )}

      {waiting && !failed && (
        <span
          role="status"
          aria-label="Loading"
          className="animate-in fade-in fill-mode-both pointer-events-none absolute top-1/2 left-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white delay-300 duration-200"
        >
          <CircleNotchIcon className="size-7 animate-spin" />
        </span>
      )}

      {!failed && !waiting && (paused || (touch && shown)) && (
        <button
          type="button"
          aria-label={ended ? 'Play again' : paused ? 'Play' : 'Pause'}
          onClick={toggle}
          className="hover:bg-primary absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/70 text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white @max-md:size-14"
        >
          {ended ? (
            <ArrowClockwiseIcon weight="bold" className="size-7" />
          ) : paused ? (
            <PlayIcon weight="fill" className="ml-0.5 size-7" />
          ) : (
            <PauseIcon weight="fill" className="size-7" />
          )}
        </button>
      )}

      {failed && (
        <div
          role="alert"
          className="absolute inset-0 grid place-content-center justify-items-center gap-2 bg-black/80 p-4 text-center text-white"
        >
          <WarningCircleIcon className="size-8" />
          <p className="text-sm font-medium">This video could not be played.</p>
          <p className="text-xs text-white/70">Check your connection, then try again.</p>
          <button
            type="button"
            onClick={tryAgain}
            className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-[0.8125rem] font-medium text-black outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <ArrowClockwiseIcon className="size-4" /> Try again
          </button>
        </div>
      )}

      {fullscreen && title && (
        <p
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 truncate bg-linear-to-b from-black/70 to-transparent px-4 pt-3 pb-8 text-sm font-medium text-white transition-opacity duration-200',
            !shown && 'opacity-0',
          )}
        >
          {title}
        </p>
      )}

      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-black/80 to-transparent transition-opacity duration-200',
          !shown && 'opacity-0',
        )}
      />
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 px-2.5 pb-1 transition-opacity duration-200 @md:px-3 @md:pb-1.5',
          !shown && 'pointer-events-none opacity-0',
        )}
        onClick={(event) => {
          if (menu && event.target instanceof Node && !menuBox.current?.contains(event.target)) setMenu(false);
        }}
      >
        <Slider
          label="Seek"
          className="mx-1"
          value={Math.min(position, length)}
          max={length}
          step={SKIP_SEC}
          buffered={buffered}
          text={`${clock(position)} of ${clock(length)}`}
          tip={clock}
          onDrag={setDragging}
          onDone={seekTo}
        />
        <div className="flex items-center gap-0.5">
          <Control label={paused ? 'Play (k)' : 'Pause (k)'} onClick={toggle} disabled={failed}>
            {paused ? <PlayIcon weight="fill" /> : <PauseIcon weight="fill" />}
          </Control>
          <Control label={`Back ${SKIP_SEC} seconds (j)`} onClick={() => seekBy(-SKIP_SEC)} className="@max-md:hidden">
            <ClockCounterClockwiseIcon />
          </Control>
          <Control
            label={`Forward ${SKIP_SEC} seconds (l)`}
            onClick={() => seekBy(SKIP_SEC)}
            className="@max-md:hidden"
          >
            <ClockClockwiseIcon />
          </Control>
          <div className="group/volume flex items-center @max-md:hidden">
            <Control label={silent ? 'Turn the sound on (m)' : 'Mute (m)'} onClick={toggleMute}>
              {silent ? (
                <SpeakerSlashIcon weight="fill" />
              ) : volume < 0.5 ? (
                <SpeakerLowIcon weight="fill" />
              ) : (
                <SpeakerHighIcon weight="fill" />
              )}
            </Control>
            <Slider
              label="Volume"
              className="w-0 overflow-hidden transition-[width] duration-150 group-focus-within/volume:mx-1.5 group-focus-within/volume:w-16 group-hover/volume:mx-1.5 group-hover/volume:w-16"
              value={silent ? 0 : volume}
              max={1}
              step={0.05}
              text={`${Math.round((silent ? 0 : volume) * 100)}%`}
              onDone={changeVolume}
            />
          </div>
          <span className="ml-2 text-[0.8125rem] whitespace-nowrap text-white tabular-nums @max-md:text-xs">
            {clock(position)} <span className="text-white/60">/ {clock(length)}</span>
          </span>
          <span className="min-w-1 flex-1" />
          {speed !== 1 && (
            <span className="rounded px-1 text-xs font-semibold text-white tabular-nums @max-sm:hidden">{speed}×</span>
          )}
          {lowSrc && (
            <span className="rounded px-1 text-xs font-semibold whitespace-nowrap text-white @max-sm:hidden">
              {quality === 'low' ? 'Data saver' : 'HD'}
            </span>
          )}
          <div ref={menuBox} className="flex">
            <Control label="Speed and quality" onClick={() => setMenu(!menu)} active={menu} expanded={menu}>
              <GearSixIcon weight="fill" />
            </Control>
          </div>
          {canMiniWindow && (
            <Control label="Mini window" onClick={toggleMiniWindow} disabled={length <= 0} className="@max-md:hidden">
              <PictureInPictureIcon />
            </Control>
          )}
          <Control label={fullscreen ? 'Leave full screen (f)' : 'Full screen (f)'} onClick={toggleFullscreen}>
            {fullscreen ? <CornersInIcon weight="bold" /> : <CornersOutIcon weight="bold" />}
          </Control>
        </div>
      </div>

      {menu && (
        <div className="absolute right-2 bottom-15 max-h-[calc(100%-4.5rem)] w-72 max-w-[calc(100%-1rem)] overflow-y-auto rounded-lg bg-neutral-900 p-3 text-[0.8125rem] text-white @max-md:p-2">
          <p className="mb-1.5 text-xs text-white/60 @max-md:mb-1">Speed</p>
          <div role="radiogroup" aria-label="Playback speed" className="grid grid-cols-6 gap-0.5">
            {SPEEDS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={speed === option}
                aria-label={`${option} times`}
                onClick={() => changeSpeed(option)}
                className={cn(
                  'rounded py-1 text-xs tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white',
                  speed === option ? 'bg-primary font-medium' : 'hover:bg-white/10',
                )}
              >
                {option}×
              </button>
            ))}
          </div>
          {lowSrc && (
            <>
              <p className="mt-3 mb-1 text-xs text-white/60 @max-md:mt-2">Quality</p>
              <div role="radiogroup" aria-label="Video quality" className="grid gap-0.5 @max-md:grid-cols-2">
                {QUALITIES.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={quality === option.key}
                    aria-label={option.label}
                    onClick={() => switchTo(option.key)}
                    className={cn(
                      'flex items-center gap-2 rounded px-2 py-1.5 text-left whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white @max-md:gap-1 @max-md:px-1.5 @max-md:py-1',
                      quality === option.key ? 'bg-white/10' : 'hover:bg-white/10',
                    )}
                  >
                    <CheckIcon weight="bold" className={cn('size-3.5', quality !== option.key && 'invisible')} />
                    {option.label}
                    <span className="ml-auto text-xs text-white/60 @max-md:hidden">{option.hint}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
