import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeftIcon, PlayIcon } from '@phosphor-icons/react/ssr';
import { startMeeting } from '@/app/(app)/meetings/actions';
import { ActionForm } from '@/components/action-form';
import { AutoRefresh } from '@/components/auto-refresh';
import { LiveRoom } from '@/components/live-room';
import { RoomNotice } from '@/components/room-notice';
import { Button } from '@/components/ui/button';
import { getMeetingRoom } from '@/lib/data/meetings';
import { istDayKey } from '@/lib/domain/time';
import { formatDay, formatTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Meeting' };

const MINUTE_MS = 60_000;

// M03c T4: a meeting's room, the whole tab like a class's; for its hosts and the people from the LMS invited to it.
// Guests come through their own link (/m/<token>).
export default function MeetingRoomPage({ params }: PageProps<'/meetings/[meetingId]/room'>) {
  return (
    <div data-lk-theme="default" className="flex h-dvh flex-col bg-(--lk-bg) text-(--lk-fg)">
      <Suspense fallback={<RoomNotice title="Opening the meeting…" />}>
        <Room params={params} />
      </Suspense>
    </div>
  );
}

async function Room({ params }: { params: PageProps<'/meetings/[meetingId]/room'>['params'] }) {
  const { meetingId } = await params;
  const room = await getMeetingRoom(meetingId);
  const { session } = room;
  const page = `/meetings/${meetingId}`;
  if (session.state === 'live' && room.join) {
    return (
      <LiveRoom
        sessionId={session.id}
        serverUrl={room.join.serverUrl}
        token={room.join.token}
        noun="meeting"
        trackFocus={false}
        host={room.host}
        backHref={page}
        title={session.title}
        course=""
        startedAt={session.startedAt}
        endsAt={session.scheduledEnd}
        expected={room.invited}
        attendanceNote="Meetings take no attendance."
        controls={room.controls}
      />
    );
  }
  const back = (
    <Button asChild variant="ghost" className="text-(--lk-fg) hover:bg-white/10 hover:text-(--lk-fg)">
      <Link href={page}>
        <ArrowLeftIcon /> Open the meeting page
      </Link>
    </Button>
  );
  if (session.state === 'live') {
    return (
      <RoomNotice
        title="You were removed from this meeting"
        text={`A host removed you from “${session.title}”. You can join again if a host lets you back.`}
      >
        {back}
      </RoomNotice>
    );
  }
  if (session.state === 'upcoming') {
    const now = new Date();
    const when = `${istDayKey(session.scheduledStart) === istDayKey(now) ? 'today' : `on ${formatDay(session.scheduledStart)}`} at ${formatTime(session.scheduledStart)}`;
    if (!room.host) {
      const soon = session.scheduledStart.getTime() - now.getTime() < 60 * MINUTE_MS;
      return (
        <RoomNotice
          title={`The meeting starts ${when}`}
          text={
            soon
              ? 'A host opens it. Keep this tab open: the meeting appears here when it starts.'
              : 'Come back a little before the start. You will also get a notification when it starts.'
          }
        >
          {soon && <AutoRefresh seconds={20} />}
        </RoomNotice>
      );
    }
    const canStart = now >= room.canStartAt;
    return (
      <RoomNotice
        title={canStart ? 'Ready to start' : `You can start the meeting from ${formatTime(room.canStartAt)}`}
        text={`It is set for ${when}. Everyone from the LMS is told the moment you start; guests waiting on their link are let into the lobby.`}
      >
        {canStart ? (
          <div className="text-foreground">
            <ActionForm
              action={startMeeting}
              submitLabel="Start meeting"
              submitVariant="outline"
              submitIcon={<PlayIcon />}
            >
              <input type="hidden" name="meetingId" value={meetingId} />
            </ActionForm>
          </div>
        ) : (
          <AutoRefresh seconds={30} />
        )}
      </RoomNotice>
    );
  }
  const ended = {
    ended: { title: 'This meeting has ended', text: 'You can close this tab.' },
    cancelled: { title: 'This meeting was cancelled', text: 'Everyone invited was told.' },
    not_held: { title: 'This meeting was not held', text: 'Its time passed without a start.' },
  }[session.state];
  return (
    <RoomNotice title={ended.title} text={ended.text}>
      {back}
    </RoomNotice>
  );
}
