'use client';

import '@excalidraw/excalidraw/index.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CaptureUpdateAction, DEFAULT_LASER_COLOR, Excalidraw, reconcileElements } from '@excalidraw/excalidraw';
import type { RemoteExcalidrawElement } from '@excalidraw/excalidraw/data/reconcile';
import type {
  Collaborator,
  ExcalidrawImperativeAPI,
  NormalizedZoomValue,
  SocketId,
} from '@excalidraw/excalidraw/types';
import { useDataChannel, useRoomContext } from '@livekit/components-react';
import { Track, type LocalTrackPublication, type Participant } from 'livekit-client';
import { z } from 'zod';
import { BOARD_TRACK } from '@/lib/schemas/live';

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}

// M03c T8 (mock-up R3-E): Excalidraw on the stage, loaded only when a host opens a board. Its fonts come from our own
// files (public/excalidraw), never a CDN. The drawing goes from browser to browser as text streams on the `whiteboard`
// topic and is not stored: each change sends the elements whose version moved, at most every 150 ms; someone who
// arrives later asks, and the hosts' browsers send them the whole board. Changes from someone who may not draw are
// ignored by everyone.
// T16: everyone else sees what the presenter sees — the presenter's browser sends the part of the board in view, and
// the others fit it to their own screen, so a phone shows the laptop's landscape view, scaled; panning stops following
// until they choose to follow again. The pointer and laser of anyone who may draw reach everyone (lossy data messages,
// drawn as Excalidraw's collaborators). While the room is recorded, the presenter's browser also sends the board as a
// video, so the recording shows it (decision 11, A-227).
if (typeof window !== 'undefined') window.EXCALIDRAW_ASSET_PATH = '/excalidraw/';

const TOPIC = 'whiteboard';
const POINTER_TOPIC = 'whiteboard-pointer';
const SEND_EVERY_MS = 150;
const POINTER_EVERY_MS = 40;
const VIEW_EVERY_MS = 200;
const CURSOR_IDLE_MS = 3_000;
const RECORDED = { width: 1280, height: 720, fps: 10 };

const Json = z.string().transform((text, ctx): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Not JSON' });
    return z.NEVER;
  }
});
const Element = z.looseObject({
  id: z.string().min(1).max(100),
  type: z.string().min(1).max(40),
  version: z.number().int(),
  versionNonce: z.number().int(),
  isDeleted: z.boolean(),
});
const Elements = z.object({ kind: z.literal('elements'), elements: z.array(Element).max(10_000) });
const Sync = z.object({ kind: z.literal('sync') });
const size = z.number().positive().max(1e7);
const at = z.number().min(-1e7).max(1e7);
const View = z.object({ kind: z.literal('view'), x: at, y: at, w: size, h: size });
const Pointer = z.object({ x: at, y: at, tool: z.enum(['pointer', 'laser']), button: z.enum(['up', 'down']) });
type Rect = { x: number; y: number; w: number; h: number };

// Elements another browser sent, checked for the fields Excalidraw merges by.
function isRemote(message: unknown): message is { kind: 'elements'; elements: RemoteExcalidrawElement[] } {
  return Elements.safeParse(message).success;
}
const isZoom = (value: number): value is NormalizedZoomValue => value > 0;
const isSocketId = (id: string): id is SocketId => id.length > 0;
// A cursor colour per person (no violet, 08 §1).
const COLOURS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2', '#65a30d', '#db2777', '#475569'];
const colourOf = (identity: string) => {
  const colour = COLOURS[[...identity].reduce((sum, c) => sum + c.charCodeAt(0), 0) % COLOURS.length];
  return { background: colour, stroke: colour };
};

