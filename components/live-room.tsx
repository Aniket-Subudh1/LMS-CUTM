'use client';

import '@livekit/components-styles';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  isTrackReference,
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useChat,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTrackToggle,
  useTracks,
  VideoTrack,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  ChatCircleIcon,
  HandPalmIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  MonitorArrowUpIcon,
  PaperPlaneRightIcon,
  PhoneDisconnectIcon,
  StopIcon,
  UsersIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
  XIcon,
} from '@phosphor-icons/react';
import { DisconnectReason, Track, type Participant } from 'livekit-client';
import { endSession, lowerHands, raiseHand } from '@/app/(app)/courses/[offeringId]/live/actions';
import { ActionForm } from '@/components/action-form';
import { RoomNotice } from '@/components/room-notice';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatTime, initials } from '@/lib/format';

type Props = {
  offeringId: string;
  sessionId: string;
  serverUrl: string;
  token: string;
  // A student: focused time is counted (T5) and they may raise a hand. A host (the class's teachers, admins): may
  // lower anyone's hand and end the class.
  trackFocus: boolean;
  host: boolean;
  // Where the class's attendance and summary are.
  classPage: string;
  title: string;
  course: string;
  startedAt: Date | null;
  endsAt: Date;
  enrolled: number;
  // Said above "End class" for hosts: how attendance is taken in this class.
  attendanceNote: string;
};
type State = 'in' | 'left' | 'replaced' | 'dropped' | 'ended' | 'failed';
type Panel = 'people' | 'chat';

const BEACON_MS = 60_000;

