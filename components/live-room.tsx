'use client';

import '@livekit/components-styles';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  isTrackReference,
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useChat,
  useConnectionState,
  useDataChannel,
  useIsRecording,
  useLocalParticipant,
  useLocalParticipantPermissions,
  useMediaDeviceSelect,
  useParticipants,
  usePersistentUserChoices,
  usePreviewTracks,
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
  CameraRotateIcon,
  CaretUpIcon,
  DeviceRotateIcon,
  ChartBarIcon,
  PencilSimpleLineIcon,
  SquaresFourIcon,
  ChatCircleIcon,
  ClosedCaptioningIcon,
  CornersInIcon,
  CornersOutIcon,
  DotsThreeIcon,
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
  RecordIcon,
  SmileyIcon,
  StopIcon,
  UserMinusIcon,
  UsersIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
  XIcon,
} from '@phosphor-icons/react';
import {
  ConnectionState,
  DisconnectReason,
  LocalVideoTrack,
  RoomEvent,
  Track,
  type Participant,
  type RoomOptions,
  type VideoCaptureOptions,
} from 'livekit-client';
import {
  allowBack,
  answerPoll,
  closeBoard,
  closeBreakouts,
  createPoll,
  endPoll,
  endRoom,
  lowerHands,
  messageBreakouts,
  muteEveryone,
  muteParticipant,
  openBoard,
  openBreakouts,
  raiseHand,
  removeParticipant,
  roomToken,
  setBoardDrawing,
  setStudentRight,
  showPollResults,
  startRecording,
  stopRecording,
} from '@/app/(room)/actions';
import { answerPollByLink, lowerHandByLink, raiseHandByLink } from '@/app/(room)/m/[token]/actions';
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
import type { RoomBoard, RoomBreakout, RoomControls, RoomPoll } from '@/lib/data/live';
import { formatTime, initials } from '@/lib/format';
import { BOARD_TRACK, type StudentRight } from '@/lib/schemas/live';

// M03c T4: the room serves a class (and a project review) and a meeting; its words follow which.
type Noun = 'class' | 'meeting';
type Props = {
  sessionId: string;
  serverUrl: string;
  token: string;
  noun: Noun;
  // A student: focused time is counted (T5) and they may raise a hand. A host (the class's teachers and admins, a
  // meeting's hosts): may lower anyone's hand, mute, remove, set what the others may do, let guests in, and end it.
  trackFocus: boolean;
  host: boolean;
  // In a meeting by their own link, without signing in (M03c T4, T14: a guest, or a member who did not sign in): no
  // page to go back to, and their hand and poll answers go through their link's pass (T15).
  guest?: boolean;
  // The class page (attendance and the summary) or the meeting's page; none for a guest.
  backHref: string | null;
  title: string;
  course: string;
  startedAt: Date | null;
  endsAt: Date;
  // A class's enrolled students; a meeting's invited people.
  expected: number;
  // Said above "End … for everyone" for hosts: how attendance is taken, or that a meeting takes none.
  attendanceNote: string;
  // M03c T2, hosts only: what the others may do and who was removed (the latest first).
  controls: RoomControls | null;
  // M03c T5: a host may start and stop a recording (where Egress is set up).
  canRecord?: boolean;
  // M03c T6: the polls as the viewer may see them (none for a guest).
  polls: RoomPoll[];
  // M03c T7: open breakout rooms as the viewer may see them (none for a guest).
  breakout: RoomBreakout | null;
  // M03c T8: the whiteboard, while a host has one open.
  board: RoomBoard | null;
};

// M03c T8: Excalidraw is large, so it loads only when a board opens.
const Whiteboard = dynamic(() => import('@/components/whiteboard').then((m) => m.Whiteboard), {
  ssr: false,
  loading: () => <p className="grid h-full place-items-center text-sm text-slate-500">Opening the whiteboard…</p>,
});
type State = 'in' | 'left' | 'replaced' | 'dropped' | 'ended' | 'failed' | 'removed';
type Panel = 'people' | 'chat';
type Layout = 'auto' | 'tiled' | 'spotlight' | 'sidebar';
type View = { layout: Layout; hideNoVideo: boolean; showSelf: boolean; joinSound: boolean };
type Float = { id: number; emoji: string; name: string };
// A data message: `from` is unset for one the server sent.
type Message = { payload: Uint8Array; from?: Participant };

const BEACON_MS = 60_000;
// LiveKit sends small tiles at a lower quality and pauses video nobody sees; the mini window counts as seen. M03c T15:
// a phone opens its front camera unless the viewer flips it (by default a phone may pick the back one).
const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  videoCaptureDefaults: { facingMode: 'user' },
};
type Facing = 'user' | 'environment';
// M03c T1, as in Google Meet (Aniket's pick R1-A: Auto puts the faces beside a shared screen).
const LAYOUTS: { value: Layout; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'faces beside a shared screen' },
  { value: 'tiled', label: 'Tiled', hint: 'everyone the same size' },
  { value: 'spotlight', label: 'Spotlight', hint: 'one person or the screen' },
  { value: 'sidebar', label: 'Sidebar', hint: 'one large, faces at the side' },
];
// M03c T10 (mock-up R3-G): how much the viewer's own background is blurred.
type Blur = 'off' | 'slight' | 'strong';
const BLURS: { value: Blur; label: string }[] = [
  { value: 'off', label: 'Not blurred' },
  { value: 'slight', label: 'Slightly blurred' },
  { value: 'strong', label: 'Blurred' },
];
const BLUR_RADIUS: Record<Exclude<Blur, 'off'>, number> = { slight: 5, strong: 15 };
// MediaPipe's files come from our own server (public/mediapipe; the wasm is copied there by `postinstall`).
const BLUR_ASSETS = { tasksVisionFileSet: '/mediapipe/wasm', modelAssetPath: '/mediapipe/selfie_segmenter.tflite' };
async function blurProcessor(blur: Exclude<Blur, 'off'>) {
  const { BackgroundProcessor } = await import('@livekit/track-processors');
  return BackgroundProcessor({ mode: 'background-blur', blurRadius: BLUR_RADIUS[blur], assetPaths: BLUR_ASSETS });
}
// M03c T7: whether the viewer's camera and microphone were on in the room they are leaving.
type Media = { camera: boolean; microphone: boolean };

