'use client';

import '@livekit/components-styles';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  isTrackReference,
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useChat,
  useDataChannel,
  useLocalParticipant,
  useLocalParticipantPermissions,
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
  ArrowSquareOutIcon,
  ArrowUUpLeftIcon,
  ChatCircleIcon,
  CornersInIcon,
  CornersOutIcon,
  DotsThreeVerticalIcon,
  HandPalmIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  MonitorArrowUpIcon,
  PaperPlaneRightIcon,
  PhoneDisconnectIcon,
  PictureInPictureIcon,
  PushPinIcon,
  PushPinSlashIcon,
  SmileyIcon,
  StopIcon,
  UserMinusIcon,
  UsersIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
  XIcon,
} from '@phosphor-icons/react';
import { DisconnectReason, RoomEvent, Track, type Participant, type RoomOptions } from 'livekit-client';
import {
  allowBack,
  endSession,
  lowerHands,
  muteEveryone,
  muteParticipant,
  raiseHand,
  removeParticipant,
  setStudentRight,
} from '@/app/(app)/courses/[offeringId]/live/actions';
import { ActionForm } from '@/components/action-form';
import { RoomNotice } from '@/components/room-notice';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import { formatTime, initials } from '@/lib/format';
import type { StudentRight } from '@/lib/schemas/live';

type Controls = {
  rights: Record<StudentRight, boolean>;
  removed: { id: string; name: string; at: Date }[];
};
type Props = {
  offeringId: string;
  sessionId: string;
  serverUrl: string;
  token: string;
  // A student: focused time is counted (T5) and they may raise a hand. A host (the class's teachers, admins): may
  // lower anyone's hand, mute, remove, set what students may do, and end the class.
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
  // M03c T2, hosts only: what students may do, and who was removed (the latest first).
  controls: Controls | null;
};
type State = 'in' | 'left' | 'replaced' | 'dropped' | 'ended' | 'failed' | 'removed';
type Panel = 'people' | 'chat';
type Layout = 'auto' | 'tiled' | 'spotlight' | 'sidebar';
type View = { layout: Layout; hideNoVideo: boolean; showSelf: boolean; joinSound: boolean };
type Float = { id: number; emoji: string; name: string };
// A data message: `from` is unset for one the server sent.
type Message = { payload: Uint8Array; from?: Participant };

const BEACON_MS = 60_000;
// LiveKit sends small tiles at a lower quality and pauses video nobody sees; the mini window counts as seen.
const ROOM_OPTIONS: RoomOptions = { adaptiveStream: true, dynacast: true };
// M03c T1, as in Google Meet (Aniket's pick R1-A: Auto puts the faces beside a shared screen).
const LAYOUTS: { value: Layout; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'faces beside a shared screen' },
  { value: 'tiled', label: 'Tiled', hint: 'everyone the same size' },
  { value: 'spotlight', label: 'Spotlight', hint: 'one person or the screen' },
  { value: 'sidebar', label: 'Sidebar', hint: 'one large, faces at the side' },
];
const RIGHTS: [StudentRight, string][] = [
  ['share', 'Students can share their screen'],
  ['unmute', 'Students can turn on their microphone'],
  ['chat', 'Students can send chat messages and reactions'],
];
// The join sound (Aniket, 17 Oct 2026): a soft bell made with Web Audio, so there is no file to load. At most one in
// two seconds, so a crowd joining at the start rings once or twice.
const JOIN_GAP_MS = 2_000;
function ring(audio: AudioContext) {
  const at = audio.currentTime;
  for (const [hz, peak] of [
    [784, 0.2],
    [1568, 0.06],
  ]) {
    const tone = audio.createOscillator();
    const level = audio.createGain();
    tone.frequency.value = hz;
    level.gain.setValueAtTime(0.0001, at);
    level.gain.exponentialRampToValueAtTime(peak, at + 0.01);
    level.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
    tone.connect(level).connect(audio.destination);
    tone.start(at);
    tone.stop(at + 0.9);
  }
}
const REACTIONS: [string, string][] = [
  ['👍', 'thumbs up'],
  ['❤️', 'heart'],
  ['😂', 'laughing'],
  ['😮', 'surprised'],
  ['👏', 'clapping'],
  ['🎉', 'party popper'],
  ['🤔', 'thinking'],
];