// The class fills the tab it was opened in (M03b, "like Google Meet in a tab"), laid out as "A · Stage and side panel"
// (Aniket's pick, 17 Oct 2026): the shared screen or a teacher fills the stage, the title and the time live float over
// it, the viewer's own camera sits in a corner, round controls float at the bottom, and a side panel holds the people
// (raised hands first, in the order raised) and the chat.
export function LiveRoom(props: Props) {
  const { sessionId, serverUrl, token, trackFocus, classPage } = props;
  const router = useRouter();
  const [state, setState] = useState<State>('in');

  const [joined, setJoined] = useState({ token, attempt: 0 });
  const [deviceFailed, setDeviceFailed] = useState(false);
  const connected = useRef(false);

  useEffect(() => {
    if (!trackFocus) return;
    let focusedMs = 0;
    let last = Date.now();
    const count = () => {
      const now = Date.now();
      if (connected.current && document.visibilityState === 'visible') focusedMs += Math.min(now - last, 2_000);
      last = now;
    };
    const send = () => {
      count();
      const focusedSec = Math.min(120, Math.floor(focusedMs / 1000));
      if (focusedSec === 0) return;
      focusedMs -= focusedSec * 1000;
      navigator.sendBeacon('/api/beacon', JSON.stringify({ kind: 'live', sessionId, focusedSec }));
    };
    const counter = window.setInterval(count, 1_000);
    const sender = window.setInterval(send, BEACON_MS);
    window.addEventListener('pagehide', send);
    return () => {
      window.clearInterval(counter);
      window.clearInterval(sender);
      window.removeEventListener('pagehide', send);
      send();
    };
  }, [trackFocus, sessionId]);

  // Rejoining also re-renders the page, so a class that has ended in the meantime shows its summary instead.
  const rejoin = () => {
    setDeviceFailed(false);
    setState('in');
    setJoined((current) => ({ token, attempt: current.attempt + 1 }));
    router.refresh();
  };

  if (state !== 'in') {
    const copy: Record<Exclude<State, 'in'>, { title: string; text: string; again: boolean }> = {
      left: {
        title: trackFocus ? 'You left the class' : 'You left the room',
        text: trackFocus
          ? 'Rejoin to carry on. Time away from the class does not count towards your attendance.'
          : 'The class is still running for your students. Rejoin, and end it from the People panel when you are done.',
        again: true,
      },
      replaced: {
        title: 'You joined from another tab or device',
        text: 'A class plays in one place at a time. Rejoin here to move the class back to this tab.',
        again: true,
      },
      dropped: {
        title: 'Your connection dropped',
        text: 'Check your internet connection, then rejoin.',
        again: true,
      },
      ended: {
        title: 'The class has ended',
        text: 'Close this tab, or open the class page to see how it went.',
        again: false,
      },
      failed: {
        title: 'Could not connect to the class',
        text: 'The network may be blocking live video. Try again in a moment, or switch to another network.',
        again: true,
      },
    };
    const { title, text, again } = copy[state];
    return (
      <RoomNotice title={title} text={text}>
        {again ? (
          // Outline buttons are white with dark text: they stand out on the dark stage, whose text is white.
          <Button onClick={rejoin} variant="outline" className="text-foreground">
            <ArrowClockwiseIcon /> Rejoin
          </Button>
        ) : (
          <Button asChild variant="outline" className="text-foreground">
            <Link href={classPage}>
              <ArrowLeftIcon /> Open the class page
            </Link>
          </Button>
        )}
      </RoomNotice>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      {deviceFailed && (
        <Alert className="absolute inset-x-4 top-16 z-30 mx-auto max-w-lg">
          <MicrophoneSlashIcon />
          <AlertTitle>Your microphone or camera could not start</AlertTitle>
          <AlertDescription>
            Allow them for this site (the icon at the left of the address bar), or carry on watching and listening.
          </AlertDescription>
        </Alert>
      )}
      <LiveKitRoom
        key={joined.attempt}
        serverUrl={serverUrl}
        token={joined.token}
        connect
        video={false}
        audio={false}
        data-lk-theme="default"
        className="flex min-h-0 min-w-0 flex-1"
        onConnected={() => {
          connected.current = true;
        }}
        onDisconnected={(reason) => {
          connected.current = false;
          if (reason === DisconnectReason.ROOM_DELETED) {
            setState('ended');
            router.refresh();
          } else if (reason === DisconnectReason.DUPLICATE_IDENTITY) setState('replaced');
          else if (reason === DisconnectReason.CLIENT_INITIATED) setState('left');
          else setState('dropped');
        }}
        onError={() => setState('failed')}
        onMediaDeviceFailure={() => setDeviceFailed(true)}
      >
        <Classroom {...props} />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}

// Seconds since 1970, ticking once a second; 0 on the server (the room renders in the browser only).
const tick = (notify: () => void) => {
  const timer = window.setInterval(notify, 1000);
  return () => window.clearInterval(timer);
};
const useNow = () =>
  useSyncExternalStore(
    tick,
    () => Math.floor(Date.now() / 1000),
    () => 0,
  );

const wideQuery = '(min-width: 1024px)';
const onResize = (notify: () => void) => {
  const query = window.matchMedia(wideQuery);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
const useWide = () =>
  useSyncExternalStore(
    onResize,
    () => window.matchMedia(wideQuery).matches,
    () => true,
  );

// The token gives each participant a `role`; a raised hand is the attribute `hand`, the time it was raised (ms), set by
// the server (lib/integrations/live.ts).
const isHost = (p: Participant) => p.attributes.role === 'host';
const handOf = (p: Participant) => Number(p.attributes.hand) || 0;
const nameOf = (p: Participant) => p.name || p.identity;
const clock = (sec: number) =>
  [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map((n) => String(n).padStart(2, '0')).join(':');
const ago = (now: number, at: number) => {
  const min = Math.floor((now - at / 1000) / 60);
  return min < 1 ? 'raised just now' : `raised ${min} min ago`;
};
const cameraOn = (ref: TrackReferenceOrPlaceholder | undefined) =>
  ref !== undefined && isTrackReference(ref) && !ref.publication.isMuted;

function Classroom(props: Props) {
  const { offeringId, sessionId, host } = props;
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const cameras = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });
  const screens = useTracks([Track.Source.ScreenShare]);
  const now = useNow();
  const wide = useWide();
  // Unset until the viewer chooses: the people panel opens by itself on a wide screen only.
  const [choice, setChoice] = useState<Panel | null>();
  const panel = choice === undefined ? (wide ? 'people' : null) : choice;
  const [dismissed, setDismissed] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chat = useChat();
  const [seen, setSeen] = useState(0);
  const unread = panel === 'chat' ? 0 : Math.max(0, chat.chatMessages.length - seen);

  const hands = participants.filter((p) => handOf(p) > 0).sort((a, b) => handOf(a) - handOf(b));
  const students = participants.filter((p) => !isHost(p));
  const myHand = handOf(localParticipant);
  const place = hands.findIndex((p) => p.identity === localParticipant.identity) + 1;
  const ref = { offeringId, sessionId };

  // The stage: a shared screen first; otherwise a host's camera (the one speaking, if any), then anyone speaking, then
  // any camera; with no camera on, the first host's (or the viewer's) initials.
  const cameraOf = (p: Participant) => cameras.find((c) => c.participant.identity === p.identity);
  const speakers = room.activeSpeakers;
  const focus =
    screens[0] ??
    [...speakers.filter(isHost), ...participants.filter(isHost), ...speakers, ...participants]
      .filter((p) => p.identity !== localParticipant.identity || participants.length === 1)
      .map(cameraOf)
      .find(cameraOn) ??
    cameraOf(participants.find(isHost) ?? localParticipant);
  const presenting = screens[0] !== undefined;
  const mine = cameraOf(localParticipant);
  const latest = hands.at(-1);
  const toastKey = latest ? `${latest.identity}:${handOf(latest)}` : '';

  async function run(change: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setError(null);
    const result = await change();
    setBusy(false);
    if (!result.ok) setError(result.message ?? 'That did not work. Try again.');
  }
  const lower = (identities: string[]) => run(() => lowerHands({ ...ref, 'identity[]': identities }));
  const toggleHand = () => (myHand ? lower([localParticipant.identity]) : run(() => raiseHand(ref)));
  const open = (next: Panel) => {
    if (panel === 'chat' || next === 'chat') setSeen(chat.chatMessages.length);
    setChoice(panel === next ? null : next);
  };

  return (
    <>
      <div className="relative flex min-w-0 flex-1 flex-col p-2 sm:p-3">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-white/4">
          {focus && (
            <Tile
              trackRef={focus}
              fit={presenting ? 'contain' : 'cover'}
              className="absolute inset-0 rounded-none bg-transparent"
              labelClassName="max-sm:bottom-20"
              label={presenting ? `${nameOf(focus.participant)} is presenting` : nameOf(focus.participant)}
              hand={hands.findIndex((p) => p.identity === focus.participant.identity) + 1}
            />
          )}

          <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5 rounded-md bg-black/60 py-1 pr-3 pl-1 text-[0.8125rem] ring-1 ring-white/10">
              <button
                type="button"
                onClick={() => void room.disconnect()}
                aria-label="Leave the class"
                title="Leave the class"
                className="grid size-7 shrink-0 place-items-center rounded-md bg-white/10 hover:bg-white/20"
              >
                <XIcon className="size-4" />
              </button>
              <span className="truncate font-semibold">{props.title}</span>
              <span className="truncate text-white/60 max-md:hidden">{props.course}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-md bg-black/60 px-3 py-1.5 text-[0.8125rem] ring-1 ring-white/10">
              <span className="bg-destructive size-2 rounded-full motion-safe:animate-pulse" />
              <span className="font-semibold">Live</span>
              {props.startedAt && now > 0 && (
                <span className="text-white/60 tabular-nums">
                  {clock(Math.max(0, now - Math.floor(props.startedAt.getTime() / 1000)))}
                </span>
              )}
            </div>
          </div>

          {host && latest && toastKey !== dismissed && (
            <div
              role="status"
              className="bg-background text-foreground absolute top-14 left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2.5 rounded-md py-1.5 pr-1.5 pl-3 text-[0.8125rem]"
            >
              <HandPalmIcon weight="fill" className="text-gold size-4 shrink-0" />
              <span className="truncate">{nameOf(latest)} raised a hand</span>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void lower([latest.identity])}>
                Lower
              </Button>
              <button
                type="button"
                aria-label="Hide this notice"
                onClick={() => setDismissed(toastKey)}
                className="text-muted-foreground hover:text-foreground grid size-7 place-items-center rounded-md"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="bg-destructive absolute bottom-20 left-1/2 max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-md px-3 py-1.5 text-[0.8125rem] text-white"
            >
              {error}
            </p>
          )}

          {mine && focus?.participant.identity !== localParticipant.identity && (
            <Tile
              trackRef={mine}
              fit="cover"
              className="absolute right-3 bottom-20 aspect-4/3 w-32 bg-(--lk-bg) ring-1 ring-white/15 sm:w-44 lg:w-52"
              label="You"
              hand={place}
            />
          )}

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/70 p-1.5 ring-1 ring-white/10 sm:gap-2">
            <MediaToggle source={Track.Source.Microphone} on={<MicrophoneIcon />} off={<MicrophoneSlashIcon />} />
            <MediaToggle source={Track.Source.Camera} on={<VideoCameraIcon />} off={<VideoCameraSlashIcon />} />
            <MediaToggle
              source={Track.Source.ScreenShare}
              on={<MonitorArrowUpIcon />}
              off={<MonitorArrowUpIcon />}
              className="max-sm:hidden"
            />
            {!host && (
              <RoundButton
                label={myHand ? `Lower your hand (${place} in line)` : 'Raise your hand'}
                pressed={myHand > 0}
                onClick={() => void toggleHand()}
                disabled={busy}
                className={myHand ? 'bg-gold text-foreground hover:bg-gold/90' : undefined}
              >
                <HandPalmIcon weight={myHand ? 'fill' : 'regular'} />
              </RoundButton>
            )}
            <RoundButton
              label="People"
              pressed={panel === 'people'}
              onClick={() => open('people')}
              badge={hands.length}
            >
              <UsersIcon />
            </RoundButton>
            <RoundButton label="Chat" pressed={panel === 'chat'} onClick={() => open('chat')} badge={unread}>
              <ChatCircleIcon />
            </RoundButton>
            <span className="mx-0.5 h-6 w-px bg-white/15" />
            <button
              type="button"
              onClick={() => void room.disconnect()}
              className="bg-destructive hover:bg-destructive/90 flex h-11 items-center gap-2 rounded-full px-4 text-[0.8125rem] font-semibold text-white"
            >
              <PhoneDisconnectIcon className="size-5" />
              <span className="max-sm:sr-only">Leave</span>
            </button>
          </div>
          <StartAudio
            label="Turn on sound"
            className="bg-background text-foreground absolute top-14 left-3 h-8 rounded-md px-3 text-[0.8125rem] font-medium"
          />
        </div>
      </div>

      {panel && (
        <aside className="flex w-88 shrink-0 flex-col border-l border-white/10 bg-(--lk-bg) max-lg:absolute max-lg:inset-0 max-lg:z-20 max-lg:w-full max-lg:border-l-0">
          <header className="flex items-center gap-1 border-b border-white/10 p-2">
            {(['people', 'chat'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => open(tab)}
                className={cn(
                  'h-8 flex-1 rounded-md text-[0.8125rem] capitalize',
                  panel === tab ? 'bg-white/10 font-semibold' : 'text-white/60 hover:text-white',
                )}
              >
                {tab}
              </button>
            ))}
            <button
              type="button"
              aria-label="Close the panel"
              onClick={() => open(panel)}
              className="grid size-8 place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
            >
              <XIcon className="size-4" />
            </button>
          </header>
          {panel === 'people' ? (
            <People
              {...props}
              now={now}
              participants={participants}
              hands={hands}
              students={students.length}
              me={localParticipant.identity}
              busy={busy}
              lower={lower}
            />
          ) : (
            <Chat me={localParticipant.identity} {...chat} />
          )}
        </aside>
      )}
    </>
  );
}

