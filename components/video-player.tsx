'use client';

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';

type Quality = 'hd' | 'low';
type Range = [number, number];

const STORED = 'lms-video-quality';
const PHONE = '(max-width: 767px)';
const BEACON_MS = 30_000;

function storedQuality(): Quality | null {
  try {
    const value = window.localStorage.getItem(STORED);
    return value === 'hd' || value === 'low' ? value : null;
  } catch {
    // Storage can be blocked (private mode); the default for the screen size applies.
    return null;
  }
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

// Plays the lecture and reports the seconds actually played (07 §8): a seek starts a new interval, so skipping
// ahead is never counted. Intervals go to /api/beacon every 30 s, on pause and when the page is hidden.
export function VideoPlayer({
  lessonId,
  src,
  lowSrc,
  poster,
}: {
  lessonId: string;
  src: string;
  lowSrc: string | null;
  // The lesson's thumbnail, shown before playback starts (M03b).
  poster?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const pending = useRef<Range[]>([]);
  const start = useRef<number | null>(null);
  const last = useRef(0);
  const resume = useRef<{ at: number; play: boolean } | null>(null);
  const device = useSyncExternalStore(subscribe, deviceQuality, () => 'hd');
  const [choice, setChoice] = useState<Quality | null>(null);
  const quality = lowSrc ? (choice ?? device) : 'hd';

  const close = () => {
    if (start.current !== null && last.current > start.current) pending.current.push([start.current, last.current]);
    start.current = null;
  };
  const flush = () => {
    const playing = start.current !== null;
    close();
    if (playing) start.current = last.current;
    if (pending.current.length === 0) return;
    navigator.sendBeacon('/api/beacon', JSON.stringify({ kind: 'video', lessonId, ranges: pending.current }));
    pending.current = [];
  };
  const flushLater = useEffectEvent(flush);

  useEffect(() => {
    const timer = window.setInterval(flushLater, BEACON_MS);
    const hidden = () => document.visibilityState === 'hidden' && flushLater();
    window.addEventListener('pagehide', flushLater);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pagehide', flushLater);
      document.removeEventListener('visibilitychange', hidden);
      flushLater();
    };
  }, []);

  function switchTo(next: Quality) {
    const node = video.current;
    if (!node || next === quality) return;
    flush();
    resume.current = { at: node.currentTime, play: !node.paused };
    setChoice(next);
    window.localStorage.setItem(STORED, next);
  }

  return (
    <div className="grid gap-3">
      <video
        ref={video}
        controls
        playsInline
        preload="metadata"
        poster={poster}
        src={quality === 'low' && lowSrc ? lowSrc : src}
        className="aspect-video w-full rounded-md bg-black"
        onTimeUpdate={(event) => {
          const now = event.currentTarget.currentTime;
          // A jump of more than 2 s (or backwards) is a seek, not playback.
          if (start.current === null || now < last.current || now - last.current > 2) {
            close();
            start.current = now;
          }
          last.current = now;
        }}
        onSeeking={close}
        onPause={flush}
        onEnded={flush}
        onLoadedMetadata={(event) => {
          if (!resume.current) return;
          event.currentTarget.currentTime = resume.current.at;
          if (resume.current.play) void event.currentTarget.play();
          resume.current = null;
        }}
      />
      {lowSrc && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-muted-foreground">
            {quality === 'low'
              ? 'Playing a lighter 480p copy for mobile data.'
              : 'On mobile data? Switch to Data saver.'}
          </p>
          <div role="radiogroup" aria-label="Video quality" className="bg-muted inline-flex rounded-lg p-0.5">
            {(['hd', 'low'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={quality === option}
                onClick={() => switchTo(option)}
                className={cn(
                  'rounded-md px-3 py-1 font-medium transition-colors',
                  quality === option
                    ? 'bg-card text-foreground ring-border ring-1'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option === 'hd' ? 'HD' : 'Data saver'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
