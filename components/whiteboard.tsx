'use client';

import '@excalidraw/excalidraw/index.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CaptureUpdateAction, Excalidraw, reconcileElements } from '@excalidraw/excalidraw';
import type { RemoteExcalidrawElement } from '@excalidraw/excalidraw/data/reconcile';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useRoomContext } from '@livekit/components-react';
import { z } from 'zod';

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
if (typeof window !== 'undefined') window.EXCALIDRAW_ASSET_PATH = '/excalidraw/';

const TOPIC = 'whiteboard';
const SEND_EVERY_MS = 150;
const Element = z.looseObject({
  id: z.string().min(1).max(100),
  type: z.string().min(1).max(40),
  version: z.number().int(),
  versionNonce: z.number().int(),
  isDeleted: z.boolean(),
});
const Elements = z.object({ kind: z.literal('elements'), elements: z.array(Element).max(10_000) });
const Sync = z.object({ kind: z.literal('sync') });

// Elements another browser sent, checked for the fields Excalidraw merges by.
function isRemote(message: unknown): message is { kind: 'elements'; elements: RemoteExcalidrawElement[] } {
  return Elements.safeParse(message).success;
}

export function Whiteboard({
  canDraw,
  host,
  mayDraw,
  onError,
}: {
  canDraw: boolean;
  host: boolean;
  // Whether a change from this person counts: a host's always, the others' when they may draw.
  mayDraw: (identity: string) => boolean;
  onError: (message: string) => void;
}) {
  const room = useRoomContext();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  // The version of each element already sent or received, so nothing goes back where it came from.
  const known = useRef(new Map<string, number>());
  const timer = useRef<number | null>(null);

  const send = useCallback(
    (message: { kind: 'elements'; elements: readonly OrderedExcalidrawElement[] } | { kind: 'sync' }, to?: string[]) =>
      room.localParticipant
        .sendText(JSON.stringify(message), { topic: TOPIC, destinationIdentities: to })
        .catch(() => onError('Your drawing did not reach the others. Check your connection.')),
    [room, onError],
  );

  useEffect(() => {
    if (!api) return;
    room.registerTextStreamHandler(TOPIC, async (reader, { identity }) => {
      const message: unknown = JSON.parse(await reader.readAll());
      if (Sync.safeParse(message).success) {
        if (host) void send({ kind: 'elements', elements: api.getSceneElementsIncludingDeleted() }, [identity]);
        return;
      }
      if (!isRemote(message) || !mayDraw(identity)) return;
      for (const element of message.elements) known.current.set(element.id, element.version);
      api.updateScene({
        elements: reconcileElements(api.getSceneElementsIncludingDeleted(), message.elements, api.getAppState()),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    });
    void send({ kind: 'sync' });
    return () => room.unregisterTextStreamHandler(TOPIC);
  }, [api, room, host, mayDraw, send]);

  useEffect(() => () => window.clearTimeout(timer.current ?? undefined), []);

  const onChange = () => {
    if (!canDraw || !api || timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const changed = api
        .getSceneElementsIncludingDeleted()
        .filter((element) => (known.current.get(element.id) ?? -1) < element.version);
      if (changed.length === 0) return;
      for (const element of changed) known.current.set(element.id, element.version);
      void send({ kind: 'elements', elements: changed });
    }, SEND_EVERY_MS);
  };

  return (
    <Excalidraw
      excalidrawAPI={setApi}
      onChange={onChange}
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
  );
}