function Tile({
  trackRef,
  fit,
  className,
  labelClassName,
  label,
  hand,
}: {
  trackRef: TrackReferenceOrPlaceholder;
  fit: 'cover' | 'contain';
  className?: string;
  labelClassName?: string;
  label: string;
  hand: number;
}) {
  const p = trackRef.participant;
  return (
    <div className={cn('overflow-hidden rounded-lg bg-white/6', hand > 0 && 'ring-gold ring-2', className)}>
      {cameraOn(trackRef) && isTrackReference(trackRef) ? (
        <VideoTrack
          trackRef={trackRef}
          className={cn('size-full', fit === 'cover' ? 'object-cover' : 'object-contain')}
        />
      ) : (
        <span className="grid size-full place-items-center">
          <span className="grid size-[min(30%,5rem)] min-h-10 min-w-10 place-items-center rounded-full bg-white/10 text-[clamp(0.75rem,3vw,1.5rem)] font-semibold">
            {initials(nameOf(p))}
          </span>
        </span>
      )}
      {hand > 0 && (
        <span className="bg-gold text-foreground absolute top-2 left-2 flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-semibold">
          <HandPalmIcon weight="fill" className="size-3.5" /> {hand}
        </span>
      )}
      <span
        className={cn(
          'absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-sm bg-black/60 px-2 py-0.5 text-xs',
          labelClassName,
        )}
      >
        {p.isMicrophoneEnabled ? (
          <MicrophoneIcon className="size-3.5 shrink-0" />
        ) : (
          <MicrophoneSlashIcon className="size-3.5 shrink-0 text-red-300" />
        )}
        <span className="truncate">{label}</span>
      </span>
    </div>
  );
}

