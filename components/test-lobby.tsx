'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  BrowserIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  WarningCircleIcon,
  WarningIcon,
  WifiHighIcon,
  type Icon,
} from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

const tick = (notify: () => void) => {
  const timer = window.setInterval(notify, 1000);
  return () => window.clearInterval(timer);
};

// Whole seconds on the server's clock: this device's clock moved by the offset fixed at the first snapshot after the
// page arrived. 0 while the page renders on the server.
export function useServerSeconds(serverNow: number): number {
  const offset = useRef<number | null>(null);
  return useSyncExternalStore(
    tick,
    () => {
      offset.current ??= serverNow - Date.now();
      return Math.floor((Date.now() + offset.current) / 1000);
    },
    () => 0,
  );
}

export const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

// TP-04: the time until the test opens. At zero the page is fetched again, and Start appears.
export function Countdown({ opensAt, serverNow, caption }: { opensAt: string; serverNow: number; caption: string }) {
  const router = useRouter();
  const now = useServerSeconds(serverNow);
  const left = now === 0 ? null : new Date(opensAt).getTime() - now * 1000;
  const refreshed = useRef(false);
  useEffect(() => {
    if (left === null || left > 0 || refreshed.current) return;
    refreshed.current = true;
    router.refresh();
  }, [left, router]);
  const days = left === null ? 0 : Math.floor(left / 86_400_000);
  return (
    <div className="bg-muted/60 grid gap-1 rounded-md p-4 text-center" role="timer" aria-live="off">
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Opens in</span>
      <b className="text-3xl font-semibold tabular-nums">
        {left === null ? '—' : days > 0 ? `${days} day${days === 1 ? '' : 's'}` : clock(left)}
      </b>
      <span className="text-muted-foreground text-xs">{caption}</span>
    </div>
  );
}

type Check = { state: 'checking' | 'ok' | 'warn' | 'fail'; detail: string };

const never = () => () => {};
const onlineEvents = (notify: () => void) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
};

// Three round trips to the server; the middle one decides. Answers save and retry, so slow is a warning, not a stop.
async function measure(): Promise<Check> {
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    const reached = await fetch(`/brand/logo.svg?ping=${start}`, { method: 'HEAD', cache: 'no-store' }).then(
      () => true,
      () => false,
    );
    if (!reached) return { state: 'fail', detail: 'Not reaching the server. Check your internet.' };
    times.push(performance.now() - start);
  }
  const ms = Math.round(times.sort((a, b) => a - b)[1]);
  return ms < 600
    ? { state: 'ok', detail: `Good (${ms} ms to the server)` }
    : { state: 'warn', detail: `Slow (${ms} ms) · answers still save and retry` };
}

const MARK: Record<Check['state'], { icon: Icon; className: string }> = {
  checking: { icon: CircleNotchIcon, className: 'text-muted-foreground animate-spin' },
  ok: { icon: CheckCircleIcon, className: 'text-success' },
  warn: { icon: WarningIcon, className: 'text-warning' },
  fail: { icon: WarningCircleIcon, className: 'text-destructive' },
};

const CHIP: Record<Check['state'], string> = {
  checking: 'bg-muted text-muted-foreground',
  ok: 'bg-success/10 text-success',
  warn: 'bg-warning/10 text-warning',
  fail: 'bg-destructive/10 text-destructive',
};

// TP-04 ("Lobby B"): what this device needs to take the test. The camera and microphone rows come with proctoring.
export function DeviceCheck() {
  const cookies = useSyncExternalStore(
    never,
    () => navigator.cookieEnabled,
    () => null,
  );
  const online = useSyncExternalStore(
    onlineEvents,
    () => navigator.onLine,
    () => true,
  );
  const [connection, setConnection] = useState<Check>({ state: 'checking', detail: 'Measuring…' });
  useEffect(() => {
    if (!online) return;
    let current = true;
    void measure().then((result) => {
      if (current) setConnection(result);
    });
    return () => {
      current = false;
    };
  }, [online]);
  const rows: { icon: Icon; title: string; check: Check }[] = [
    {
      icon: BrowserIcon,
      title: 'Browser',
      check:
        cookies === null
          ? { state: 'checking', detail: 'Checking…' }
          : cookies
            ? { state: 'ok', detail: 'Ready · cookies are on' }
            : { state: 'fail', detail: 'Turn on cookies for this site, then reload.' },
    },
    {
      icon: WifiHighIcon,
      title: 'Connection',
      check: online ? connection : { state: 'fail', detail: 'You are offline. Reconnect to start.' },
    },
  ];
  const ready = rows.filter((row) => row.check.state === 'ok' || row.check.state === 'warn').length;
  const done = rows.every((row) => row.check.state !== 'checking');
  return (
    <section className="surface grid gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[0.9375rem] font-semibold">Device check</h2>
        <Badge variant={!done ? 'secondary' : ready === rows.length ? 'success' : 'warning'} className="normal-case">
          {done ? `${ready} of ${rows.length} ready` : 'Checking…'}
        </Badge>
      </div>
      <ul className="divide-y" aria-live="polite">
        {rows.map(({ icon: RowIcon, title, check }) => {
          const Mark = MARK[check.state].icon;
          return (
            <li key={title} className="flex items-center gap-3 py-2.5">
              <span className={cn('grid size-8 shrink-0 place-items-center rounded-md', CHIP[check.state])}>
                <RowIcon className="size-4" />
              </span>
              <span className="grid min-w-0 flex-1">
                <b className="text-[0.8125rem] font-medium">{title}</b>
                <span className="text-muted-foreground text-xs">{check.detail}</span>
              </span>
              <Mark weight="fill" className={cn('size-5 shrink-0', MARK[check.state].className)} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
