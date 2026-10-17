'use client';

import '@livekit/components-styles';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import { ArrowClockwiseIcon, ArrowLeftIcon, MicrophoneSlashIcon } from '@phosphor-icons/react';
import { DisconnectReason } from 'livekit-client';
import { RoomNotice } from '@/components/room-notice';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

// `classPage` is where the class's attendance and summary are, linked once the class has ended.
type Props = { sessionId: string; serverUrl: string; token: string; trackFocus: boolean; classPage: string };
type State = 'in' | 'left' | 'replaced' | 'dropped' | 'ended' | 'failed';

const BEACON_MS = 60_000;

// The class fills the tab it was opened in (M03b, "like Google Meet in a tab"): LiveKit's video conference with its
// control bar at the bottom, on the room page outside the app's frame.
export function LiveRoom({ sessionId, serverUrl, token, trackFocus, classPage }: Props) {
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
          : 'The class is still running for your students. Rejoin, or end it with “End class” at the top when you are done.',
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
    <div className="relative flex min-h-0 flex-1 flex-col">
      {deviceFailed && (
        <Alert className="absolute inset-x-4 top-4 z-10 mx-auto max-w-lg">
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
        className="min-h-0 flex-1"
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