export function Whiteboard({
  canDraw,
  host,
  presenter,
  mayDraw,
  capture,
  onError,
}: {
  canDraw: boolean;
  host: boolean;
  // Whom the others follow: the host who opened the board, else a host in the room.
  presenter: { identity: string; name: string } | null;
  // Whether a change from this person counts: a host's always, the others' when they may draw.
  mayDraw: (identity: string) => boolean;
  // Send the board as a video, for the recording (the presenter, while the room is recorded).
  capture: boolean;
  onError: (message: string) => void;
}) {
  const room = useRoomContext();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const presenting = presenter?.identity === room.localParticipant.identity;
  // What the handlers registered once read: the latest of these.
  const latest = useRef({ host, mayDraw, presenter, presenting, following: true });
  const [following, setFollowing] = useState(true);
  useEffect(() => {
    latest.current = { host, mayDraw, presenter, presenting, following };
  });
  // The version of each element already sent or received, so nothing goes back where it came from.
  const known = useRef(new Map<string, number>());
  const timer = useRef<number | null>(null);
  // The presenter's view as last sent or received, and the view this browser set to follow it.
  const view = useRef<Rect | null>(null);
  const fitted = useRef<{ scrollX: number; scrollY: number; zoom: number } | null>(null);
  const viewTimer = useRef<number | null>(null);
  const pointerAt = useRef(0);
  const cursors = useRef(new Map<SocketId, Collaborator>());
  const cursorSeen = useRef(new Map<SocketId, number>());
  const box = useRef<HTMLDivElement>(null);

  const send = useCallback(
    (message: object, to?: string[]) =>
      room.localParticipant.sendText(JSON.stringify(message), { topic: TOPIC, destinationIdentities: to }),
    [room],
  );
  const failed = useCallback(
    () => onError('The whiteboard did not reach the others. Check your connection.'),
    [onError],
  );

  // The part of the board in view: the scene's coordinates at the screen's corners.
  const inView = useCallback((): Rect | null => {
    if (!api) return null;
    const { scrollX, scrollY, zoom, width, height } = api.getAppState();
    return { x: -scrollX, y: -scrollY, w: width / zoom.value, h: height / zoom.value };
  }, [api]);

  // Shows the presenter's view whole and centred, whatever this screen's shape.
  const fit = useCallback(() => {
    const target = view.current;
    if (!api || !target) return;
    const { width, height } = api.getAppState();
    const value = Math.min(Math.max(Math.min(width / target.w, height / target.h), 0.1), 30);
    if (!isZoom(value)) return;
    const scrollX = (width / value - target.w) / 2 - target.x;
    const scrollY = (height / value - target.h) / 2 - target.y;
    fitted.current = { scrollX, scrollY, zoom: value };
    api.updateScene({ appState: { scrollX, scrollY, zoom: { value } }, captureUpdate: CaptureUpdateAction.NEVER });
  }, [api]);

  useEffect(() => {
    if (!api) return;
    room.registerTextStreamHandler(TOPIC, async (reader, { identity }) => {
      const message = Json.safeParse(await reader.readAll()).data;
      const { host, mayDraw, presenter, presenting, following } = latest.current;
      if (Sync.safeParse(message).success) {
        const whole = { kind: 'elements', elements: api.getSceneElementsIncludingDeleted() };
        if (host) await send(whole, [identity]).catch(failed);
        const shown = presenting ? view.current : null;
        if (shown) await send({ kind: 'view', ...shown }, [identity]).catch(failed);
        return;
      }
      const seen = View.safeParse(message);
      if (seen.success) {
        if (identity !== presenter?.identity) return;
        const { x, y, w, h } = seen.data;
        view.current = { x, y, w, h };
        if (following) fit();
        return;
      }
      if (!isRemote(message) || !mayDraw(identity)) return;
      for (const element of message.elements) known.current.set(element.id, element.version);
      api.updateScene({
        elements: reconcileElements(api.getSceneElementsIncludingDeleted(), message.elements, api.getAppState()),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    });
    void send({ kind: 'sync' }).catch(failed);
    return () => room.unregisterTextStreamHandler(TOPIC);
  }, [api, room, send, failed, fit]);

  // A follower's own screen changing size keeps the presenter's view whole.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (latest.current.following && !latest.current.presenting) fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  // Pointers and the laser: drawn as Excalidraw's collaborators, and dropped after a few seconds still.
  const onPointer = useCallback(
    (m: { payload: Uint8Array; from?: Participant }) => {
      const from = m.from;
      const pointer = Json.pipe(Pointer).safeParse(new TextDecoder().decode(m.payload)).data;
      if (!api || !from || !pointer || !isSocketId(from.identity) || !latest.current.mayDraw(from.identity)) return;
      cursors.current.set(from.identity, {
        username: from.name || from.identity,
        color: colourOf(from.identity),
        button: pointer.button,
        pointer: {
          x: pointer.x,
          y: pointer.y,
          tool: pointer.tool,
          ...(pointer.tool === 'laser' && { laserColor: DEFAULT_LASER_COLOR }),
        },
      });
      cursorSeen.current.set(from.identity, Date.now());
      api.updateScene({ collaborators: new Map(cursors.current) });
    },
    [api],
  );
  const pointers = useDataChannel(POINTER_TOPIC, onPointer);
  useEffect(() => {
    if (!api) return;
    const sweep = window.setInterval(() => {
      const still = [...cursorSeen.current].filter(([, seen]) => Date.now() - seen > CURSOR_IDLE_MS);
      if (still.length === 0) return;
      for (const [id] of still) {
        cursors.current.delete(id);
        cursorSeen.current.delete(id);
      }
      api.updateScene({ collaborators: new Map(cursors.current) });
    }, 1_000);
    return () => window.clearInterval(sweep);
  }, [api]);

  // The recording's copy of the board: Excalidraw's drawing and the stroke being drawn, fitted into 1280 × 720.
  useEffect(() => {
    const el = box.current;
    if (!capture || !el) return;
    const out = document.createElement('canvas');
    out.width = RECORDED.width;
    out.height = RECORDED.height;
    const context = out.getContext('2d');
    const [track] = out.captureStream(RECORDED.fps).getVideoTracks();
    if (!context || !track) return;
    const draw = window.setInterval(() => {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, out.width, out.height);
      for (const canvas of el.querySelectorAll<HTMLCanvasElement>('canvas.excalidraw__canvas:not(.interactive)')) {
        if (canvas.width === 0 || canvas.height === 0) continue;
        const scale = Math.min(out.width / canvas.width, out.height / canvas.height);
        const [w, h] = [canvas.width * scale, canvas.height * scale];
        context.drawImage(canvas, (out.width - w) / 2, (out.height - h) / 2, w, h);
      }
    }, 1000 / RECORDED.fps);
    let published: LocalTrackPublication | undefined;
    let stopped = false;
    room.localParticipant.publishTrack(track, { source: Track.Source.ScreenShare, name: BOARD_TRACK }).then(
      (publication) => {
        published = publication;
        if (stopped && publication.track) void room.localParticipant.unpublishTrack(publication.track);
      },
      () => onError('The whiteboard could not be added to the recording.'),
    );
    return () => {
      stopped = true;
      window.clearInterval(draw);
      if (published?.track) void room.localParticipant.unpublishTrack(published.track);
      track.stop();
    };
  }, [capture, room, onError]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current ?? undefined);
      window.clearTimeout(viewTimer.current ?? undefined);
    },
    [],
  );

  const onChange = () => {
    if (!api) return;
    const { presenting, following } = latest.current;
    // The presenter's view goes to the others when it moves, at most every 200 ms.
    if (presenting && viewTimer.current === null) {
      viewTimer.current = window.setTimeout(() => {
        viewTimer.current = null;
        const shown = inView();
        const last = view.current;
        if (!shown || (last && (['x', 'y', 'w', 'h'] as const).every((k) => Math.abs(shown[k] - last[k]) < 0.5))) {
          return;
        }
        view.current = shown;
        void send({ kind: 'view', ...shown }).catch(failed);
      }, VIEW_EVERY_MS);
    }
    // A follower who pans or zooms themselves stops following.
    const set = fitted.current;
    if (!presenting && following && set) {
      const { scrollX, scrollY, zoom } = api.getAppState();
      const moved =
        Math.abs(scrollX - set.scrollX) > 1 ||
        Math.abs(scrollY - set.scrollY) > 1 ||
        Math.abs(zoom.value - set.zoom) > 0.001;
      if (moved) setFollowing(false);
    }
    if (!canDraw || timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const changed = api
        .getSceneElementsIncludingDeleted()
        .filter((element) => (known.current.get(element.id) ?? -1) < element.version);
      if (changed.length === 0) return;
      // Marked as sent only once they have gone, so a change that fails to send goes with the next one.
      void send({ kind: 'elements', elements: changed }).then(() => {
        for (const element of changed) known.current.set(element.id, element.version);
      }, failed);
    }, SEND_EVERY_MS);
  };

  return (
    <div ref={box} className="relative size-full">
      <Excalidraw
        excalidrawAPI={setApi}
        onChange={onChange}
        onPointerUpdate={({ pointer, button }) => {
          if (!canDraw || Date.now() - pointerAt.current < POINTER_EVERY_MS) return;
          pointerAt.current = Date.now();
          const message = JSON.stringify({ x: pointer.x, y: pointer.y, tool: pointer.tool, button });
          // Lossy on purpose: a pointer that does not arrive is replaced by the next one 40 ms later.
          void pointers.send(new TextEncoder().encode(message), { reliable: false }).catch(() => undefined);
        }}
        isCollaborating
        viewModeEnabled={!canDraw}
        theme="light"
        langCode="en"
        UIOptions={{
          canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: false },
          // Pictures would need their files sent to everyone; the board shares drawings only.
          tools: { image: false },
        }}
      />
      {presenter && !presenting && (
        <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
          {following ? (
            <span className="block rounded-full bg-black/75 px-3 py-1 text-xs whitespace-nowrap text-white">
              Following {presenter.name}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setFollowing(true);
                fit();
              }}
              className="bg-primary rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap text-white"
            >
              Follow {presenter.name}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