function RoundButton({
  label,
  pressed,
  onClick,
  disabled,
  badge = 0,
  className,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
  badge?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative grid size-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-60 [&_svg]:size-5',
        pressed && 'bg-primary hover:bg-primary/90',
        className,
      )}
    >
      {children}
      {badge > 0 && (
        <span className="bg-gold text-foreground absolute -top-1 -right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full px-1 text-[0.6875rem] font-bold tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}

function MediaToggle({
  source,
  on,
  off,
  className,
}: {
  source: Track.Source.Microphone | Track.Source.Camera | Track.Source.ScreenShare;
  on: ReactNode;
  off: ReactNode;
  className?: string;
}) {
  const { enabled, pending, toggle } = useTrackToggle({ source });
  const what = source === Track.Source.Microphone ? 'microphone' : source === Track.Source.Camera ? 'camera' : 'screen';
  const label =
    source === Track.Source.ScreenShare
      ? enabled
        ? 'Stop sharing your screen'
        : 'Share your screen'
      : `Turn ${enabled ? 'off' : 'on'} your ${what}`;
  return (
    <RoundButton
      label={label}
      pressed={source === Track.Source.ScreenShare && enabled}
      onClick={() => void toggle()}
      disabled={pending}
      className={cn(source !== Track.Source.ScreenShare && !enabled && 'bg-red-500/20 text-red-300', className)}
    >
      {enabled || source === Track.Source.ScreenShare ? on : off}
    </RoundButton>
  );
}

function People({
  offeringId,
  sessionId,
  host,
  endsAt,
  enrolled,
  attendanceNote,
  now,
  participants,
  hands,
  students,
  me,
  busy,
  lower,
}: Props & {
  now: number;
  participants: Participant[];
  hands: Participant[];
  students: number;
  me: string;
  busy: boolean;
  lower: (identities: string[]) => Promise<void>;
}) {
  const people = [...participants].sort(
    (a, b) => Number(isHost(b)) - Number(isHost(a)) || nameOf(a).localeCompare(nameOf(b)),
  );
  return (
    <>
      <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto p-4">
        <dl className="grid grid-cols-3 gap-2">
          {[
            [`${students}`, `of ${enrolled} in class`],
            [`${hands.length}`, hands.length === 1 ? 'hand raised' : 'hands raised'],
            [formatTime(endsAt), 'ends at'],
          ].map(([value, label]) => (
            <div key={label} className="rounded-md bg-white/5 px-2.5 py-2 ring-1 ring-white/10">
              <dd className="text-base font-semibold tabular-nums">{value}</dd>
              <dt className="text-[0.6875rem] text-white/60">{label}</dt>
            </div>
          ))}
        </dl>

        {hands.length > 0 && (
          <section className="grid gap-1">
            <h2 className="flex items-center justify-between text-[0.6875rem] font-medium tracking-wide text-white/60 uppercase">
              Raised hands
              {host && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void lower(hands.map((p) => p.identity))}
                  className="text-xs font-medium tracking-normal text-white normal-case hover:underline"
                >
                  Lower all
                </button>
              )}
            </h2>
            <ol className="grid">
              {hands.map((p, i) => (
                <li key={p.identity} className="flex items-center gap-2.5 py-1.5 text-[0.8125rem]">
                  <span className="bg-gold text-foreground grid size-5 shrink-0 place-items-center rounded-sm text-[0.6875rem] font-bold">
                    {i + 1}
                  </span>
                  <Avatar p={p} />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate">{p.identity === me ? 'You' : nameOf(p)}</span>
                    <span className="text-xs text-white/60">{ago(now, handOf(p))}</span>
                  </span>
                  {(host || p.identity === me) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void lower([p.identity])}
                      className="h-7 rounded-md px-2.5 text-xs ring-1 ring-white/15 hover:bg-white/10"
                    >
                      Lower
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="grid gap-1">
          <h2 className="text-[0.6875rem] font-medium tracking-wide text-white/60 uppercase">
            In the room · {participants.length}
          </h2>
          <ul className="grid">
            {people.map((p) => (
              <li key={p.identity} className="flex items-center gap-2.5 py-1.5 text-[0.8125rem]">
                <Avatar p={p} />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate">
                    {nameOf(p)}
                    {p.identity === me && <span className="text-white/60"> (you)</span>}
                  </span>
                  {(isHost(p) || handOf(p) > 0) && (
                    <span className={cn('text-xs', handOf(p) > 0 ? 'text-gold' : 'text-white/60')}>
                      {handOf(p) > 0 ? 'Hand raised' : 'Host'}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2 text-white/60 [&_svg]:size-4">
                  {p.isSpeaking && (
                    <span className="flex h-3.5 items-end gap-0.5" aria-label="Speaking">
                      {[6, 12, 8].map((h) => (
                        <span key={h} className="bg-primary w-0.75 rounded-full" style={{ height: h }} />
                      ))}
                    </span>
                  )}
                  {p.isMicrophoneEnabled ? (
                    <MicrophoneIcon aria-label="Microphone on" />
                  ) : (
                    <MicrophoneSlashIcon aria-label="Microphone off" className="text-red-300" />
                  )}
                  {p.isCameraEnabled ? (
                    <VideoCameraIcon aria-label="Camera on" />
                  ) : (
                    <VideoCameraSlashIcon aria-label="Camera off" />
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {host && (
        <footer className="grid gap-2 border-t border-white/10 p-4 text-xs text-white/60">
          <p>{attendanceNote}</p>
          <ActionForm
            action={endSession}
            submitLabel="End class for everyone"
            submitVariant="destructive"
            submitIcon={<StopIcon weight="fill" />}
            fullWidth
            confirm={{
              title: 'End the class for everyone?',
              message: 'Everyone leaves the room and attendance is worked out from the time each student spent in it.',
            }}
          >
            <input type="hidden" name="offeringId" value={offeringId} />
            <input type="hidden" name="sessionId" value={sessionId} />
          </ActionForm>
        </footer>
      )}
    </>
  );
}

function Avatar({ p }: { p: Participant }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-[0.6875rem] font-semibold">
      {initials(nameOf(p))}
    </span>
  );
}

// In-class chat (kept at Aniket's request, 17 Oct 2026): LiveKit's data channel, so messages are not stored and reach
// only the people in the room at that moment.
function Chat({ me, chatMessages, send, isSending }: { me: string } & ReturnType<typeof useChat>) {
  const [draft, setDraft] = useState('');
  async function submit() {
    const text = draft.trim();
    if (!text) return;
    await send(text);
    setDraft('');
  }
  return (
    <>
      <ol className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-4">
        <li className="text-xs text-white/60">Messages are not saved. Only the people in the class now see them.</li>
        {chatMessages.map((m) => {
          const mine = m.from?.identity === me;
          return (
            <li key={m.id} className={cn('grid gap-0.5', mine && 'justify-items-end')}>
              <span className="text-xs text-white/60">
                {mine ? 'You' : (m.from?.name ?? 'Someone')} · {formatTime(new Date(m.timestamp))}
              </span>
              <span
                className={cn(
                  'max-w-[85%] rounded-md px-3 py-1.5 text-[0.8125rem] wrap-break-word whitespace-pre-wrap',
                  mine ? 'bg-primary' : 'bg-white/10',
                )}
              >
                {m.message}
              </span>
            </li>
          );
        })}
      </ol>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex gap-2 border-t border-white/10 p-3"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={500}
          aria-label="Message"
          placeholder="Write a message"
          className="h-9 min-w-0 flex-1 rounded-md bg-white/10 px-3 text-[0.8125rem] outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-white/30"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={isSending || draft.trim() === ''}
          className="bg-primary grid size-9 place-items-center rounded-md disabled:opacity-50"
        >
          <PaperPlaneRightIcon weight="fill" className="size-4" />
        </button>
      </form>
    </>
  );
}