// The class fills the tab it was opened in (M03b, "like Google Meet in a tab"), laid out as "A · Stage and side panel"
// (Aniket's pick, 17 Oct 2026): the stage with the title, the time live and round controls floating over it, and a
// side panel with the people (host controls first for hosts, raised hands in the order raised) and the chat. M03c
// adds Meet's layouts and pinning, a mini window that floats over other tabs and apps, reactions and host controls.
export function LiveRoom(props: Props) {
  const { sessionId, serverUrl, trackFocus, classPage } = props;
  const router = useRouter();
  const [state, setState] = useState<State>('in');
  // The token joined with. A host control refreshes the page, which brings a new token that must not reconnect the
  // room: LiveKit renews the token while connected, and Rejoin reloads the page for a new one.
  const [token] = useState(props.token);
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
      removed: {
        title: 'You were removed from this class',
        text: `A teacher removed you from “${props.title}”. You can join again if a teacher lets you back. Your time in the class so far still counts.`,
        again: false,
      },
    };
    const { title, text, again } = copy[state];
    return (
      <RoomNotice title={title} text={text}>
        {again ? (
          // Outline buttons are white with dark text: they stand out on the dark stage, whose text is white. Rejoining
          // reloads the page, so a class that has ended in the meantime shows that instead.
          <Button onClick={() => window.location.reload()} variant="outline" className="text-foreground">
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
        serverUrl={serverUrl}
        token={token}
        connect
        options={ROOM_OPTIONS}
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
          } else if (reason === DisconnectReason.PARTICIPANT_REMOVED) setState('removed');
          else if (reason === DisconnectReason.DUPLICATE_IDENTITY) setState('replaced');
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

// What the browser can do: full screen, and a mini window (Chrome and Edge: a whole window; others: the video only).
const never = () => () => undefined;
const onFullscreen = (notify: () => void) => {
  document.addEventListener('fullscreenchange', notify);
  return () => document.removeEventListener('fullscreenchange', notify);
};
function useBrowser() {
  const fullscreen = useSyncExternalStore(
    onFullscreen,
    () => document.fullscreenElement !== null,
    () => false,
  );
  const canFullscreen = useSyncExternalStore(
    never,
    () => document.fullscreenEnabled,
    () => false,
  );
  const canPopOut = useSyncExternalStore(
    never,
    () => window.documentPictureInPicture !== undefined || document.pictureInPictureEnabled,
    () => false,
  );
  return { fullscreen, canFullscreen, canPopOut };
}

// The token gives each participant a `role`; a raised hand is the attribute `hand`, the time it was raised (ms), set by
// the server (lib/integrations/live.ts).
const isHost = (p: Participant) => p.attributes.role === 'host';
const handOf = (p: Participant) => Number(p.attributes.hand) || 0;
const nameOf = (p: Participant) => p.name || p.identity;
const clock = (sec: number) =>
  [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map((n) => String(n).padStart(2, '0')).join(':');
const ago = (now: number, at: number) => {
  const min = Math.floor((now - at / 1000) / 60);
  return min < 1 ? 'just now' : `${min} min ago`;
};
const cameraOn = (ref: TrackReferenceOrPlaceholder | undefined) =>
  ref !== undefined && isTrackReference(ref) && !ref.publication.isMuted;
const keyOf = (t: TrackReferenceOrPlaceholder) => `${t.participant.identity}:${t.source}`;
const decode = (payload: Uint8Array) => new TextDecoder().decode(payload);
// Faces in order: hosts, raised hands as raised, whoever spoke last, then by name.
const byPlace = (a: TrackReferenceOrPlaceholder, b: TrackReferenceOrPlaceholder) => {
  const [p, q] = [a.participant, b.participant];
  return (
    Number(isHost(q)) - Number(isHost(p)) ||
    (handOf(p) || Infinity) - (handOf(q) || Infinity) ||
    (q.lastSpokeAt?.getTime() ?? 0) - (p.lastSpokeAt?.getTime() ?? 0) ||
    nameOf(p).localeCompare(nameOf(q))
  );
};

function Classroom(props: Props) {
  const { offeringId, sessionId, host } = props;
  const router = useRouter();
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const permissions = useLocalParticipantPermissions();
  const cameras = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });
  const screens = useTracks([Track.Source.ScreenShare]);
  const now = useNow();
  const wide = useWide();
  const browser = useBrowser();
  // Unset until the viewer chooses: the people panel opens by itself on a wide screen only.
  const [choice, setChoice] = useState<Panel | null>();
  const panel = choice === undefined ? (wide ? 'people' : null) : choice;
  // Hosts hear the join sound unless they turn it off; students only if they turn it on.
  const [view, setView] = useState<View>({ layout: 'auto', hideNoVideo: false, showSelf: true, joinSound: host });
  // A tile the viewer pinned for themselves: `identity:source`.
  const [pinned, setPinned] = useState<string | null>(null);
  const [tray, setTray] = useState(false);
  const [floats, setFloats] = useState<Float[]>([]);
  const floatId = useRef(0);
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  const [pip, setPip] = useState<Window | null>(null);
  // The student a host is about to remove; kept while the dialog closes, so its title keeps their name.
  const [removing, setRemoving] = useState<{ p: Participant; open: boolean } | null>(null);
  const [dismissed, setDismissed] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chat = useChat();
  const [seen, setSeen] = useState(0);
  const unread = panel === 'chat' ? 0 : Math.max(0, chat.chatMessages.length - seen);

  const me = localParticipant.identity;
  const hands = participants.filter((p) => handOf(p) > 0).sort((a, b) => handOf(a) - handOf(b));
  const handPlace = (p: Participant) => hands.findIndex((h) => h.identity === p.identity) + 1;
  const students = participants.filter((p) => !isHost(p));
  const myHand = handOf(localParticipant);
  const place = handPlace(localParticipant);
  const ref = { offeringId, sessionId };

  // What this student may do now (M03c T2). The engine enforces it; the buttons only say so. An empty list of sources
  // allows them all.
  const sources = permissions?.canPublishSources ?? [];
  const may = (source: Track.Source) => host || sources.length === 0 || sources.includes(Track.sourceToProto(source));
  const mayChat = host || permissions?.canPublishData !== false;

  // Messages from the server (`tell` in lib/integrations/live.ts); one a browser sends on these topics is ignored.
  const onNotice = useCallback((m: Message) => {
    if (!m.from) setNotice({ id: Date.now(), text: decode(m.payload) });
  }, []);
  useDataChannel('notice', onNotice);
  const onControls = useCallback(
    (m: Message) => {
      if (!m.from && host) router.refresh();
    },
    [host, router],
  );
  useDataChannel('controls', onControls);
  // M03c T3: reactions go straight to the browsers in the room (not stored); the sender sees their own at once.
  const float = useCallback((emoji: string, name: string) => {
    floatId.current += 1;
    const id = floatId.current;
    setFloats((list) => [...list.slice(-19), { id, emoji, name }]);
    window.setTimeout(() => setFloats((list) => list.filter((f) => f.id !== id)), 4000);
  }, []);
  const onReaction = useCallback(
    (m: Message) => {
      const emoji = decode(m.payload);
      if (m.from && REACTIONS.some(([e]) => e === emoji)) float(emoji, nameOf(m.from).split(' ')[0]);
    },
    [float],
  );
  const reactions = useDataChannel('reaction', onReaction);

  // A tab may play sound only once the viewer has clicked or typed in it, so the bell starts after the first click
  // (LiveKit's "Turn on sound" counts).
  useEffect(() => {
    if (!view.joinSound) return;
    const audio = new AudioContext();
    let last = 0;
    const wake = () => void audio.resume();
    const joined = () => {
      const now = Date.now();
      if (audio.state !== 'running' || now - last < JOIN_GAP_MS) return;
      last = now;
      ring(audio);
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    room.on(RoomEvent.ParticipantConnected, joined);
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      room.off(RoomEvent.ParticipantConnected, joined);
      void audio.close();
    };
  }, [room, view.joinSound]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // M03c T1: the mini window. Chrome and Edge open a small always-on-top window holding the stage and the main
  // controls (Document Picture-in-Picture), by themselves when the tab is left while the camera or microphone is on;
  // other browsers float the stage's video.
  const popOut = useCallback(async () => {
    const api = window.documentPictureInPicture;
    if (!api) {
      await document.querySelector<HTMLVideoElement>('[data-main] video')?.requestPictureInPicture();
      return;
    }
    if (api.window) return;
    const win = await api.requestWindow({ width: 420, height: 300 });
    for (const node of document.head.querySelectorAll('link[rel="stylesheet"], style')) {
      win.document.head.append(node.cloneNode(true));
    }
    win.document.documentElement.className = document.documentElement.className;
    win.addEventListener('pagehide', () => setPip(null), { once: true });
    setPip(win);
  }, []);
  const openMini = useCallback(
    () => void popOut().catch(() => setError('Your browser did not open the mini window.')),
    [popOut],
  );
  useEffect(() => {
    if (!window.documentPictureInPicture) return;
    navigator.mediaSession.setActionHandler('enterpictureinpicture', openMini);
    return () => {
      navigator.mediaSession.setActionHandler('enterpictureinpicture', null);
      window.documentPictureInPicture?.window?.close();
    };
  }, [openMini]);

  async function run(change: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setError(null);
    const result = await change();
    setBusy(false);
    if (!result.ok) setError(result.message ?? 'That did not work. Try again.');
    return result.ok;
  }
  const lower = (identities: string[]) => run(() => lowerHands({ ...ref, 'identity[]': identities }));
  const toggleHand = () => (myHand ? lower([me]) : run(() => raiseHand(ref)));
  const open = (next: Panel) => {
    if (panel === 'chat' || next === 'chat') setSeen(chat.chatMessages.length);
    setChoice(panel === next ? null : next);
  };
  const react = (emoji: string) => {
    float(emoji, 'You');
    reactions.send(new TextEncoder().encode(emoji), { reliable: false }).catch(() => setError('Could not send that.'));
  };
  const toggleFullscreen = () =>
    (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() =>
      setError('Your browser did not go full screen.'),
    );
  const pin = (key: string) => setPinned(pinned === key ? null : key);
  const menuFor = (p: Participant, key: string) => (
    <PersonMenu
      p={p}
      self={p.identity === me}
      host={host}
      pinned={pinned === key}
      onPin={() => pin(key)}
      onMute={() => void run(() => muteParticipant({ ...ref, identity: p.identity }))}
      onLower={() => void lower([p.identity])}
      onRemove={() => setRemoving({ p, open: true })}
    />
  );

  // The main tile: what the viewer pinned; else a shared screen; else a host's camera (the one speaking, if any), then
  // anyone speaking, then any camera; with no camera on, the first host's (or the viewer's) initials.
  const cameraOf = (p: Participant) => cameras.find((c) => c.participant.identity === p.identity);
  const pinnedTile = pinned === null ? undefined : [...screens, ...cameras].find((t) => keyOf(t) === pinned);
  const speakers = room.activeSpeakers;
  const main =
    pinnedTile ??
    screens[0] ??
    [...speakers.filter(isHost), ...participants.filter(isHost), ...speakers, ...participants]
      .filter((p) => p.identity !== me || participants.length === 1)
      .map(cameraOf)
      .find(cameraOn) ??
    cameraOf(participants.find(isHost) ?? localParticipant);
  const faces = cameras
    .filter((c) => (view.showSelf || c.participant.identity !== me) && (!view.hideNoVideo || cameraOn(c)))
    .sort(byPlace);
  // Auto puts the faces beside a shared screen or a pinned tile (R1-A); Sidebar always.
  const withStrip =
    view.layout === 'sidebar' || (view.layout === 'auto' && (pinnedTile !== undefined || screens.length > 0));
  const mine = cameraOf(localParticipant);
  const latest = hands.at(-1);
  const toastKey = latest ? `${latest.identity}:${handOf(latest)}` : '';
  const tile = (t: TrackReferenceOrPlaceholder, className: string, isMain = false, fills = false) => (
    <Tile
      key={keyOf(t)}
      trackRef={t}
      fit={t.source === Track.Source.ScreenShare ? 'contain' : 'cover'}
      className={className}
      labelClassName={fills ? 'max-sm:bottom-20' : undefined}
      label={
        t.source === Track.Source.ScreenShare
          ? `${t.participant.identity === me ? 'You are' : `${nameOf(t.participant)} is`} presenting`
          : t.participant.identity === me
            ? 'You'
            : nameOf(t.participant)
      }
      hand={t.source === Track.Source.Camera ? handPlace(t.participant) : 0}
      pinned={pinned === keyOf(t)}
      main={isMain}
      // A tile that fills the stage would put its menu under the time live; the People panel has the same menu.
      menu={fills ? undefined : menuFor(t.participant, keyOf(t))}
    />
  );

  let stage: ReactNode;
  if (view.layout === 'tiled') {
    // Everyone the same size; a pinned tile or a shared screen takes four cells.
    const big = pinnedTile ?? screens[0];
    const all = [...(big ? [big] : []), ...[...screens, ...faces].filter((t) => !big || keyOf(t) !== keyOf(big))];
    const cap = wide ? 16 : 6;
    const shown = all.length > cap ? all.slice(0, cap - 1) : all;
    const more = all.length - shown.length;
    const cells = shown.length + (more > 0 ? 1 : 0) + (big ? 3 : 0);
    const cols = wide ? (cells <= 1 ? 1 : cells <= 4 ? 2 : cells <= 9 ? 3 : 4) : cells <= 1 ? 1 : 2;
    stage = (
      <div
        className="absolute inset-0 grid gap-2 px-2 pt-14 pb-20"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${Math.ceil(cells / cols)}, minmax(0, 1fr))`,
        }}
      >
        {shown.map((t) => tile(t, cn('relative', t === big && cols > 1 && 'col-span-2 row-span-2'), t === big))}
        {more > 0 && <MoreTile more={more} onClick={() => open('people')} />}
      </div>
    );
  } else if (withStrip) {
    // The main tile large, the faces beside it (below it on a phone), so nobody disappears while someone presents.
    const others = faces.filter((t) => !main || keyOf(t) !== keyOf(main));
    const cap = wide ? 5 : 3;
    const shown = others.length > cap ? others.slice(0, cap - 1) : others;
    stage = (
      <div className="absolute inset-0 flex flex-col gap-2 px-2 pt-14 pb-20 lg:flex-row">
        <div className="relative min-h-0 min-w-0 flex-1">{main && tile(main, 'absolute inset-0', true)}</div>
        {others.length > 0 && (
          <div className="flex h-20 shrink-0 gap-2 overflow-hidden sm:h-24 lg:h-auto lg:w-56 lg:flex-col">
            {shown.map((t) => tile(t, 'relative aspect-video h-full shrink-0 lg:h-auto lg:w-full'))}
            {others.length > shown.length && (
              <MoreTile
                more={others.length - shown.length}
                onClick={() => open('people')}
                className="aspect-video h-full shrink-0 lg:h-auto lg:w-full"
              />
            )}
          </div>
        )}
      </div>
    );
  } else {
    // Spotlight, and Auto with nobody presenting (M03b's stage): the main tile fills it; your own sits in a corner.
    stage = (
      <>
        {main && tile(main, 'absolute inset-0 rounded-none bg-transparent', true, true)}
        {view.showSelf && mine && main?.participant.identity !== me && (
          <Tile
            trackRef={mine}
            fit="cover"
            className="absolute right-3 bottom-20 aspect-4/3 w-32 bg-(--lk-bg) ring-1 ring-white/15 sm:w-44 lg:w-52"
            label="You"
            hand={place}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="relative flex min-w-0 flex-1 flex-col p-2 sm:p-3">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-white/4">
          {stage}

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

          <div className="absolute top-14 left-1/2 grid w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 justify-items-center gap-2">
            {notice && (
              <p
                role="status"
                className="bg-background text-foreground max-w-full truncate rounded-md px-3 py-1.5 text-[0.8125rem]"
              >
                {notice.text}
              </p>
            )}
            {host && latest && toastKey !== dismissed && (
              <div
                role="status"
                className="bg-background text-foreground flex max-w-full items-center gap-2.5 rounded-md py-1.5 pr-1.5 pl-3 text-[0.8125rem]"
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
          </div>

          {error && (
            <p
              role="alert"
              className="bg-destructive absolute bottom-20 left-1/2 max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-md px-3 py-1.5 text-[0.8125rem] text-white"
            >
              {error}
            </p>
          )}

          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-20">
            {floats.map((f) => (
              <span
                key={f.id}
                className="motion-safe:animate-reaction absolute bottom-0 grid justify-items-center text-3xl"
                style={{ left: `${55 + ((f.id * 37) % 35)}%` }}
              >
                {f.emoji}
                <span className="mt-0.5 rounded-sm bg-black/60 px-1.5 text-[0.6875rem] text-white">{f.name}</span>
              </span>
            ))}
          </div>

          {tray && (
            <div className="absolute bottom-19 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-full bg-black/70 p-1.5 ring-1 ring-white/10">
              {REACTIONS.map(([emoji, label]) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`Send ${label}`}
                  title={label}
                  onClick={() => react(emoji)}
                  className="grid size-9 place-items-center rounded-full text-2xl hover:bg-white/15 sm:size-10"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/70 p-1.5 ring-1 ring-white/10 sm:gap-2">
            <MediaToggle
              source={Track.Source.Microphone}
              on={<MicrophoneIcon />}
              off={<MicrophoneSlashIcon />}
              locked={may(Track.Source.Microphone) ? undefined : 'A teacher turned off microphones for students'}
            />
            <MediaToggle source={Track.Source.Camera} on={<VideoCameraIcon />} off={<VideoCameraSlashIcon />} />
            <MediaToggle
              source={Track.Source.ScreenShare}
              on={<MonitorArrowUpIcon />}
              off={<MonitorArrowUpIcon />}
              locked={may(Track.Source.ScreenShare) ? undefined : 'A teacher turned off screen sharing for students'}
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
              label={mayChat ? 'Send a reaction' : 'A teacher turned off reactions for students'}
              pressed={tray}
              onClick={() => setTray(!tray)}
              disabled={!mayChat}
              className="max-sm:hidden"
            >
              <SmileyIcon />
            </RoundButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <RoundButton label="More options">
                  <DotsThreeVerticalIcon weight="bold" />
                </RoundButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="center" className="w-72">
                <DropdownMenuLabel>Layout</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={view.layout}
                  onValueChange={(value) => {
                    const layout = LAYOUTS.find((l) => l.value === value)?.value;
                    if (layout) setView({ ...view, layout });
                  }}
                >
                  {LAYOUTS.map((l) => (
                    <DropdownMenuRadioItem key={l.value} value={l.value}>
                      {l.label}
                      <span className="text-muted-foreground ml-auto text-xs">{l.hint}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={view.hideNoVideo}
                  onCheckedChange={(checked) => setView({ ...view, hideNoVideo: checked })}
                >
                  Hide people without video
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={view.showSelf}
                  onCheckedChange={(checked) => setView({ ...view, showSelf: checked })}
                >
                  Show my own tile
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={view.joinSound}
                  onCheckedChange={(checked) => setView({ ...view, joinSound: checked })}
                >
                  Sound when someone joins
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {browser.canPopOut && (
                  <DropdownMenuItem onSelect={openMini}>
                    <PictureInPictureIcon /> Pop out mini window
                  </DropdownMenuItem>
                )}
                {browser.canFullscreen && (
                  <DropdownMenuItem onSelect={() => void toggleFullscreen()}>
                    {browser.fullscreen ? <CornersInIcon /> : <CornersOutIcon />}
                    {browser.fullscreen ? 'Exit full screen' : 'Full screen'}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="sm:hidden" disabled={!mayChat} onSelect={() => setTray(!tray)}>
                  <SmileyIcon /> {tray ? 'Hide reactions' : 'Send a reaction'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="mx-0.5 h-6 w-px bg-white/15 max-sm:hidden" />
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
            <span className="mx-0.5 h-6 w-px bg-white/15 max-sm:hidden" />
            <button
              type="button"
              onClick={() => void room.disconnect()}
              aria-label="Leave"
              className="bg-destructive hover:bg-destructive/90 flex h-10 items-center gap-2 rounded-full px-2.5 text-[0.8125rem] font-semibold text-white sm:h-11 sm:px-4"
            >
              <PhoneDisconnectIcon className="size-5" />
              <span className="max-sm:hidden">Leave</span>
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
              me={me}
              busy={busy}
              lower={lower}
              menuFor={(p) => menuFor(p, `${p.identity}:${Track.Source.Camera}`)}
              setRight={(right, allowed) => void run(() => setStudentRight({ ...ref, right, allowed }))}
              muteAll={() =>
                void run(() => muteEveryone(ref)).then(
                  (ok) => ok && setNotice({ id: Date.now(), text: 'Turning off everyone else’s microphone' }),
                )
              }
              letBack={(identity) => void run(() => allowBack({ ...ref, identity }))}
            />
          ) : (
            <Chat me={me} locked={!mayChat} {...chat} />
          )}
        </aside>
      )}

      <AlertDialog
        open={removing?.open === true}
        onOpenChange={(isOpen) => !isOpen && removing && setRemoving({ ...removing, open: false })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing ? nameOf(removing.p) : ''} from the class?</AlertDialogTitle>
            <AlertDialogDescription>
              They leave the room now and cannot join again until a teacher lets them back. Their time in the class so
              far still counts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy || !removing?.open}
              onClick={() =>
                removing &&
                void run(() => removeParticipant({ ...ref, identity: removing.p.identity })).then(() =>
                  setRemoving({ ...removing, open: false }),
                )
              }
            >
              <UserMinusIcon /> Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pip &&
        createPortal(
          <MiniWindow
            title={props.title}
            elapsed={
              props.startedAt && now > 0 ? clock(Math.max(0, now - Math.floor(props.startedAt.getTime() / 1000))) : ''
            }
            main={main}
            faces={faces.filter((t) => !main || keyOf(t) !== keyOf(main)).slice(0, 3)}
            host={host}
            myHand={myHand}
            place={place}
            busy={busy}
            mayUnmute={may(Track.Source.Microphone)}
            toggleHand={() => void toggleHand()}
            back={() => {
              window.focus();
              pip.close();
            }}
            leave={() => void room.disconnect()}
          />,
          pip.document.body,
        )}
    </>
  );
}

// M03c T1 (Aniket's pick R1-D): the screen or speaker, a few faces, and the microphone, hand, back-to-class and leave.
function MiniWindow({
  title,
  elapsed,
  main,
  faces,
  host,
  myHand,
  place,
  busy,
  mayUnmute,
  toggleHand,
  back,
  leave,
}: {
  title: string;
  elapsed: string;
  main: TrackReferenceOrPlaceholder | undefined;
  faces: TrackReferenceOrPlaceholder[];
  host: boolean;
  myHand: number;
  place: number;
  busy: boolean;
  mayUnmute: boolean;
  toggleHand: () => void;
  back: () => void;
  leave: () => void;
}) {
  const label = (t: TrackReferenceOrPlaceholder) =>
    t.source === Track.Source.ScreenShare ? `${nameOf(t.participant)} is presenting` : nameOf(t.participant);
  return (
    <div data-lk-theme="default" className="flex h-dvh flex-col bg-(--lk-bg) text-(--lk-fg)">
      <header className="flex h-8 shrink-0 items-center gap-2 px-2.5 text-xs text-white/60">
        <span className="bg-destructive size-2 shrink-0 rounded-full" />
        <span className="truncate font-semibold text-white">{title}</span>
        {elapsed && <span className="shrink-0 tabular-nums">· {elapsed}</span>}
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_6rem] gap-1.5 px-1.5">
        <div className="relative min-h-0">
          {main && (
            <Tile
              trackRef={main}
              fit={main.source === Track.Source.ScreenShare ? 'contain' : 'cover'}
              className="absolute inset-0"
              label={label(main)}
              hand={0}
            />
          )}
        </div>
        <div className="grid min-h-0 auto-rows-fr gap-1.5">
          {faces.map((t) => (
            <Tile key={keyOf(t)} trackRef={t} fit="cover" className="relative" label={label(t)} hand={0} />
          ))}
        </div>
      </div>
      <footer className="flex h-13 shrink-0 items-center justify-center gap-2 border-t border-white/10">
        <MediaToggle
          source={Track.Source.Microphone}
          on={<MicrophoneIcon />}
          off={<MicrophoneSlashIcon />}
          locked={mayUnmute ? undefined : 'A teacher turned off microphones for students'}
        />
        {!host && (
          <RoundButton
            label={myHand ? `Lower your hand (${place} in line)` : 'Raise your hand'}
            pressed={myHand > 0}
            onClick={toggleHand}
            disabled={busy}
            className={myHand ? 'bg-gold text-foreground hover:bg-gold/90' : undefined}
          >
            <HandPalmIcon weight={myHand ? 'fill' : 'regular'} />
          </RoundButton>
        )}
        <RoundButton label="Back to the class tab" onClick={back}>
          <ArrowSquareOutIcon />
        </RoundButton>
        <RoundButton label="Leave" onClick={leave} className="bg-destructive hover:bg-destructive/90">
          <PhoneDisconnectIcon />
        </RoundButton>
      </footer>
    </div>
  );
}

function Tile({
  trackRef,
  fit,
  className,
  labelClassName,
  label,
  hand,
  pinned = false,
  main = false,
  menu,
}: {
  trackRef: TrackReferenceOrPlaceholder;
  fit: 'cover' | 'contain';
  className?: string;
  labelClassName?: string;
  label: string;
  hand: number;
  pinned?: boolean;
  // The stage's main tile: the video other browsers float as the mini window.
  main?: boolean;
  menu?: ReactNode;
}) {
  const p = trackRef.participant;
  return (
    <div
      data-main={main || undefined}
      className={cn(
        'group relative overflow-hidden rounded-lg bg-white/6',
        !main && p.isSpeaking && 'ring-primary ring-2 ring-inset',
        hand > 0 && 'ring-gold ring-2 ring-inset',
        className,
      )}
    >
      {cameraOn(trackRef) && isTrackReference(trackRef) ? (
        <VideoTrack
          trackRef={trackRef}
          className={cn('size-full', fit === 'cover' ? 'object-cover' : 'object-contain')}
        />
      ) : (
        <span className="grid size-full place-items-center">
          <span className="grid aspect-square w-[min(30%,5rem)] min-w-10 place-items-center rounded-full bg-white/10 text-[clamp(0.75rem,3vw,1.5rem)] font-semibold">
            {initials(nameOf(p))}
          </span>
        </span>
      )}
      {hand > 0 && (
        <span className="bg-gold text-foreground absolute top-2 left-2 flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-semibold">
          <HandPalmIcon weight="fill" className="size-3.5" /> {hand}
        </span>
      )}
      {menu && (
        <div className="absolute top-2 right-2 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100 lg:has-data-[state=open]:opacity-100">
          {menu}
        </div>
      )}
      <span
        className={cn(
          'absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-sm bg-black/60 px-2 py-0.5 text-xs',
          labelClassName,
        )}
      >
        {pinned && <PushPinIcon weight="fill" aria-label="Pinned" className="size-3.5 shrink-0" />}
        {trackRef.source === Track.Source.ScreenShare ? (
          <MonitorArrowUpIcon className="size-3.5 shrink-0" />
        ) : p.isMicrophoneEnabled ? (
          <MicrophoneIcon className="size-3.5 shrink-0" />
        ) : (
          <MicrophoneSlashIcon className="size-3.5 shrink-0 text-red-300" />
        )}
        <span className="truncate">{label}</span>
      </span>
    </div>
  );
}

function MoreTile({ more, onClick, className }: { more: number; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'grid place-items-center rounded-lg bg-white/6 text-[0.8125rem] text-white/60 hover:bg-white/10 hover:text-white',
        className,
      )}
    >
      + {more} more
    </button>
  );
}

// Pin for me, for everyone; mute, lower the hand and remove (students only) for hosts (R1-B, R1-C).
function PersonMenu({
  p,
  self,
  host,
  pinned,
  onPin,
  onMute,
  onLower,
  onRemove,
}: {
  p: Participant;
  self: boolean;
  host: boolean;
  pinned: boolean;
  onPin: () => void;
  onMute: () => void;
  onLower: () => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Options for ${self ? 'you' : nameOf(p)}`}
          className="grid size-7 place-items-center rounded-md bg-black/60 text-white/80 hover:bg-black/80 hover:text-white data-[state=open]:bg-black/80"
        >
          <DotsThreeVerticalIcon weight="bold" className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem onSelect={onPin}>
          {pinned ? <PushPinSlashIcon /> : <PushPinIcon />} {pinned ? 'Unpin' : 'Pin for me'}
        </DropdownMenuItem>
        {host && !self && p.isMicrophoneEnabled && (
          <DropdownMenuItem onSelect={onMute}>
            <MicrophoneSlashIcon /> Mute
          </DropdownMenuItem>
        )}
        {host && handOf(p) > 0 && (
          <DropdownMenuItem onSelect={onLower}>
            <HandPalmIcon /> Lower hand
          </DropdownMenuItem>
        )}
        {host && !self && !isHost(p) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              <UserMinusIcon /> Remove from class
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RoundButton({
  label,
  pressed,
  badge = 0,
  className,
  children,
  ...button
}: ComponentProps<'button'> & { label: string; pressed?: boolean; badge?: number }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        'relative grid size-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-60 sm:size-11 [&_svg]:size-5',
        pressed && 'bg-primary hover:bg-primary/90',
        className,
      )}
      {...button}
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
  locked,
  className,
}: {
  source: Track.Source.Microphone | Track.Source.Camera | Track.Source.ScreenShare;
  on: ReactNode;
  off: ReactNode;
  // Why a host has turned this off for students, if they have.
  locked?: string;
  className?: string;
}) {
  const { enabled, pending, toggle } = useTrackToggle({ source });
  const what = source === Track.Source.Microphone ? 'microphone' : source === Track.Source.Camera ? 'camera' : 'screen';
  const label =
    locked ??
    (source === Track.Source.ScreenShare
      ? enabled
        ? 'Stop sharing your screen'
        : 'Share your screen'
      : `Turn ${enabled ? 'off' : 'on'} your ${what}`);
  return (
    <RoundButton
      label={label}
      pressed={source === Track.Source.ScreenShare && enabled}
      onClick={() => void toggle()}
      disabled={pending || locked !== undefined}
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
  controls,
  now,
  participants,
  hands,
  students,
  me,
  busy,
  lower,
  menuFor,
  setRight,
  muteAll,
  letBack,
}: Props & {
  now: number;
  participants: Participant[];
  hands: Participant[];
  students: number;
  me: string;
  busy: boolean;
  lower: (identities: string[]) => Promise<boolean>;
  menuFor: (p: Participant) => ReactNode;
  setRight: (right: StudentRight, allowed: boolean) => void;
  muteAll: () => void;
  letBack: (identity: string) => void;
}) {
  const people = [...participants].sort(
    (a, b) => Number(isHost(b)) - Number(isHost(a)) || nameOf(a).localeCompare(nameOf(b)),
  );
  const heading = 'text-[0.6875rem] font-medium tracking-wide text-white/60 uppercase';
  const small = 'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs ring-1 ring-white/15 hover:bg-white/10';
  return (
    <>
      <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto p-4">
        {host && controls && (
          <section className="grid gap-1.5">
            <h2 className={heading}>Host controls</h2>
            <div className="grid gap-3 rounded-md p-3 ring-1 ring-white/10">
              {RIGHTS.map(([right, label]) => (
                <label key={right} className="flex items-center justify-between gap-3 text-[0.8125rem]">
                  {label}
                  <Switch
                    checked={controls.rights[right]}
                    disabled={busy}
                    onCheckedChange={(allowed) => setRight(right, allowed)}
                    className="data-[state=unchecked]:bg-white/20"
                  />
                </label>
              ))}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={muteAll} className={small}>
                  <MicrophoneSlashIcon className="size-3.5" /> Mute everyone
                </button>
                <button
                  type="button"
                  disabled={busy || hands.length === 0}
                  onClick={() => void lower(hands.map((p) => p.identity))}
                  className={cn(small, 'disabled:opacity-50')}
                >
                  <HandPalmIcon className="size-3.5" /> Lower all hands
                </button>
              </div>
            </div>
          </section>
        )}

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
            <h2 className={heading}>Raised hands</h2>
            <ol className="grid">
              {hands.map((p, i) => (
                <li key={p.identity} className="flex items-center gap-2.5 py-1.5 text-[0.8125rem]">
                  <span className="bg-gold text-foreground grid size-5 shrink-0 place-items-center rounded-sm text-[0.6875rem] font-bold">
                    {i + 1}
                  </span>
                  <Avatar name={nameOf(p)} />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate">{p.identity === me ? 'You' : nameOf(p)}</span>
                    <span className="text-xs text-white/60">raised {ago(now, handOf(p))}</span>
                  </span>
                  {(host || p.identity === me) && (
                    <button type="button" disabled={busy} onClick={() => void lower([p.identity])} className={small}>
                      Lower
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="grid gap-1">
          <h2 className={heading}>In the room · {participants.length}</h2>
          <ul className="grid">
            {people.map((p) => (
              <li key={p.identity} className="flex items-center gap-2.5 py-1.5 text-[0.8125rem]">
                <Avatar name={nameOf(p)} />
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
                  {menuFor(p)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {host && controls && controls.removed.length > 0 && (
          <section className="grid gap-1">
            <h2 className={heading}>Removed · {controls.removed.length}</h2>
            <ul className="grid">
              {controls.removed.map((r) => (
                <li key={r.id} className="flex items-center gap-2.5 py-1.5 text-[0.8125rem]">
                  <Avatar name={r.name} />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate">{r.name}</span>
                    <span className="text-xs text-white/60">removed {ago(now, r.at.getTime())}</span>
                  </span>
                  <button type="button" disabled={busy} onClick={() => letBack(r.id)} className={small}>
                    <ArrowUUpLeftIcon className="size-3.5" /> Let back
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
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

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-[0.6875rem] font-semibold">
      {initials(name)}
    </span>
  );
}

// In-class chat (kept at Aniket's request, 17 Oct 2026): LiveKit's data channel, so messages are not stored and reach
// only the people in the room at that moment. A host can turn it off for students (M03c T2).
function Chat({
  me,
  locked,
  chatMessages,
  send,
  isSending,
}: { me: string; locked: boolean } & ReturnType<typeof useChat>) {
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
          disabled={locked}
          aria-label="Message"
          placeholder={locked ? 'A teacher turned off chat for students' : 'Write a message'}
          className="h-9 min-w-0 flex-1 rounded-md bg-white/10 px-3 text-[0.8125rem] outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-60"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={locked || isSending || draft.trim() === ''}
          className="bg-primary grid size-9 place-items-center rounded-md disabled:opacity-50"
        >
          <PaperPlaneRightIcon weight="fill" className="size-4" />
        </button>
      </form>
    </>
  );
}