const RIGHTS: [StudentRight, string][] = [
  ['share', 'can share their screen'],
  ['unmute', 'can turn on their microphone'],
  ['chat', 'can send chat messages and reactions'],
];
// Who the host controls limit, and the reason shown on a control a host turned off.
const OTHERS: Record<Noun, string> = { class: 'Students', meeting: 'Others' };
const lockedBy = (noun: Noun, what: string) =>
  noun === 'class' ? `A teacher turned off ${what} for students` : `A host turned off ${what}`;
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
// M03c T13: how long the host waits for the engine to start or stop a recording before being asked to try again.
const RECORDING_WAIT_SEC = 45;
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
  const { sessionId, serverUrl, trackFocus, backHref, noun, host } = props;
  const router = useRouter();
  const [state, setState] = useState<State>('in');
  // The token joined with. A host control refreshes the page, which brings a new token that must not reconnect the
  // room: LiveKit renews the token while connected, and Rejoin reloads the page for a new one. M03c T7: `room` is where
  // the tab is connected — 0 the class or meeting, 1–20 a breakout room; moving fetches a token for the other room, and
  // the disconnect that the move causes is not the viewer leaving.
  // Moving carries the camera and microphone into the other room as they were; a camera with its background blurred
  // starts there already blurred, so the room behind the viewer is never sent. The blur choice outlives the move
  // (A-211).
  const [conn, setConn] = useState<{
    token: string;
    room: number;
    video: VideoCaptureOptions | boolean;
    audio: boolean;
  }>({ token: props.token, room: 0, video: false, audio: false });
  const [blur, setBlur] = useState<Blur>('off');
  // M03c T15: "Ready to join?" comes first; the camera faces the viewer unless they flip it.
  const [joined, setJoined] = useState(false);
  const [facing, setFacing] = useState<Facing>('user');
  const media = useRef<Media>({ camera: false, microphone: false });
  const remember = useCallback((now: Media) => {
    media.current = now;
  }, []);
  const switching = useRef(false);
  const [deviceFailed, setDeviceFailed] = useState(false);
  const connected = useRef(false);
  const switchTo = useCallback(
    async (room: number): Promise<string | null> => {
      const result = await roomToken({ sessionId, room });
      if (!result.ok) return result.message;
      const { camera, microphone } = media.current;
      // A blur that cannot load leaves the camera off rather than sending it unblurred.
      const video =
        camera && blur !== 'off'
          ? await blurProcessor(blur).then(
              (processor) => ({ processor, facingMode: facing }),
              () => false,
            )
          : camera && { facingMode: facing };
      switching.current = true;
      setConn({ token: result.data.token, room, video, audio: microphone });
      return null;
    },
    [sessionId, blur, facing],
  );
  // Back to the class or meeting when the breakout rooms close.
  const breakoutOpen = props.breakout !== null;
  const closesAt = props.breakout?.closesAt?.getTime() ?? null;
  useEffect(() => {
    if (conn.room === 0 || (breakoutOpen && closesAt === null)) return;
    const delay = breakoutOpen && closesAt !== null ? Math.max(0, closesAt - Date.now()) : 0;
    const timer = window.setTimeout(() => void switchTo(0), delay);
    return () => window.clearTimeout(timer);
  }, [conn.room, breakoutOpen, closesAt, switchTo]);

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
          : host
            ? `The ${noun} is still running for the others. Rejoin, and end it from the People panel when you are done.`
            : 'Rejoin to carry on.',
        again: true,
      },
      replaced: {
        title: 'You joined from another tab or device',
        text: `A ${noun} plays in one place at a time. Rejoin here to move the ${noun} back to this tab.`,
        again: true,
      },
      dropped: {
        title: 'Your connection dropped',
        text: 'Check your internet connection, then rejoin.',
        again: true,
      },
      ended: {
        title: `The ${noun} has ended`,
        text: backHref ? `Close this tab, or open the ${noun} page to see how it went.` : 'You can close this tab.',
        again: false,
      },
      failed: {
        title: `Could not connect to the ${noun}`,
        text: 'The network may be blocking live video. Try again in a moment, or switch to another network.',
        again: true,
      },
      removed: {
        title: `You were removed from this ${noun}`,
        text:
          noun === 'class'
            ? `A teacher removed you from “${props.title}”. You can join again if a teacher lets you back. Your time in the class so far still counts.`
            : `A host removed you from “${props.title}”. You can join again if a host lets you back.`,
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
          backHref && (
            <Button asChild variant="outline" className="text-foreground">
              <Link href={backHref}>
                <ArrowLeftIcon /> Open the {noun} page
              </Link>
            </Button>
          )
        )}
      </RoomNotice>
    );
  }

  if (!joined) {
    return (
      <ReadyToJoin
        title={props.title}
        course={props.course}
        host={host}
        facing={facing}
        setFacing={setFacing}
        onJoin={(camera, microphone) => {
          setConn({ ...conn, video: camera && { facingMode: facing }, audio: microphone });
          setJoined(true);
        }}
      />
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      {deviceFailed && (
        <Alert className="absolute inset-x-4 top-16 z-30 mx-auto max-w-lg pr-10">
          <MicrophoneSlashIcon />
          <AlertTitle>Your microphone or camera could not start</AlertTitle>
          <AlertDescription>
            Allow them for this site (the icon at the left of the address bar), or carry on watching and listening.
          </AlertDescription>
          <button
            type="button"
            aria-label="Close this message"
            onClick={() => setDeviceFailed(false)}
            className="text-muted-foreground hover:text-foreground absolute top-2 right-2 grid size-7 place-items-center rounded-md"
          >
            <XIcon className="size-4" />
          </button>
        </Alert>
      )}
      <LiveKitRoom
        key={conn.room}
        serverUrl={serverUrl}
        token={conn.token}
        connect
        options={ROOM_OPTIONS}
        video={conn.video}
        audio={conn.audio}
        data-lk-theme="default"
        className="flex min-h-0 min-w-0 flex-1"
        onConnected={() => {
          connected.current = true;
          switching.current = false;
        }}
        onDisconnected={(reason) => {
          connected.current = false;
          if (switching.current) return;
          // A breakout room closed under the viewer: back to the class or meeting.
          if (reason === DisconnectReason.ROOM_DELETED && conn.room > 0) {
            void switchTo(0);
            return;
          }
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
        <Classroom
          {...props}
          inRoom={conn.room}
          switchTo={switchTo}
          blur={blur}
          setBlur={setBlur}
          remember={remember}
          facing={facing}
          setFacing={setFacing}
        />
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
  // M03c T9: Chrome and Edge recognise speech; Safari and Firefox do not.
  const canCaption = useSyncExternalStore(
    never,
    () => window.SpeechRecognition !== undefined || window.webkitSpeechRecognition !== undefined,
    () => false,
  );
  return { fullscreen, canFullscreen, canPopOut, canCaption };
}

// M03c T16: a phone held upright, asked to turn sideways for a presentation in full screen. An iPhone cannot turn the
// page itself (A-226); browsers that can only do so in full screen.
declare global {
  interface ScreenOrientation {
    lock?: (orientation: 'landscape') => Promise<void>;
  }
}
const portraitQuery = '(orientation: portrait)';
const onTurn = (notify: () => void) => {
  const query = window.matchMedia(portraitQuery);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
const usePortrait = () =>
  useSyncExternalStore(
    onTurn,
    () => window.matchMedia(portraitQuery).matches,
    () => false,
  );
// The stage's key for the board among the presentations (a screen's is `identity:source`).
const BOARD = 'board';
// M03c T17: one of the bar's tools, drawn as a button, a menu item or a tile as the stage's width allows.
type Tool = {
  key: string;
  label: string;
  // The word under the icon on a wide bar, where room is short.
  caption?: string;
  icon: ReactNode;
  onSelect: () => void;
  // Why it is unavailable (a host's lock), or what went wrong.
  hint?: string;
  pressed?: boolean;
  badge?: number;
  disabled?: boolean;
};
// Phones and tablets cannot share a screen from the browser; computers can.
const useCanShare = () =>
  useSyncExternalStore(
    never,
    () => typeof navigator.mediaDevices?.getDisplayMedia === 'function',
    () => false,
  );

// M03c T15: Flip is for phones and tablets, which have a front and a back camera; a computer keeps its one camera.
const touchQuery = '(pointer: coarse)';
const onPointer = (notify: () => void) => {
  const query = window.matchMedia(touchQuery);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
const useCanFlip = () =>
  useSyncExternalStore(
    onPointer,
    () => window.matchMedia(touchQuery).matches,
    () => false,
  );

// The token gives each participant a `role`; a raised hand is the attribute `hand`, the time it was raised (ms), set by
// the server (lib/integrations/live.ts).
const isHost = (p: Participant) => p.attributes.role === 'host';
const isGuest = (p: Participant) => p.attributes.role === 'guest';
const handOf = (p: Participant) => Number(p.attributes.hand) || 0;
const nameOf = (p: Participant) => p.name || p.identity;
// 12:41 — the time left in breakout rooms (M03c T7).
const minutes = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
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

// M03c T7: `inRoom` is where the tab is connected: 0 the class or meeting, otherwise a breakout room, where only
// chat, reactions and the people are there — hands, host controls, activities and recording belong to the main room.
function Classroom(
  props: Props & {
    inRoom: number;
    switchTo: (room: number) => Promise<string | null>;
    blur: Blur;
    setBlur: (blur: Blur) => void;
    remember: (media: Media) => void;
    facing: Facing;
    setFacing: (facing: Facing) => void;
  },
) {
  const { sessionId, host, noun, guest = false, inRoom, switchTo, blur, setBlur, remember, facing, setFacing } = props;
  const inBreakout = inRoom > 0;
  // A participant who said "Not now" to their breakout room (keyed by when the rooms opened).
  const [skipped, setSkipped] = useState<string | null>(null);
  const router = useRouter();
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant, cameraTrack, isCameraEnabled, isMicrophoneEnabled } = useLocalParticipant();
  const connection = useConnectionState();
  useEffect(() => {
    // A room being left has already stopped everything: what moves is how it was while connected.
    if (connection === ConnectionState.Connected)
      remember({ camera: isCameraEnabled, microphone: isMicrophoneEnabled });
  }, [connection, isCameraEnabled, isMicrophoneEnabled, remember]);
  const permissions = useLocalParticipantPermissions();
  const cameras = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });
  // The board's own video (sent for a recording, T16) is not a shared screen: everyone in the room has the board itself.
  const screens = useTracks([Track.Source.ScreenShare]).filter(
    (t) => isTrackReference(t) && t.publication.trackName !== BOARD_TRACK,
  );
  const now = useNow();
  // Breakout rooms past their closing time are over, though the page has not read them again yet: nobody is asked to
  // join one, and the people back from them are not asked again.
  const breakout =
    props.breakout?.closesAt && now > 0 && props.breakout.closesAt.getTime() <= now * 1000 ? null : props.breakout;
  const wide = useWide();
  // M03c T5: the engine says when an Egress recording runs, so everyone in the room sees it.
  const recording = useIsRecording();
  // M03c T13: the engine takes several seconds to start or stop one; until it does, the host's button says so.
  const [asked, setAsked] = useState<{ record: boolean; at: number } | null>(null);
  const recordingPending = asked !== null && asked.record !== recording && now - asked.at < RECORDING_WAIT_SEC;
  const recordingLate = asked !== null && asked.record !== recording && !recordingPending;
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
  const ref = { sessionId };

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
  // M03c T6, T7: a poll started, ended or was shown, or breakout rooms opened or are closing: everyone reads the
  // page again.
  const reread = useCallback(
    (m: Message) => {
      if (!m.from) router.refresh();
    },
    [router],
  );
  useDataChannel('poll', reread);
  useDataChannel('breakout', reread);
  useDataChannel('board', reread);
  // Hosts see the answers come in: while a poll is open their page reads them again every few seconds.
  const pollOpen = props.polls.some((poll) => poll.status === 'open');
  useEffect(() => {
    if (!host || !pollOpen) return;
    const timer = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [host, pollOpen, router]);
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

  // M03c T10: the viewer's background is blurred in their own browser before their camera is sent; nobody else's
  // picture changes. The processor loads only when first chosen; a device that cannot run it is told so. A blur
  // already running changes strength in place: a new processor would send the camera unblurred while the old stops.
  const camera = cameraTrack?.track;
  useEffect(() => {
    if (!(camera instanceof LocalVideoTrack)) return;
    let current = true;
    const apply = async () => {
      const running = camera.getProcessor();
      if (blur === 'off') {
        if (running) await camera.stopProcessor();
        return;
      }
      const { BackgroundProcessorWrapper } = await import('@livekit/track-processors');
      if (!current) return;
      if (running instanceof BackgroundProcessorWrapper) {
        await running.switchTo({ mode: 'background-blur', blurRadius: BLUR_RADIUS[blur] });
      } else await camera.setProcessor(await blurProcessor(blur));
    };
    apply().catch(() => setError('Your background could not be blurred on this device.'));
    return () => {
      current = false;
    };
  }, [blur, camera]);

  // M03c T9 (decision 6): a host's own speech, recognised by their browser, goes to the room as captions on the
  // lossy `caption` topic — `I:` a line still being heard, `F:` a finished one. Each viewer turns the strip on with CC;
  // captions are accepted from hosts only and never stored.
  const [captionsOn, setCaptionsOn] = useState(false);
  const [captioning, setCaptioning] = useState(false);
  const [caption, setCaption] = useState<{ name: string; lines: string[]; interim: string; at: number } | null>(null);
  const hear = useCallback((name: string, line: string) => {
    const final = line.startsWith('F:');
    const text = line.slice(2).trim();
    if (!text) return;
    setCaption((current) => {
      const lines = current?.name === name ? current.lines : [];
      return final
        ? { name, lines: [...lines, text].slice(-2), interim: '', at: Date.now() }
        : { name, lines, interim: text, at: Date.now() };
    });
  }, []);
  const onCaption = useCallback(
    (m: Message) => {
      if (m.from && isHost(m.from)) hear(nameOf(m.from), decode(m.payload));
    },
    [hear],
  );
  const captions = useDataChannel('caption', onCaption);
  // A strip nobody adds to fades after eight seconds.
  useEffect(() => {
    if (!caption) return;
    const timer = window.setTimeout(() => setCaption(null), 8000);
    return () => window.clearTimeout(timer);
  }, [caption]);
  useEffect(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!captioning || !Recognition) return;
    const recognition = new Recognition();
    recognition.lang = 'en-IN';
    recognition.continuous = true;
    recognition.interimResults = true;
    let running = true;
    let lastInterim = 0;
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim().slice(0, 500);
        if (!text || (!result.isFinal && Date.now() - lastInterim < 300)) continue;
        if (!result.isFinal) lastInterim = Date.now();
        const line = `${result.isFinal ? 'F' : 'I'}:${text}`;
        hear('You', line);
        captions
          .send(new TextEncoder().encode(line), { reliable: result.isFinal })
          .catch(() => result.isFinal && setError('Your captions did not reach the others.'));
      }
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        running = false;
        setCaptioning(false);
        setError('Your browser did not allow speech recognition, so your speech is not captioned.');
      }
    };
    // Chrome stops listening after a pause; it starts again while captions are on.
    recognition.onend = () => {
      if (running) recognition.start();
    };
    recognition.start();
    return () => {
      running = false;
      recognition.stop();
    };
  }, [captioning, captions, hear]);

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

  // A request that never reaches the server (a dropped connection, or a deploy since the page opened) says so, and the
  // buttons come back either way.
  async function run(change: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await change();
      if (!result.ok) setError(result.message ?? 'That did not work. Try again.');
      return result.ok;
    } catch {
      setError('That did not reach the server. Check your connection, or reload the page.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  const lower = (identities: string[]) => run(() => lowerHands({ ...ref, 'identity[]': identities }));
  // M03c T7: move to a breakout room, or back (0).
  const go = async (to: number) => {
    setBusy(true);
    try {
      const message = await switchTo(to);
      if (message) setError(message);
    } finally {
      setBusy(false);
    }
  };
  const record = (on: boolean) =>
    void run(() => (on ? startRecording(ref) : stopRecording(ref))).then(
      (ok) => ok && setAsked({ record: on, at: now }),
    );
  const invited = !host && !inBreakout && (breakout?.mine ?? null) !== null;
  const inviteKey = breakout ? `${breakout.openedAt.getTime()}` : '';
  // T15: someone in by link raises and lowers their own hand through their link's pass.
  const toggleHand = () =>
    guest
      ? run(() => (myHand ? lowerHandByLink(ref) : raiseHandByLink(ref)))
      : myHand
        ? lower([me])
        : run(() => raiseHand(ref));
  // T15: the other camera on a phone; the blur, if any, carries over. A camera that is off starts facing that way.
  const flip = () => {
    const next = facing === 'user' ? 'environment' : 'user';
    if (!(camera instanceof LocalVideoTrack)) return setFacing(next);
    void camera.restartTrack({ facingMode: next }).then(
      () => setFacing(next),
      () => setError('Your other camera could not start.'),
    );
  };
  const canFlip = useCanFlip();
  // T16: the screen is shared and stopped here rather than with LiveKit's toggle, which would take the board's own
  // video (sent for a recording) for a shared screen. The browser's own "Stop sharing" ends it too.
  const sharing = screens.some((t) => t.participant.identity === me);
  const [sharePending, setSharePending] = useState(false);
  const share = async () => {
    setSharePending(true);
    try {
      if (sharing) {
        for (const publication of localParticipant.trackPublications.values()) {
          const shared =
            publication.source === Track.Source.ScreenShareAudio ||
            (publication.source === Track.Source.ScreenShare && publication.trackName !== BOARD_TRACK);
          if (shared && publication.track) await localParticipant.unpublishTrack(publication.track);
        }
      } else {
        for (const track of await localParticipant.createScreenTracks({ audio: true })) {
          await localParticipant.publishTrack(track);
        }
      }
    } catch (error) {
      // Cancel in the browser's picker is the viewer's choice, not a failure.
      if (!(error instanceof Error && error.name === 'NotAllowedError')) setError('Your screen could not be shared.');
    } finally {
      setSharePending(false);
    }
  };
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
      noun={noun}
      self={p.identity === me}
      host={host && !inBreakout}
      pinned={pinned === key}
      onPin={() => pin(key)}
      onMute={() => void run(() => muteParticipant({ ...ref, identity: p.identity }))}
      onLower={() => void lower([p.identity])}
      onRemove={() => setRemoving({ p, open: true })}
    />
  );

  // M03c T17 (decision 10): the bar follows the stage's own width, which the side panel narrows: labelled buttons with the
  // hosts' tools on a wide stage, icons with the tools in More on a narrower one, and on a phone five buttons and a
  // sheet of labelled tiles.
  const stageBox = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const box = stageBox.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  // Hosts' bars carry four more tools, so they need a wider stage before the words show.
  const bar = stageWidth < 576 ? 'phone' : stageWidth < (host ? 1000 : 820) ? 'medium' : 'wide';
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState<'poll' | 'rooms' | null>(null);
  const [confirm, setConfirm] = useState<'stop' | 'end' | null>(null);
  const canShare = useCanShare();
  // An error says itself for eight seconds, or until closed.
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 8000);
    return () => window.clearTimeout(timer);
  }, [error]);

  // T17: a poll pops up in front of the people taking part until they answer it or put it aside ("Later"), and its
  // results pop up once a host shows them; the Poll button brings it back. Hosts ask and follow it in a dialog.
  const openPoll = props.polls.find((p) => p.status === 'open');
  const unanswered = !host && openPoll?.mine === null;
  // Results already showing when the viewer joined do not pop up: only those shown while they are in the room.
  const [aside, setAside] = useState(() => props.polls.filter((p) => p.answered !== null).map((p) => `r:${p.id}`));
  const [pollAsked, setPollAsked] = useState(false);
  const shownResults = (p: RoomPoll) => p.answered !== null && !aside.includes(`r:${p.id}`);
  const lastResults = [...props.polls].reverse().find((p) => p.status === 'ended' && shownResults(p));
  const popPoll =
    host || inBreakout
      ? undefined
      : openPoll && (pollAsked || (openPoll.mine === null && !aside.includes(openPoll.id)) || shownResults(openPoll))
        ? openPoll
        : lastResults;
  const putAside = (poll: RoomPoll) => {
    setPollAsked(false);
    setAside([...aside, poll.id, `r:${poll.id}`]);
  };
  const answer = (pollId: string, optionId: string) =>
    void run(() => (guest ? answerPollByLink : answerPoll)({ ...ref, pollId, optionId })).then((ok) => {
      if (!ok) return;
      setPollAsked(false);
      setNotice({ id: Date.now(), text: 'Your answer was sent.' });
    });
  const pollActions = {
    noun,
    busy,
    answer,
    end: (pollId: string) => void run(() => endPoll({ ...ref, pollId })),
    show: (pollId: string) => void run(() => showPollResults({ ...ref, pollId })),
  };

  // The bar's tools, drawn as buttons on a wide stage, as items in More on a narrower one, and as tiles on a phone.
  const recordLabel = recordingPending
    ? asked?.record
      ? 'Starting…'
      : 'Stopping…'
    : recording
      ? 'Stop recording'
      : 'Record';
  const shareTool: Tool | null = canShare
    ? {
        key: 'share',
        label: sharing ? 'Stop sharing' : 'Share screen',
        caption: sharing ? 'Stop' : 'Share',
        hint: may(Track.Source.ScreenShare) ? undefined : lockedBy(noun, 'screen sharing'),
        icon: <MonitorArrowUpIcon />,
        pressed: sharing,
        disabled: sharePending || !may(Track.Source.ScreenShare),
        onSelect: () => void share(),
      }
    : null;
  const tools: Tool[] = [
    {
      key: 'react',
      label: 'React',
      hint: mayChat ? undefined : lockedBy(noun, 'reactions'),
      icon: <SmileyIcon />,
      pressed: tray,
      disabled: !mayChat,
      onSelect: () => setTray(!tray),
    },
    {
      key: 'captions',
      label: 'Captions',
      icon: <ClosedCaptioningIcon />,
      pressed: captionsOn,
      badge: !captionsOn && caption ? 1 : 0,
      onSelect: () => setCaptionsOn(!captionsOn),
    },
  ];
  const hostTools: Tool[] =
    host && !inBreakout
      ? [
          {
            key: 'board',
            label: props.board ? 'Close board' : 'Whiteboard',
            caption: 'Board',
            icon: <PencilSimpleLineIcon />,
            pressed: props.board !== null,
            disabled: busy,
            onSelect: () =>
              void run(() => (props.board ? closeBoard(ref) : openBoard({ ...ref, studentsDraw: false }))),
          },
          {
            key: 'poll',
            label: 'Poll',
            icon: <ChartBarIcon />,
            pressed: openPoll !== undefined,
            onSelect: () => setDialog('poll'),
          },
          ...(props.canRecord
            ? [
                {
                  key: 'record',
                  label: recordLabel,
                  caption: recordingPending ? '…' : recording ? 'Stop' : 'Record',
                  hint: recordingLate
                    ? asked?.record
                      ? 'It did not start. Try again.'
                      : 'It has not stopped yet. Try again.'
                    : undefined,
                  icon: <RecordIcon weight="fill" className="text-red-500" />,
                  pressed: recording,
                  disabled: busy || recordingPending,
                  onSelect: () => (recording ? setConfirm('stop') : record(true)),
                },
              ]
            : []),
          {
            key: 'rooms',
            label: 'Breakout rooms',
            caption: 'Rooms',
            icon: <SquaresFourIcon />,
            pressed: breakout !== null,
            onSelect: () => setDialog('rooms'),
          },
        ]
      : [];
  // The people taking part get a Poll button while one is open, to bring it back.
  const pollTool: Tool | null =
    !host && !inBreakout && openPoll
      ? {
          key: 'poll',
          label: 'Poll',
          icon: <ChartBarIcon />,
          badge: unanswered ? 1 : 0,
          onSelect: () => setPollAsked(true),
        }
      : null;
  const viewTools: Tool[] = [
    ...(browser.canPopOut
      ? [{ key: 'mini', label: 'Mini window', icon: <PictureInPictureIcon />, onSelect: openMini }]
      : []),
    ...(browser.canFullscreen
      ? [
          {
            key: 'full',
            label: browser.fullscreen ? 'Exit full screen' : 'Full screen',
            icon: browser.fullscreen ? <CornersInIcon /> : <CornersOutIcon />,
            onSelect: () => void toggleFullscreen(),
          },
        ]
      : []),
  ];
  const toggles = [
    {
      label: 'Hide people without video',
      checked: view.hideNoVideo,
      set: (on: boolean) => setView({ ...view, hideNoVideo: on }),
    },
    { label: 'Show my own tile', checked: view.showSelf, set: (on: boolean) => setView({ ...view, showSelf: on }) },
    {
      label: 'Sound when someone joins',
      checked: view.joinSound,
      set: (on: boolean) => setView({ ...view, joinSound: on }),
    },
  ];

  // M03c T8: the whiteboard, while a host has one open (the main room only).
  const board = inBreakout ? null : props.board;
  const canDraw = host || (board?.studentsDraw === true && mayChat);
  const mayDraw = useCallback(
    (identity: string) => {
      const sender = room.remoteParticipants.get(identity);
      return sender !== undefined && (isHost(sender) || board?.studentsDraw === true);
    },
    [room, board?.studentsDraw],
  );
  const showError = useCallback((message: string) => setError(message), []);
  // T16: whom the others follow on the board — the host who opened it, else a host in the room. While the room is
  // recorded, the presenter's browser also sends the board as a video (decision 11).
  const presenterOf = board
    ? (participants.find((p) => p.identity === board.by && isHost(p)) ?? participants.find(isHost))
    : undefined;
  const presenterName = presenterOf ? (presenterOf.identity === me ? 'you' : nameOf(presenterOf)) : null;
  const presenterIdentity = presenterOf?.identity ?? null;
  const presenter = useMemo(
    () => (presenterIdentity && presenterName ? { identity: presenterIdentity, name: presenterName } : null),
    [presenterIdentity, presenterName],
  );

  // M03c T16: what is being presented — the open board and every shared screen. The newest fills the stage and the
  // others wait as tiles beside it; a viewer may put one of them on the stage (until something new is presented), and a
  // pin still wins. The board stays loaded while it waits, so no stroke is missed.
  const presentations = [...(board ? [BOARD] : []), ...screens.map(keyOf)];
  const presented = presentations.join(' ');
  const [order, setOrder] = useState<{ presented: string; newest: string[]; chosen: string | null }>({
    presented: '',
    newest: [],
    chosen: null,
  });
  if (order.presented !== presented) {
    const added = presentations.filter((k) => !order.newest.includes(k));
    setOrder({
      presented,
      newest: [...order.newest.filter((k) => presentations.includes(k)), ...added],
      chosen: added.length === 0 && order.chosen && presentations.includes(order.chosen) ? order.chosen : null,
    });
  }
  const showing = order.chosen ?? order.newest.at(-1) ?? null;
  const show = (key: string) => {
    setPinned(null);
    setOrder({ ...order, chosen: key });
  };

  // The main tile: what the viewer pinned; else the screen presented; else a host's camera (the one speaking, if any),
  // then anyone speaking, then any camera; with no camera on, the first host's (or the viewer's) initials.
  const cameraOf = (p: Participant) => cameras.find((c) => c.participant.identity === p.identity);
  const pinnedTile = pinned === null ? undefined : [...screens, ...cameras].find((t) => keyOf(t) === pinned);
  const boardShown = board !== null && pinnedTile === undefined && showing === BOARD;
  const shownScreen = showing === null ? undefined : screens.find((t) => keyOf(t) === showing);
  const speakers = room.activeSpeakers;
  const main =
    pinnedTile ??
    shownScreen ??
    [...speakers.filter(isHost), ...participants.filter(isHost), ...speakers, ...participants]
      .filter((p) => p.identity !== me || participants.length === 1)
      .map(cameraOf)
      .find(cameraOn) ??
    cameraOf(participants.find(isHost) ?? localParticipant);
  const faces = cameras
    .filter((c) => (view.showSelf || c.participant.identity !== me) && (!view.hideNoVideo || cameraOn(c)))
    .sort(byPlace);
  const mine = cameraOf(localParticipant);
  const latest = hands.at(-1);
  const toastKey = latest ? `${latest.identity}:${handOf(latest)}` : '';
  const tile = (t: TrackReferenceOrPlaceholder, className: string, isMain = false, fills = false) => (
    <Tile
      key={keyOf(t)}
      trackRef={t}
      fit={t.source === Track.Source.ScreenShare ? 'contain' : 'cover'}
      className={className}
      // A tile filling the stage keeps its name above the bar.
      labelClassName={fills ? 'bottom-20' : undefined}
      label={
        t.source === Track.Source.ScreenShare
          ? `${t.participant.identity === me ? 'You are' : `${nameOf(t.participant)} is`} presenting`
          : t.participant.identity === me
            ? 'You'
            : nameOf(t.participant)
      }
      hand={t.source === Track.Source.Camera ? handPlace(t.participant) : 0}
      mirror={t.participant.identity === me && t.source === Track.Source.Camera && facing === 'user'}
      pinned={pinned === keyOf(t)}
      main={isMain}
      // A tile that fills the stage would put its menu under the time live; the People panel has the same menu.
      menu={fills ? undefined : menuFor(t.participant, keyOf(t))}
    />
  );

  // T16: the presentation alone on the screen — the browser's full screen where it allows it, turned to landscape on a
  // phone that can turn; elsewhere (an iPhone) the stage fills the window and asks for the phone to be turned. Leaving
  // the browser's full screen (Esc) leaves it too.
  const [focused, setFocused] = useState(false);
  const portrait = usePortrait();
  const focus = () => {
    setFocused(true);
    if (!document.fullscreenEnabled) return;
    // The whole page goes full screen, so menus and dialogs (drawn outside the stage) still show; the stage fills it.
    // Refused full screen, or a phone that will not turn, still leaves the presentation filling the window.
    void document.documentElement
      .requestFullscreen()
      .then(() => (canFlip ? screen.orientation.lock?.('landscape') : undefined))
      .catch(() => undefined);
  };
  const unfocus = () => {
    setFocused(false);
    if (document.fullscreenElement) void document.exitFullscreen();
  };
  useEffect(() => {
    if (!focused) return;
    const left = () => {
      if (!document.fullscreenElement) setFocused(false);
    };
    document.addEventListener('fullscreenchange', left);
    return () => document.removeEventListener('fullscreenchange', left);
  }, [focused]);
  const full = focused && (boardShown || shownScreen !== undefined);
  const fullButton = (
    <button
      type="button"
      onClick={full ? unfocus : focus}
      aria-label={full ? 'Exit full screen' : 'Full screen'}
      className="flex h-8 items-center gap-1.5 rounded-md bg-black/70 px-2.5 text-xs font-medium text-white ring-1 ring-white/10 hover:bg-black/85"
    >
      {full ? <CornersInIcon className="size-4" /> : <CornersOutIcon className="size-4" />}
      <span className="max-sm:hidden">{full ? 'Exit full screen' : 'Full screen'}</span>
    </button>
  );

  // The board, header and all; it stays where it is in the page (hidden while another presentation is shown), so
  // Excalidraw is not loaded again.
  const boardStage = board && (
    <div
      // Hidden by opacity, not visibility, which Excalidraw's own controls override; `inert` keeps clicks and focus out.
      inert={!boardShown}
      className={cn(
        'absolute inset-0 flex flex-col overflow-hidden bg-white text-slate-900',
        !full && 'rounded-lg',
        !boardShown && 'opacity-0',
      )}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 bg-slate-900 px-2.5 text-[0.8125rem] text-white">
        <PencilSimpleLineIcon className="size-4 shrink-0" />
        <span className="font-medium">Whiteboard</span>
        {presenter && (
          <span className="truncate text-white/60 max-sm:hidden">
            · {presenter.identity === me ? 'you are presenting' : `${presenter.name} is presenting`}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {host && (
            <label className="flex items-center gap-2">
              <span className="max-sm:hidden">{OTHERS[noun]} can draw</span>
              <span className="sm:hidden">Others draw</span>
              <Switch
                checked={board.studentsDraw}
                disabled={busy}
                onCheckedChange={(allowed) => void run(() => setBoardDrawing({ ...ref, allowed }))}
                className="data-[state=unchecked]:bg-white/20"
              />
            </label>
          )}
          {fullButton}
          {host && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => closeBoard(ref))}
              className="h-8 rounded-md px-2.5 text-xs font-medium hover:bg-white/10"
            >
              Close
            </button>
          )}
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <Whiteboard
          canDraw={canDraw}
          host={host}
          presenter={presenter}
          mayDraw={mayDraw}
          capture={recording && presenter?.identity === me}
          onError={showError}
        />
      </div>
    </div>
  );
  // Presentations not on the stage, as tiles that put themselves there.
  const waiting = presentations.filter((k) => !(k === BOARD ? boardShown : main && k === keyOf(main)));
  const stripTile = 'relative aspect-video h-full shrink-0 lg:h-auto lg:w-full';
  const waitingTiles = waiting.map((k) => {
    const screenTrack = screens.find((t) => keyOf(t) === k);
    const label = screenTrack ? `${nameOf(screenTrack.participant)}’s screen` : 'Whiteboard';
    return (
      <button
        key={k}
        type="button"
        onClick={() => show(k)}
        aria-label={`Show ${label === 'Whiteboard' ? 'the whiteboard' : label} on the stage`}
        className={cn(stripTile, 'overflow-hidden rounded-lg text-left ring-1 ring-white/20 hover:ring-white/50')}
      >
        {screenTrack ? (
          tile(screenTrack, 'absolute inset-0 pointer-events-none')
        ) : (
          <span className="grid size-full place-items-center bg-white text-slate-600">
            <PencilSimpleLineIcon className="size-7" />
            <span className="absolute bottom-2 left-2 rounded-sm bg-black/60 px-2 py-0.5 text-xs text-white">
              Whiteboard
            </span>
          </span>
        )}
      </button>
    );
  });

  // The stage. A presentation, a pin or Sidebar puts the main tile large with the faces and waiting presentations
  // beside it (below it on a phone), scrolling, so nobody disappears while someone presents (R1-A); Spotlight and full
  // screen show the main tile alone; Tiled shows everyone the same size, a pinned tile or screen taking four cells.
  const presenting = presentations.length > 0;
  const stripped =
    board !== null ||
    view.layout === 'sidebar' ||
    (view.layout === 'auto' && (pinnedTile !== undefined || presenting)) ||
    (view.layout === 'spotlight' && presenting);
  let stage: ReactNode;
  if (stripped) {
    const others = faces.filter((t) => !main || keyOf(t) !== keyOf(main));
    const strip = !full && view.layout !== 'spotlight' && (waitingTiles.length > 0 || others.length > 0);
    stage = (
      <div
        className={cn(
          'absolute inset-0 flex flex-col gap-2 lg:flex-row',
          // In full screen the bar stays below the presentation, for the microphone and Leave.
          // A phone on its side (a short screen) keeps the bars' room small and gives the rest to the stage.
          full ? 'pb-18' : 'px-2 pt-14 pb-20 [@media(max-height:500px)]:pt-12 [@media(max-height:500px)]:pb-17',
        )}
      >
        <div className="relative min-h-0 min-w-0 flex-1">
          {boardStage}
          {!boardShown && main && tile(main, 'absolute inset-0', true)}
          {!boardShown && shownScreen && main === shownScreen && (
            <div className="absolute right-2 bottom-2 z-10">{fullButton}</div>
          )}
        </div>
        {strip && (
          <div className="flex h-20 shrink-0 gap-2 overflow-x-auto sm:h-24 lg:h-auto lg:w-56 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto [@media(max-height:500px)]:hidden">
            {waitingTiles}
            {others.map((t) => tile(t, stripTile))}
          </div>
        )}
      </div>
    );
  } else if (view.layout === 'tiled') {
    // Everyone the same size; a pinned tile takes four cells.
    const big = pinnedTile;
    const all = [...(big ? [big] : []), ...faces.filter((t) => !big || keyOf(t) !== keyOf(big))];
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
            mirror={facing === 'user'}
          />
        )}
      </>
    );
  }

  const barButton = (t: Tool, labelled: boolean) => (
    <RoundButton
      key={t.key}
      label={t.hint ?? t.label}
      caption={labelled ? (t.caption ?? t.label) : undefined}
      pressed={t.pressed}
      badge={t.badge}
      disabled={t.disabled}
      onClick={t.onSelect}
    >
      {t.icon}
    </RoundButton>
  );

  return (
    <>
      <div className="relative flex min-w-0 flex-1 flex-col p-2 sm:p-3">
        <div
          ref={stageBox}
          className={cn(
            'relative min-h-0 flex-1 overflow-hidden rounded-lg bg-white/4',
            full && 'fixed inset-0 z-50 rounded-none bg-(--lk-bg)',
          )}
        >
          {stage}

          {full && canFlip && portrait && (
            <p className="pointer-events-none absolute top-12 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 px-3 py-1.5 text-xs whitespace-nowrap text-white">
              <DeviceRotateIcon className="size-4" /> Turn your phone sideways for a bigger view
            </p>
          )}

          <div className={cn('absolute inset-x-3 top-3 flex items-start justify-between gap-3', full && 'hidden')}>
            <div className="flex min-w-0 items-center gap-2.5 rounded-md bg-black/60 px-3 py-1.5 text-[0.8125rem] ring-1 ring-white/10">
              <span className="truncate font-semibold">{inBreakout ? `Breakout room ${inRoom}` : props.title}</span>
              <span className="truncate text-white/60 max-md:hidden">{inBreakout ? props.title : props.course}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canFlip && isCameraEnabled && (
                <button
                  type="button"
                  onClick={flip}
                  aria-label="Switch to your other camera"
                  title="Switch camera"
                  className="grid size-8 place-items-center rounded-md bg-black/60 ring-1 ring-white/10 hover:bg-black/80"
                >
                  <CameraRotateIcon className="size-4.5" />
                </button>
              )}
              {breakout?.closesAt && (inBreakout || host) && now > 0 && (
                <span className="flex items-center gap-2 rounded-md bg-black/60 px-3 py-1.5 text-[0.8125rem] ring-1 ring-white/10">
                  <span className="font-semibold tabular-nums">
                    {minutes(Math.max(0, Math.round(breakout.closesAt.getTime() / 1000) - now))}
                  </span>
                  <span className="text-white/60">{inBreakout ? 'left' : 'until the rooms close'}</span>
                </span>
              )}
              {recording && (
                <span className="flex items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1.5 text-[0.8125rem] font-semibold ring-1 ring-white/10">
                  <span className="size-2 rounded-full bg-white motion-safe:animate-pulse" />
                  <span className="max-sm:hidden">Recording</span>
                  <span className="sm:hidden">Rec</span>
                </span>
              )}
              <div className="flex items-center gap-2 rounded-md bg-black/60 px-3 py-1.5 text-[0.8125rem] ring-1 ring-white/10">
                <span className="bg-destructive size-2 rounded-full motion-safe:animate-pulse" />
                <span className="font-semibold">Live</span>
                {props.startedAt && now > 0 && (
                  <span className="text-white/60 tabular-nums">
                    {clock(Math.max(0, now - Math.floor(props.startedAt.getTime() / 1000)))}
                  </span>
                )}
              </div>
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
            <div
              role="alert"
              className="bg-destructive absolute bottom-22 left-1/2 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-md py-1 pr-1 pl-3 text-[0.8125rem] text-white"
            >
              <span className="min-w-0">{error}</span>
              <button
                type="button"
                aria-label="Close this message"
                onClick={() => setError(null)}
                className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-white/15"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
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

          {captionsOn && caption && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-20 z-10 flex justify-center px-4"
              aria-live="polite"
            >
              <div className="grid max-w-3xl gap-0.5 rounded-md bg-black/80 px-4 py-2.5">
                <span className="text-xs font-semibold text-white/70">{caption.name}</span>
                {[...caption.lines, caption.interim]
                  .filter(Boolean)
                  .slice(-2)
                  .map((line, i) => (
                    <p key={i} className="text-base leading-snug sm:text-lg">
                      {line}
                    </p>
                  ))}
              </div>
            </div>
          )}

          {invited && skipped !== inviteKey && breakout && (
            <div className="absolute inset-0 z-30 grid place-items-center bg-black/40 p-4">
              <div className="bg-background text-foreground grid w-full max-w-sm gap-3 rounded-lg p-5 shadow-lg">
                <h2 className="text-lg font-semibold">Breakout room {breakout.mine} is open</h2>
                <p className="text-muted-foreground text-sm">
                  {breakout.assigned[0].people.length > 1
                    ? `You are in room ${breakout.mine} with ${breakout.assigned[0].people.length - 1} other${breakout.assigned[0].people.length === 2 ? '' : 's'}`
                    : `You are in room ${breakout.mine}`}
                  {breakout.closesAt ? `, until ${formatTime(breakout.closesAt)}.` : '.'}
                  {noun === 'class' ? ' Your time there counts towards this class.' : ''}
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setSkipped(inviteKey)}>
                    Not now
                  </Button>
                  <Button disabled={busy} onClick={() => void go(breakout.mine ?? 0)}>
                    Join room {breakout.mine}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* T17: a poll pops up in front of the people taking part. */}
          {popPoll && (
            <section
              aria-label="Poll"
              className="absolute bottom-22 left-1/2 z-30 grid max-h-[calc(100%-7rem)] w-[min(26rem,calc(100%-1.5rem))] -translate-x-1/2 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg bg-(--lk-bg) shadow-lg ring-1 ring-white/20"
            >
              <header className="flex items-center justify-between gap-3 border-b border-white/10 py-1.5 pr-1.5 pl-4">
                <h2 className="flex items-center gap-2 text-[0.8125rem] font-semibold">
                  <ChartBarIcon className="size-4" />
                  {popPoll.status === 'open' ? (popPoll.mine ? 'Poll · answered' : 'A host asks') : 'Poll results'}
                </h2>
                <button
                  type="button"
                  onClick={() => putAside(popPoll)}
                  className="h-7 rounded-md px-2.5 text-xs text-white/70 hover:bg-white/10 hover:text-white"
                >
                  {popPoll.status === 'open' && popPoll.mine === null ? 'Later' : 'Close'}
                </button>
              </header>
              <div className="overflow-y-auto p-3">
                <PollCard key={popPoll.id} poll={popPoll} host={false} {...pollActions} />
              </div>
            </section>
          )}
          {/* Hosts follow an open poll from a small card while its dialog is closed. */}
          {host && !inBreakout && openPoll && dialog === null && (
            <button
              type="button"
              onClick={() => setDialog('poll')}
              className="absolute bottom-22 left-3 z-20 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-md bg-black/75 px-3 py-2 text-left text-[0.8125rem] ring-1 ring-white/15 hover:bg-black/90"
            >
              <ChartBarIcon className="size-4 shrink-0" />
              <span className="truncate">
                Poll · {openPoll.answered ?? 0} answered · <span className="underline underline-offset-2">Open</span>
              </span>
            </button>
          )}

          {dialog && (
            <Overlay title={dialog === 'poll' ? 'Poll' : 'Breakout rooms'} onClose={() => setDialog(null)}>
              {dialog === 'poll' ? (
                openPoll ? (
                  <div className="grid gap-4 p-4">
                    <PollCard key={openPoll.id} poll={openPoll} host {...pollActions} />
                  </div>
                ) : (
                  <PollForm
                    noun={noun}
                    busy={busy}
                    create={async (poll) => void (await run(() => createPoll({ ...ref, ...poll })))}
                  />
                )
              ) : breakout ? (
                <div className="p-4">
                  <BreakoutStatus
                    breakout={breakout}
                    now={now}
                    busy={busy}
                    visit={(n) => {
                      setDialog(null);
                      void go(n);
                    }}
                    close={() => void run(() => closeBreakouts(ref))}
                    message={(text) => run(() => messageBreakouts({ ...ref, text }))}
                  />
                </div>
              ) : (
                <BreakoutForm
                  people={participants
                    .filter((p) => !isHost(p) && !isGuest(p))
                    .map((p) => ({ id: p.identity, name: nameOf(p) }))}
                  busy={busy}
                  open={async (rooms) => {
                    if (await run(() => openBreakouts({ ...ref, ...rooms }))) setDialog(null);
                  }}
                />
              )}
              {dialog === 'poll' && props.polls.some((p) => p.status === 'ended') && (
                <section className="grid gap-3 border-t border-white/10 p-4">
                  <h3 className={SECTION_HEADING}>Earlier in this {noun}</h3>
                  {props.polls
                    .filter((p) => p.status === 'ended')
                    .reverse()
                    .map((p) => (
                      <PollCard key={p.id} poll={p} host {...pollActions} />
                    ))}
                </section>
              )}
            </Overlay>
          )}

          {tray && (
            <div className="absolute bottom-20 left-1/2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 gap-0.5 overflow-x-auto rounded-full bg-black/70 p-1.5 ring-1 ring-white/10">
              {REACTIONS.map(([emoji, label]) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`Send ${label}`}
                  title={label}
                  onClick={() => react(emoji)}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-2xl hover:bg-white/15 sm:size-10"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* T17, on a phone: every feature as a labelled tile, and the settings below them. */}
          {sheet && (
            <Overlay title="More" onClose={() => setSheet(false)} bottom>
              <div className="grid grid-cols-4 gap-2 p-3">
                {(
                  [
                    {
                      key: 'people',
                      label: 'People',
                      icon: <UsersIcon />,
                      badge: hands.length,
                      onSelect: () => open('people'),
                    },
                    {
                      key: 'chat',
                      label: 'Chat',
                      icon: <ChatCircleIcon />,
                      badge: unread,
                      onSelect: () => open('chat'),
                    },
                    ...(pollTool ? [pollTool] : []),
                    ...tools,
                    ...hostTools,
                    ...(shareTool ? [shareTool] : []),
                    ...viewTools,
                  ] satisfies Tool[]
                ).map((t: Tool) => (
                  <button
                    key={t.key}
                    type="button"
                    disabled={t.disabled}
                    title={t.hint}
                    onClick={() => {
                      setSheet(false);
                      t.onSelect();
                    }}
                    className={cn(
                      'relative grid justify-items-center gap-1.5 rounded-lg bg-white/8 px-1 py-3 text-center text-[0.6875rem] leading-tight disabled:opacity-50 [&_svg]:size-6',
                      t.pressed && 'bg-primary',
                    )}
                  >
                    {t.icon}
                    {t.label}
                    {(t.badge ?? 0) > 0 && (
                      <span className="bg-gold text-foreground absolute top-1 right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full px-1 text-[0.6875rem] font-bold tabular-nums">
                        {t.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="grid gap-4 border-t border-white/10 p-4 text-[0.8125rem]">
                <Choices
                  label="Layout"
                  value={view.layout}
                  options={LAYOUTS}
                  set={(layout) => setView({ ...view, layout })}
                />
                <Choices label="Your background" value={blur} options={BLURS} set={setBlur} />
                {toggles.map((t) => (
                  <label key={t.label} className="flex items-center justify-between gap-3">
                    {t.label}
                    <Switch
                      checked={t.checked}
                      onCheckedChange={t.set}
                      className="data-[state=unchecked]:bg-white/20"
                    />
                  </label>
                ))}
                {host && (
                  <label className="flex items-center justify-between gap-3">
                    <span className="grid">
                      Caption my speech
                      <span className="text-xs text-white/60">
                        {browser.canCaption
                          ? 'Your browser sends your voice to Google or Microsoft to turn it into text.'
                          : 'Use Chrome or Edge to caption your speech.'}
                      </span>
                    </span>
                    <Switch
                      checked={captioning}
                      disabled={!browser.canCaption}
                      onCheckedChange={setCaptioning}
                      className="data-[state=unchecked]:bg-white/20"
                    />
                  </label>
                )}
              </div>
            </Overlay>
          )}

          <div
            className={cn(
              'absolute bottom-3 left-1/2 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-1.5 bg-black/70 p-1.5 ring-1 ring-white/10',
              bar === 'wide' ? 'rounded-2xl' : 'rounded-full',
            )}
          >
            <MediaToggle
              source={Track.Source.Microphone}
              on={<MicrophoneIcon />}
              off={<MicrophoneSlashIcon />}
              caption={bar === 'wide' ? 'Mic' : undefined}
              locked={may(Track.Source.Microphone) ? undefined : lockedBy(noun, 'microphones')}
            />
            {bar === 'wide' && (
              <DeviceMenu
                label="Choose your microphone and speaker"
                kinds={['audioinput', 'audiooutput']}
                onError={showError}
              />
            )}
            <MediaToggle
              source={Track.Source.Camera}
              on={<VideoCameraIcon />}
              off={<VideoCameraSlashIcon />}
              caption={bar === 'wide' ? 'Camera' : undefined}
              // It starts facing the way the viewer last chose, and with its background blurred before anything is
              // sent.
              turnOn={() =>
                void (blur === 'off' ? Promise.resolve(undefined) : blurProcessor(blur))
                  .then((processor) => localParticipant.setCameraEnabled(true, { facingMode: facing, processor }))
                  .catch(() => setError('Your camera could not start.'))
              }
            />
            {bar === 'wide' && <DeviceMenu label="Choose your camera" kinds={['videoinput']} onError={showError} />}
            {bar !== 'phone' && shareTool && barButton(shareTool, bar === 'wide')}
            {!host && !inBreakout && (
              <RoundButton
                label={myHand ? `Lower your hand (${place} in line)` : 'Raise your hand'}
                caption={bar === 'wide' ? (myHand ? 'Lower' : 'Hand') : undefined}
                pressed={myHand > 0}
                onClick={() => void toggleHand()}
                disabled={busy}
                className={myHand ? 'bg-gold text-foreground hover:bg-gold/90' : undefined}
              >
                <HandPalmIcon weight={myHand ? 'fill' : 'regular'} />
              </RoundButton>
            )}
            {bar === 'wide' && tools.map((t) => barButton(t, true))}
            {bar !== 'phone' && pollTool && barButton(pollTool, bar === 'wide')}
            {bar === 'wide' && hostTools.length > 0 && (
              <>
                <span className="mx-0.5 h-8 w-px bg-white/15" />
                {hostTools.map((t) => barButton(t, true))}
              </>
            )}
            {bar === 'phone' ? (
              <RoundButton
                label="More: people, chat, polls and settings"
                onClick={() => setSheet(true)}
                badge={hands.length + unread + (unanswered ? 1 : 0)}
              >
                <DotsThreeIcon weight="bold" />
              </RoundButton>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <RoundButton label="More options" caption={bar === 'wide' ? 'More' : undefined}>
                    <DotsThreeVerticalIcon weight="bold" />
                  </RoundButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="center" className="max-h-[70vh] w-72 overflow-y-auto">
                  {bar === 'medium' &&
                    [...tools, ...hostTools].map((t) => (
                      <DropdownMenuItem key={t.key} disabled={t.disabled} onSelect={t.onSelect}>
                        {t.icon}
                        <span className="grid">
                          {t.pressed && t.key === 'react' ? 'Hide reactions' : t.label}
                          {t.hint && <span className="text-muted-foreground text-xs">{t.hint}</span>}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  {bar === 'medium' && <DropdownMenuSeparator />}
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
                  {toggles.map((t) => (
                    <DropdownMenuCheckboxItem key={t.label} checked={t.checked} onCheckedChange={t.set}>
                      {t.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Your background</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={blur}
                    onValueChange={(value) => setBlur(BLURS.find((b) => b.value === value)?.value ?? 'off')}
                  >
                    {BLURS.map((b) => (
                      <DropdownMenuRadioItem key={b.value} value={b.value}>
                        {b.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  {host && (
                    <DropdownMenuCheckboxItem
                      checked={captioning}
                      disabled={!browser.canCaption}
                      onCheckedChange={(checked) => setCaptioning(checked)}
                    >
                      <span className="grid">
                        Caption my speech
                        <span className="text-muted-foreground text-xs">
                          {browser.canCaption
                            ? 'Your browser sends your voice to Google or Microsoft to turn it into text.'
                            : 'Use Chrome or Edge to caption your speech.'}
                        </span>
                      </span>
                    </DropdownMenuCheckboxItem>
                  )}
                  {viewTools.map((t) => (
                    <DropdownMenuItem key={t.key} onSelect={t.onSelect}>
                      {t.icon} {t.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {bar !== 'phone' && (
              <>
                <span className="mx-0.5 h-6 w-px bg-white/15" />
                <RoundButton
                  label="People"
                  caption={bar === 'wide' ? 'People' : undefined}
                  pressed={panel === 'people'}
                  onClick={() => open('people')}
                  badge={hands.length}
                >
                  <UsersIcon />
                </RoundButton>
                <RoundButton
                  label="Chat"
                  caption={bar === 'wide' ? 'Chat' : undefined}
                  pressed={panel === 'chat'}
                  onClick={() => open('chat')}
                  badge={unread}
                >
                  <ChatCircleIcon />
                </RoundButton>
                <span className="mx-0.5 h-6 w-px bg-white/15" />
              </>
            )}
            {(inBreakout || (invited && skipped === inviteKey)) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void go(inBreakout ? 0 : (breakout?.mine ?? 0))}
                aria-label={inBreakout ? `Back to the ${noun}` : `Join room ${breakout?.mine}`}
                className="flex h-10 items-center gap-2 rounded-full bg-white/10 px-3 text-[0.8125rem] font-semibold hover:bg-white/20 sm:h-11"
              >
                <ArrowUUpLeftIcon className="size-5" />
                {bar !== 'phone' && (inBreakout ? `Back to the ${noun}` : `Join room ${breakout?.mine}`)}
              </button>
            )}
            {/* A host leaves, or ends it for everyone; anyone else just leaves. */}
            {host && !inBreakout ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="Leave or end" className={LEAVE}>
                    <PhoneDisconnectIcon className="size-5" />
                    {bar !== 'phone' && 'Leave'}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="end" className="w-64">
                  <DropdownMenuItem onSelect={() => void room.disconnect()}>
                    <PhoneDisconnectIcon /> Leave the {noun}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm('end')}>
                    <StopIcon weight="fill" /> End the {noun} for everyone
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button type="button" onClick={() => void room.disconnect()} aria-label="Leave" className={LEAVE}>
                <PhoneDisconnectIcon className="size-5" />
                {bar !== 'phone' && 'Leave'}
              </button>
            )}
          </div>
          <StartAudio
            label="Turn on sound"
            className="bg-background text-foreground absolute top-14 left-3 h-8 rounded-md px-3 text-[0.8125rem] font-medium"
          />
        </div>
      </div>

      {panel && (
        // Beside the stage on a wide screen; on a narrower one it rises from the bottom, leaving the stage in view.
        <aside className="flex w-88 shrink-0 flex-col border-l border-white/10 bg-(--lk-bg) max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:h-[70dvh] max-lg:w-full max-lg:rounded-t-xl max-lg:border-t max-lg:border-l-0">
          <header className="flex items-center gap-1 border-b border-white/10 p-2">
            {(['people', 'chat'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => open(tab)}
                className={cn(
                  'relative h-8 flex-1 rounded-md text-[0.8125rem] capitalize',
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
              host={host && !inBreakout}
              controls={inBreakout ? null : props.controls}
              now={now}
              participants={participants}
              hands={hands}
              inRoom={noun === 'class' ? students.length : participants.length}
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
            <Chat me={me} noun={noun} locked={!mayChat} {...chat} />
          )}
        </aside>
      )}

      {/* T17: stopping a recording and ending for everyone are asked first. */}
      <AlertDialog open={confirm !== null} onOpenChange={(isOpen) => !isOpen && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'stop' ? 'Stop recording?' : `End the ${noun} for everyone?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'stop'
                ? `The recording is saved and appears on the ${noun} page in a minute or two.`
                : noun === 'class'
                  ? 'Everyone leaves the room and attendance is worked out from the time each student spent in it.'
                  : 'Everyone leaves the room.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                const asked = confirm;
                setConfirm(null);
                if (asked === 'stop') record(false);
                else void run(() => endRoom(ref));
              }}
            >
              <StopIcon weight="fill" /> {confirm === 'stop' ? 'Stop recording' : `End the ${noun}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={removing?.open === true}
        onOpenChange={(isOpen) => !isOpen && removing && setRemoving({ ...removing, open: false })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removing ? nameOf(removing.p) : ''} from the {noun}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {noun === 'class'
                ? 'They leave the room now and cannot join again until a teacher lets them back. Their time in the class so far still counts.'
                : 'They leave the room now and cannot join again until a host lets them back.'}
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
            noun={noun}
            canRaise={!host}
            myHand={myHand}
            place={place}
            busy={busy}
            micLock={may(Track.Source.Microphone) ? undefined : lockedBy(noun, 'microphones')}
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
  noun,
  canRaise,
  myHand,
  place,
  busy,
  micLock,
  toggleHand,
  back,
  leave,
}: {
  title: string;
  elapsed: string;
  main: TrackReferenceOrPlaceholder | undefined;
  faces: TrackReferenceOrPlaceholder[];
  noun: Noun;
  canRaise: boolean;
  myHand: number;
  place: number;
  busy: boolean;
  micLock: string | undefined;
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
          locked={micLock}
        />
        {canRaise && (
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
        <RoundButton label={`Back to the ${noun} tab`} onClick={back}>
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
  mirror = false,
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
  // M03c T15: the viewer's own front camera shows as in a mirror, as in Google Meet (others see it the right way).
  mirror?: boolean;
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
          className={cn('size-full', fit === 'cover' ? 'object-cover' : 'object-contain', mirror && '-scale-x-100')}
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
  noun,
  self,
  host,
  pinned,
  onPin,
  onMute,
  onLower,
  onRemove,
}: {
  p: Participant;
  noun: Noun;
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
              <UserMinusIcon /> Remove from {noun}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// M03c T15: "Ready to join?" — the viewer's own picture before anyone sees it (the front camera on a phone, with Flip),
// and their microphone and camera as they last chose; the first time, a host's microphone is on and everyone else's off,
// so a class of sixty does not join talking. Joining is a click, which also lets the room play sound at once.
function ReadyToJoin({
  title,
  course,
  host,
  facing,
  setFacing,
  onJoin,
}: {
  title: string;
  course: string;
  host: boolean;
  facing: Facing;
  setFacing: (facing: Facing) => void;
  onJoin: (camera: boolean, microphone: boolean) => void;
}) {
  const { userChoices, saveAudioInputEnabled, saveVideoInputEnabled } = usePersistentUserChoices({
    defaults: { audioEnabled: host, videoEnabled: true },
  });
  const { videoEnabled: camera, audioEnabled: microphone } = userChoices;
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  const tracks = usePreviewTracks({ video: camera && { facingMode: facing }, audio: microphone }, onError);
  const video = camera ? tracks?.find((t) => t instanceof LocalVideoTrack) : undefined;
  const element = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = element.current;
    if (!video || !el) return;
    video.attach(el);
    return () => void video.detach(el);
  }, [video]);
  const canFlip = useCanFlip();
  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto p-4 sm:p-8">
      <div className="grid w-full max-w-4xl items-center gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-white/6">
          {video ? (
            <video
              ref={element}
              muted
              playsInline
              autoPlay
              className={cn('size-full object-cover', facing === 'user' && '-scale-x-100')}
            />
          ) : (
            <p className="grid size-full place-items-center p-6 text-center text-sm text-white/70">
              {camera
                ? failed
                  ? 'Your camera or microphone could not start. Allow them for this site (the icon at the left of the address bar), or join without them.'
                  : 'Starting your camera…'
                : 'Your camera is off'}
            </p>
          )}
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            <RoundButton
              label={microphone ? 'Turn off your microphone' : 'Turn on your microphone'}
              onClick={() => saveAudioInputEnabled(!microphone)}
              className={cn(!microphone && 'bg-red-500/20 text-red-300')}
            >
              {microphone ? <MicrophoneIcon /> : <MicrophoneSlashIcon />}
            </RoundButton>
            <RoundButton
              label={camera ? 'Turn off your camera' : 'Turn on your camera'}
              onClick={() => saveVideoInputEnabled(!camera)}
              className={cn(!camera && 'bg-red-500/20 text-red-300')}
            >
              {camera ? <VideoCameraIcon /> : <VideoCameraSlashIcon />}
            </RoundButton>
            {canFlip && camera && (
              <RoundButton
                label="Switch to your other camera"
                onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}
              >
                <CameraRotateIcon />
              </RoundButton>
            )}
          </div>
        </div>
        <div className="grid content-start gap-4">
          <div className="grid gap-1.5">
            <p className="text-xs font-medium tracking-wide text-white/60 uppercase">Ready to join?</p>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
            {course && <p className="text-sm text-white/70">{course}</p>}
          </div>
          <Button size="lg" onClick={() => onJoin(camera, microphone)} className="w-full sm:w-max">
            Join now
          </Button>
          <p className="text-xs leading-relaxed text-white/60">
            You can turn your microphone and camera on or off at any time in the room.
          </p>
        </div>
      </div>
    </div>
  );
}

const LEAVE =
  'bg-destructive hover:bg-destructive/90 flex h-10 shrink-0 items-center gap-2 rounded-full px-2.5 text-[0.8125rem] font-semibold text-white sm:h-11 sm:px-4';

// M03c T17: a dark card over the stage — the hosts' poll and breakout rooms, and a phone's sheet of tools (`bottom`). It
// stays inside the stage, so it shows in full screen too; Escape or a click outside closes it.
function Overlay({
  title,
  onClose,
  bottom = false,
  children,
}: {
  title: string;
  onClose: () => void;
  bottom?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn('absolute inset-0 z-40 grid bg-black/50', bottom ? 'items-end' : 'place-items-center p-3')}
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
        className={cn(
          'grid max-h-full w-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-(--lk-bg) ring-1 ring-white/15',
          bottom ? 'max-h-[85%] rounded-t-xl' : 'max-w-md rounded-lg shadow-lg',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/10 py-1.5 pr-1.5 pl-4">
          <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            autoFocus
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
          >
            <XIcon className="size-4" />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </section>
    </div>
  );
}

// A setting with a few choices, as a row of chips (a phone's sheet).
function Choices<T extends string>({
  label,
  value,
  options,
  set,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  set: (value: T) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className={cn(SECTION_HEADING, 'mb-2')}>{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => set(o.value)}
            className={cn(
              'h-8 rounded-md px-3 ring-1',
              value === o.value ? 'bg-primary ring-primary' : 'ring-white/20',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// M03c T17: Mic ▾ and Camera ▾ on a wide stage's bar — which microphone, speaker or camera the room uses. The list is
// read when the menu opens, without asking for permission again; a browser that cannot choose the speaker lists none.
const DEVICE_KINDS: Record<'audioinput' | 'audiooutput' | 'videoinput', string> = {
  audioinput: 'Microphone',
  audiooutput: 'Speaker',
  videoinput: 'Camera',
};
function DeviceMenu({
  label,
  kinds,
  onError,
}: {
  label: string;
  kinds: (keyof typeof DEVICE_KINDS)[];
  onError: (message: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className="-ml-1 grid h-10 w-5 shrink-0 place-items-center rounded-full text-white/70 hover:text-white"
        >
          <CaretUpIcon weight="bold" className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-72">
        {kinds.map((kind) => (
          <DeviceChoice key={kind} kind={kind} onError={onError} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function DeviceChoice({ kind, onError }: { kind: keyof typeof DEVICE_KINDS; onError: (message: string) => void }) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind, requestPermissions: false });
  if (devices.length === 0) return null;
  return (
    <>
      <DropdownMenuLabel>{DEVICE_KINDS[kind]}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={activeDeviceId}
        onValueChange={(id) =>
          void setActiveMediaDevice(id).catch(() =>
            onError(`That ${DEVICE_KINDS[kind].toLowerCase()} could not start.`),
          )
        }
      >
        {devices.map((d, i) => (
          <DropdownMenuRadioItem key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${DEVICE_KINDS[kind]} ${i + 1}`}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}

// M03c T17: with a caption (a wide stage's bar), the word sits under the icon, as in Zoom.
function RoundButton({
  label,
  caption,
  pressed,
  badge = 0,
  className,
  children,
  ...button
}: ComponentProps<'button'> & { label: string; caption?: string; pressed?: boolean; badge?: number }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        'relative grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-60 sm:size-11 [&_svg]:size-5',
        caption && 'sm:h-12 sm:w-auto sm:min-w-14 sm:gap-0.5 sm:rounded-xl sm:px-2 sm:py-1',
        pressed && 'bg-primary hover:bg-primary/90',
        className,
      )}
      {...button}
    >
      {children}
      {caption && <span className="text-[0.6875rem] leading-none font-medium whitespace-nowrap">{caption}</span>}
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
  caption,
  locked,
  turnOn,
  className,
}: {
  source: Track.Source.Microphone | Track.Source.Camera;
  on: ReactNode;
  off: ReactNode;
  caption?: string;
  // Why a host has turned this off for students, if they have.
  locked?: string;
  // How to turn it on, when not the usual way (a camera with its background blurred).
  turnOn?: () => void;
  className?: string;
}) {
  const { enabled, pending, toggle } = useTrackToggle({ source });
  const what = source === Track.Source.Microphone ? 'microphone' : 'camera';
  const label = locked ?? `Turn ${enabled ? 'off' : 'on'} your ${what}`;
  return (
    <RoundButton
      label={label}
      caption={caption}
      onClick={() => (!enabled && turnOn ? turnOn() : void toggle())}
      disabled={pending || locked !== undefined}
      className={cn(!enabled && 'bg-red-500/20 text-red-300', className)}
    >
      {enabled ? on : off}
    </RoundButton>
  );
}

function People({
  sessionId,
  noun,
  host,
  endsAt,
  expected,
  attendanceNote,
  controls,
  now,
  participants,
  hands,
  inRoom,
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
  inRoom: number;
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
                  {OTHERS[noun]} {label}
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
            [`${inRoom}`, noun === 'class' ? `of ${expected} in class` : `of ${expected} invited`],
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
                  {(isHost(p) || isGuest(p) || handOf(p) > 0) && (
                    <span className={cn('text-xs', handOf(p) > 0 ? 'text-gold' : 'text-white/60')}>
                      {handOf(p) > 0 ? 'Hand raised' : isHost(p) ? 'Host' : 'Guest'}
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
            action={endRoom}
            submitLabel={`End ${noun} for everyone`}
            submitVariant="destructive"
            submitIcon={<StopIcon weight="fill" />}
            fullWidth
            confirm={{
              title: `End the ${noun} for everyone?`,
              message:
                noun === 'class'
                  ? 'Everyone leaves the room and attendance is worked out from the time each student spent in it.'
                  : 'Everyone leaves the room.',
            }}
          >
            <input type="hidden" name="sessionId" value={sessionId} />
          </ActionForm>
        </footer>
      )}
    </>
  );
}

const FIELD =
  'h-9 w-full rounded-md bg-white/10 px-3 text-[0.8125rem] outline-none placeholder:text-white/40 ring-1 ring-white/15 focus-visible:ring-2 focus-visible:ring-white/40';
const SECTION_HEADING = 'text-[0.6875rem] font-medium tracking-wide text-white/60 uppercase';

type NewPoll = { question: string; 'option[]': string[]; showResults: boolean };
type NewRooms = { rooms: number; limitMin: number; 'assign[]': string[] };
type Person = { id: string; name: string };

// M03c T6 (mock-ups R3-B A, R3-C): the Activities tab. Hosts start a poll, watch the answers come in, show the results
// and end it; the others answer the open poll and see the results once a host shows them. Breakout rooms and the
// whiteboard join the hosts' list in T7 and T8.
// M03c T7 (mock-up R3-D): how many rooms, for how long, and who goes where — dealt out in turn, shuffled at random on
// request, and changed person by person.
const LIMITS_MIN = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];
const deal = (people: Person[], rooms: number) =>
  Object.fromEntries(people.map((p, i) => [p.id, (i % rooms) + 1])) as Record<string, number>;

function BreakoutForm({
  people,
  busy,
  open,
}: {
  people: Person[];
  busy: boolean;
  open: (rooms: NewRooms) => Promise<void>;
}) {
  const [rooms, setRooms] = useState(Math.min(20, Math.max(2, Math.ceil(people.length / 5))));
  const [limitMin, setLimitMin] = useState(15);
  const [assigned, setAssigned] = useState(() => deal(people, rooms));
  const shuffle = () => {
    const mixed = [...people];
    for (let i = mixed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
    }
    setAssigned(deal(mixed, rooms));
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void open({ rooms, limitMin, 'assign[]': Object.entries(assigned).map(([id, room]) => `${id}:${room}`) });
      }}
      className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-4"
    >
      <p className="text-[0.8125rem] text-white/70">Split the room into small groups for a while.</p>
      <div className="grid grid-cols-2 gap-3 text-[0.8125rem]">
        <label className="grid gap-1.5">
          Rooms
          <select
            value={rooms}
            onChange={(event) => {
              const count = Number(event.target.value);
              setRooms(count);
              setAssigned(deal(people, count));
            }}
            className={FIELD}
          >
            {Array.from({ length: Math.min(20, people.length) - 1 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n} className="text-foreground">
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          Time limit
          <select value={limitMin} onChange={(event) => setLimitMin(Number(event.target.value))} className={FIELD}>
            {LIMITS_MIN.map((m) => (
              <option key={m} value={m} className="text-foreground">
                {m === 0 ? 'None' : `${m} min`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center justify-between gap-3">
        <h3 className={SECTION_HEADING}>Who goes where · {people.length}</h3>
        <button type="button" onClick={shuffle} className="text-xs text-white/60 hover:text-white">
          Shuffle
        </button>
      </div>
      <ul className="grid gap-1">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-2.5 text-[0.8125rem]">
            <Avatar name={p.name} />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <select
              aria-label={`Room for ${p.name}`}
              value={assigned[p.id] ?? 1}
              onChange={(event) => setAssigned({ ...assigned, [p.id]: Number(event.target.value) })}
              className="h-8 rounded-md bg-white/10 px-2 text-xs ring-1 ring-white/15"
            >
              {Array.from({ length: rooms }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n} className="text-foreground">
                  Room {n}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <button
        type="submit"
        disabled={busy}
        className="bg-primary h-9 rounded-md text-[0.8125rem] font-medium disabled:opacity-50"
      >
        Open {rooms} rooms
      </button>
      <p className="text-xs text-white/60">Each person is asked to join their room. People who join later stay here.</p>
    </form>
  );
}

function BreakoutStatus({
  breakout,
  now,
  busy,
  visit,
  close,
  message,
}: {
  breakout: RoomBreakout;
  now: number;
  busy: boolean;
  visit: (room: number) => void;
  close: () => void;
  message: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const left = breakout.closesAt && now > 0 ? Math.max(0, Math.round(breakout.closesAt.getTime() / 1000) - now) : null;
  const small = 'flex h-7 items-center rounded-md px-2.5 text-xs ring-1 ring-white/15 hover:bg-white/10';
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className={SECTION_HEADING}>Breakout rooms · {breakout.rooms} open</h2>
        {left !== null && <span className="text-xs text-white/60 tabular-nums">{minutes(left)} left</span>}
      </div>
      <ul className="grid gap-2">
        {breakout.assigned.map((r) => (
          <li key={r.room} className="flex items-start gap-3 rounded-md p-3 ring-1 ring-white/10">
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-[0.8125rem] font-semibold">Room {r.room}</span>
              <span className="text-xs text-white/70">{r.people.join(', ') || 'Nobody'}</span>
            </span>
            <button type="button" disabled={busy} onClick={() => visit(r.room)} className={small}>
              Visit
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void message(text).then((ok) => ok && setText(''));
        }}
        className="flex gap-2"
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={300}
          aria-label="Message every room"
          placeholder="Message every room"
          className={FIELD}
        />
        <button type="submit" disabled={busy || text.trim() === ''} className={cn(small, 'h-9 disabled:opacity-50')}>
          Send
        </button>
      </form>
      <button
        type="button"
        disabled={busy}
        onClick={close}
        className="bg-primary h-9 rounded-md text-[0.8125rem] font-medium disabled:opacity-50"
      >
        Close the rooms
      </button>
      <p className="text-xs text-white/60">Everyone comes back a minute after you close them.</p>
    </section>
  );
}

function PollForm({ noun, busy, create }: { noun: Noun; busy: boolean; create: (poll: NewPoll) => Promise<void> }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [showResults, setShowResults] = useState(true);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void create({ question, 'option[]': options, showResults });
      }}
      className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-4"
    >
      <p className="text-[0.8125rem] text-white/70">Ask a quick question; the answers come in live.</p>
      <label className="grid gap-1.5 text-[0.8125rem]">
        Question
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          required
          maxLength={200}
          className={FIELD}
        />
      </label>
      <fieldset className="grid gap-1.5 text-[0.8125rem]">
        <legend className="mb-1.5">Options</legend>
        {options.map((option, i) => (
          <input
            // Options are only added at the end, so their place names them.
            key={i}
            value={option}
            onChange={(event) => setOptions(options.map((o, j) => (j === i ? event.target.value : o)))}
            required={i < 2}
            maxLength={120}
            aria-label={`Option ${i + 1}`}
            className={FIELD}
          />
        ))}
        {options.length < 6 && (
          <button
            type="button"
            onClick={() => setOptions([...options, ''])}
            className="justify-self-start text-xs text-white/60 hover:text-white"
          >
            + Add an option (2–6)
          </button>
        )}
      </fieldset>
      <label className="flex items-center justify-between gap-3 text-[0.8125rem]">
        {OTHERS[noun]} see the results when it ends
        <Switch checked={showResults} onCheckedChange={setShowResults} className="data-[state=unchecked]:bg-white/20" />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="bg-primary h-9 rounded-md text-[0.8125rem] font-medium disabled:opacity-50"
      >
        Start the poll
      </button>
    </form>
  );
}

function PollCard({
  poll,
  host,
  noun,
  busy,
  answer,
  end,
  show,
}: {
  poll: RoomPoll;
  host: boolean;
  noun: Noun;
  busy: boolean;
  answer: (pollId: string, optionId: string) => void;
  end: (pollId: string) => void;
  show: (pollId: string) => void;
}) {
  const [choice, setChoice] = useState(poll.mine);
  const open = poll.status === 'open';
  const total = poll.answered ?? 0;
  const small = 'flex h-7 items-center rounded-md px-2.5 text-xs ring-1 ring-white/15 hover:bg-white/10';
  return (
    <article className="grid gap-3 rounded-md p-3 ring-1 ring-white/10">
      <div className="flex items-center justify-between gap-3">
        <span className={SECTION_HEADING}>Poll · {open ? 'open' : 'ended'}</span>
        {poll.answered !== null && <span className="text-xs text-white/60 tabular-nums">{total} answered</span>}
      </div>
      <p className="text-[0.9375rem] font-semibold">{poll.question}</p>
      {!host && open && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (choice) answer(poll.id, choice);
          }}
          className="grid gap-2"
        >
          {poll.options.map((o) => (
            <label
              key={o.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-[0.8125rem] ring-1',
                choice === o.id ? 'ring-primary bg-primary/15' : 'ring-white/15',
              )}
            >
              <input
                type="radio"
                name={`poll-${poll.id}`}
                value={o.id}
                checked={choice === o.id}
                onChange={() => setChoice(o.id)}
                className="accent-primary"
              />
              {o.text}
            </label>
          ))}
          <button
            type="submit"
            disabled={busy || !choice || choice === poll.mine}
            className="bg-primary h-9 rounded-md text-[0.8125rem] font-medium disabled:opacity-50"
          >
            {poll.mine ? (choice === poll.mine ? 'Answer sent' : 'Change my answer') : 'Send my answer'}
          </button>
          <p className="text-xs text-white/60">You can change it until the poll ends.</p>
        </form>
      )}
      {poll.answered !== null && (
        <ul className="grid gap-2">
          {poll.options.map((o) => {
            const pct = total > 0 ? Math.round((100 * (o.count ?? 0)) / total) : 0;
            return (
              <li key={o.id} className="grid gap-1 text-[0.8125rem]">
                <span className="flex justify-between gap-3">
                  <span>
                    {o.text}
                    {poll.mine === o.id && <span className="text-white/60"> · yours</span>}
                  </span>
                  <span className="text-white/70 tabular-nums">
                    {o.count} · {pct} %
                  </span>
                </span>
                <span className="block h-2 overflow-hidden rounded-full bg-white/10">
                  <span className="bg-primary block h-full rounded-full" style={{ width: `${pct}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {!host && !open && poll.mine === null && <p className="text-xs text-white/60">You did not answer.</p>}
      {host && open && (
        <div className="flex flex-wrap gap-2">
          {!poll.shared && (
            <button type="button" disabled={busy} onClick={() => show(poll.id)} className={small}>
              Show results to {noun === 'class' ? 'students' : 'everyone'} now
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => end(poll.id)}
            className="bg-primary flex h-7 items-center rounded-md px-2.5 text-xs font-medium"
          >
            End the poll
          </button>
        </div>
      )}
      {host && !open && (
        <p className="text-xs text-white/60">
          {poll.shared || poll.showResults ? `${OTHERS[noun]} saw these results.` : `Only hosts saw these results.`}
        </p>
      )}
    </article>
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
  noun,
  locked,
  chatMessages,
  send,
  isSending,
}: { me: string; noun: Noun; locked: boolean } & ReturnType<typeof useChat>) {
  const [draft, setDraft] = useState('');
  const [failed, setFailed] = useState(false);
  // A message that does not go stays in the box, to send again.
  function submit() {
    const text = draft.trim();
    if (!text) return;
    setFailed(false);
    send(text).then(
      () => setDraft(''),
      () => setFailed(true),
    );
  }
  return (
    <>
      <ol className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-4">
        <li className="text-xs text-white/60">Messages are not saved. Only the people in the {noun} now see them.</li>
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
          submit();
        }}
        className="flex flex-wrap gap-2 border-t border-white/10 p-3"
      >
        {failed && (
          <p role="alert" className="w-full text-xs text-red-300">
            Your message was not sent. Check your connection and send it again.
          </p>
        )}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={500}
          disabled={locked}
          aria-label="Message"
          placeholder={locked ? lockedBy(noun, 'chat') : 'Write a message'}
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
