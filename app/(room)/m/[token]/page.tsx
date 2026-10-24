import { Suspense } from 'react';
import type { Metadata } from 'next';
import { askToJoin, stopAsking } from './actions';
import { ActionForm, Field } from '@/components/action-form';
import { AutoRefresh } from '@/components/auto-refresh';
import { LiveRoom } from '@/components/live-room';
import { RoomNotice } from '@/components/room-notice';
import { DeviceCheck } from '@/components/test-lobby';
import { Input } from '@/components/ui/input';
import { getGuestLobby } from '@/lib/data/meetings';
import { formatDay, formatTime } from '@/lib/format';
import { guestToken } from '@/lib/schemas/live';
import { notFound } from 'next/navigation';

export const metadata: Metadata = { title: 'Meeting' };

const MINUTE_MS = 60_000;

// M03c T4 (decision 7, mock-up R2-C): a guest's personal link, signed out. They give their name and ask to join; the
// page checks every few seconds and becomes the meeting once a host lets them in.
export default function GuestPage({ params }: PageProps<'/m/[token]'>) {
  return (
    <div data-lk-theme="default" className="flex h-dvh flex-col bg-(--lk-bg) text-(--lk-fg)">
      <Suspense fallback={<RoomNotice title="Opening the meeting…" />}>
        <Lobby params={params} />
      </Suspense>
    </div>
  );
}

async function Lobby({ params }: { params: PageProps<'/m/[token]'>['params'] }) {
  const { token } = await params;
  if (!guestToken.safeParse(token).success) notFound();
  const lobby = await getGuestLobby(token);
  const { session, guest } = lobby;
  const ref = <input type="hidden" name="token" value={token} />;
  if (session.state === 'live' && lobby.join) {
    return (
      <LiveRoom
        sessionId={lobby.sessionId}
        serverUrl={lobby.join.serverUrl}
        token={lobby.join.token}
        noun="meeting"
        trackFocus={false}
        host={false}
        guest
        backHref={null}
        title={session.title}
        course=""
        startedAt={session.startedAt}
        endsAt={session.scheduledEnd}
        expected={lobby.invited}
        attendanceNote=""
        controls={null}
        polls={[]}
        breakout={null}
        board={lobby.board}
      />
    );
  }
  if (guest.state === 'removed' && session.state === 'live') {
    return (
      <RoomNotice
        title="You were removed from this meeting"
        text={`A host removed you from “${session.title}”. You can join again if a host lets you back.`}
      >
        <AutoRefresh seconds={10} />
      </RoomNotice>
    );
  }
  const when = `${formatDay(session.scheduledStart)}, ${formatTime(session.scheduledStart)}–${formatTime(session.scheduledEnd)}`;
  if (session.state !== 'live') {
    const now = new Date();
    const soon = session.scheduledStart.getTime() - now.getTime() < 60 * MINUTE_MS;
    const notice = {
      upcoming: {
        title: `The meeting starts ${formatDay(session.scheduledStart)} at ${formatTime(session.scheduledStart)}`,
        text: soon
          ? 'Keep this tab open: you can ask to join once a host starts it.'
          : 'Open this link again a little before the start.',
      },
      ended: { title: 'This meeting has ended', text: 'You can close this tab.' },
      cancelled: { title: 'This meeting was cancelled', text: 'You can close this tab.' },
      not_held: { title: 'This meeting was not held', text: 'You can close this tab.' },
    }[session.state];
    return (
      <RoomNotice title={notice.title} text={notice.text}>
        {session.state === 'upcoming' && soon && <AutoRefresh seconds={20} />}
      </RoomNotice>
    );
  }
  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto p-4 sm:p-8">
      <div className="grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="text-foreground">
          <DeviceCheck camera />
        </div>
        <div className="grid content-start gap-5">
          <div className="grid gap-1.5">
            <p className="text-xs font-medium tracking-wide text-white/60 uppercase">Centurion LMS · meeting</p>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{session.title}</h1>
            <p className="text-sm text-white/70">
              {when} · hosted by {lobby.hosts}
            </p>
          </div>
          {guest.state === 'waiting' ? (
            <div className="grid gap-3 rounded-md p-4 ring-1 ring-white/15">
              <p className="flex items-center gap-2.5 font-semibold">
                <span className="size-4 rounded-full border-2 border-white/30 border-t-white motion-safe:animate-spin" />
                Asking to join…
              </p>
              <p className="text-sm text-white/70">
                A host will let you in. Keep this tab open; it moves into the meeting by itself.
              </p>
              <div className="text-foreground w-max">
                <ActionForm action={stopAsking} submitLabel="Cancel" submitVariant="outline" submitSize="sm">
                  {ref}
                </ActionForm>
              </div>
              <AutoRefresh seconds={3} />
            </div>
          ) : (
            <div className="surface text-card-foreground grid gap-3 p-5">
              {guest.state === 'denied' && (
                <p className="text-warning text-sm font-medium">A host did not let you in. You can ask again.</p>
              )}
              <ActionForm action={askToJoin} submitLabel="Ask to join" fullWidth>
                {ref}
                <Field name="name" label="Your name" hint="Everyone in the meeting sees it.">
                  <Input name="name" required minLength={2} maxLength={80} defaultValue={guest.name ?? ''} />
                </Field>
              </ActionForm>
              <p className="text-muted-foreground text-xs leading-relaxed">
                You were invited as {guest.email}. This link is yours alone: a host lets you in after you ask.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
