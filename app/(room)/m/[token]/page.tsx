import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { joinMeeting } from './actions';
import { ActionForm, Field } from '@/components/action-form';
import { AutoRefresh } from '@/components/auto-refresh';
import { LiveRoom } from '@/components/live-room';
import { RoomNotice } from '@/components/room-notice';
import { Input } from '@/components/ui/input';
import { getMeetingLink } from '@/lib/data/meetings';
import { formatDay, formatTime } from '@/lib/format';
import { meetingLink } from '@/lib/schemas/live';

export const metadata: Metadata = { title: 'Meeting' };

const MINUTE_MS = 60_000;

// M03c T4, T14 (decision 9): everyone's personal link. Signed in as its person, it opens their own room; otherwise they
// give the passcode from their invitation (and a guest their name) and come straight in.
export default function MeetingLinkPage({ params }: PageProps<'/m/[token]'>) {
  return (
    <div data-lk-theme="default" className="flex h-dvh flex-col bg-(--lk-bg) text-(--lk-fg)">
      <Suspense fallback={<RoomNotice title="Opening the meeting…" />}>
        <Join params={params} />
      </Suspense>
    </div>
  );
}

async function Join({ params }: { params: PageProps<'/m/[token]'>['params'] }) {
  const { token } = await params;
  if (!meetingLink.safeParse(token).success) notFound();
  const link = await getMeetingLink(token);
  const { session, person } = link;
  if (link.signedIn) redirect(`/meetings/${link.sessionId}/room`);
  if (link.join) {
    return (
      <LiveRoom
        sessionId={link.sessionId}
        serverUrl={link.join.serverUrl}
        token={link.join.token}
        noun="meeting"
        trackFocus={false}
        host={false}
        guest
        backHref={null}
        title={session.title}
        course=""
        startedAt={session.startedAt}
        endsAt={session.scheduledEnd}
        expected={link.invited}
        attendanceNote=""
        controls={null}
        polls={link.polls}
        breakout={null}
        board={link.board}
      />
    );
  }
  if (link.removed && session.state === 'live') {
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
          ? 'Keep this tab open: you can join once a host starts it.'
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
      <div className="grid w-full max-w-md items-center gap-8">
        <div className="grid content-start gap-5">
          <div className="grid gap-1.5">
            <p className="text-xs font-medium tracking-wide text-white/60 uppercase">Centurion LMS · meeting</p>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{session.title}</h1>
            <p className="text-sm text-white/70">
              {when} · hosted by {link.hosts}
            </p>
          </div>
          <div className="surface text-card-foreground grid gap-3 p-5">
            <ActionForm action={joinMeeting} submitLabel="Join now" fullWidth>
              <input type="hidden" name="token" value={token} />
              {person.kind === 'guest' ? (
                <Field name="name" label="Your name" hint="Everyone in the meeting sees it.">
                  <Input name="name" required minLength={2} maxLength={80} defaultValue={person.name ?? ''} />
                </Field>
              ) : (
                <p className="text-sm">
                  Joining as <b className="font-semibold">{person.name}</b>
                </p>
              )}
              {link.asksPasscode && (
                <Field name="passcode" label="Passcode" hint="The six digits in your invitation email.">
                  <Input
                    name="passcode"
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                  />
                </Field>
              )}
            </ActionForm>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {person.kind === 'guest' ? (
                `You were invited as ${person.email}. This link is yours alone.`
              ) : (
                <>
                  Have an LMS account?{' '}
                  <Link
                    href={`/login?next=/m/${token}`}
                    className="text-primary font-medium underline-offset-4 hover:underline"
                  >
                    Sign in instead
                  </Link>
                  , and the link opens the meeting as you.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
