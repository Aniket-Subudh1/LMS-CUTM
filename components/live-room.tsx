'use client';

import '@livekit/components-styles';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import { ArrowClockwiseIcon, MicrophoneSlashIcon, SignInIcon } from '@phosphor-icons/react';
import { DisconnectReason } from 'livekit-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type Props = { sessionId: string; serverUrl: string; token: string; trackFocus: boolean };
type State = 'in' | 'left' | 'replaced' | 'dropped' | 'ended' | 'failed';

const BEACON_MS = 60_000;


export function LiveRoom({ sessionId, serverUrl, token, trackFocus }: Props) {
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
          : 'The class is still running for your students. Rejoin, or end the class from the top of the page when you are done.',
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
      ended: { title: 'The class has ended', text: 'This page now shows how the class went.', again: false },
      failed: {
        title: 'Could not connect to the class',
        text: 'The network may be blocking live video. Try again in a moment, or switch to another network.',
        again: true,
      },
    };
    const { title, text, again } = copy[state];
    return (
      <div className="surface grid min-h-72 place-items-center p-8 text-center">
        <div className="grid max-w-md justify-items-center gap-3">
          <span className="icon-chip size-12 [&_svg]:size-7">
            <SignInIcon weight="duotone" />
          </span>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-muted-foreground text-sm text-pretty">{text}</p>
          {again && (
            <Button onClick={rejoin}>
              <ArrowClockwiseIcon /> Rejoin
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {deviceFailed && (
        <Alert>
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
        className="h-[min(78svh,48rem)] min-h-[26rem] overflow-hidden rounded-2xl"
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
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
