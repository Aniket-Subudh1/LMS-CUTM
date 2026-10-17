import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeftIcon, PlayIcon, StopIcon } from '@phosphor-icons/react/ssr';
import { endSession, startSession } from '@/app/(app)/courses/[offeringId]/live/actions';
import { ActionForm } from '@/components/action-form';
import { AutoRefresh } from '@/components/auto-refresh';
import { LiveRoom } from '@/components/live-room';
import { RoomNotice } from '@/components/room-notice';
import { Button } from '@/components/ui/button';
import { getSession, type SessionDetail } from '@/lib/data/live';
import { istDayKey } from '@/lib/domain/time';
import { formatDay, formatTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Live class' };

const MINUTE_MS = 60_000;

// The class itself, the whole tab like a video call (Aniket, 17 Oct 2026: "like Google Meet in a tab"). It sits outside
// the app's sidebar and header, and every Join button opens it in a new tab; the class page stays the place for
// attendance and the summary. Before and after the class the tab says where things stand.
export default function RoomPage({ params }: PageProps<'/courses/[offeringId]/live/[sessionId]/room'>) {
  return (
    <div data-lk-theme="default" className="flex h-dvh flex-col bg-(--lk-bg) text-(--lk-fg)">
      <Suspense fallback={<RoomNotice title="Opening the class…" />}>
        <Room params={params} />
      </Suspense>
    </div>
  );
}

async function Room({ params }: { params: PageProps<'/courses/[offeringId]/live/[sessionId]/room'>['params'] }) {
  const { offeringId, sessionId } = await params;
  const detail = await getSession(offeringId, sessionId);
  const { session } = detail;
  const classPage = `/courses/${offeringId}/live/${sessionId}`;
  const ref = (
    <>
      <input type="hidden" name="offeringId" value={offeringId} />
      <input type="hidden" name="sessionId" value={sessionId} />
    </>
  );
  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/10 px-4 text-sm">
        {session.state === 'live' && (
          <span className="text-destructive flex shrink-0 items-center gap-1.5 text-xs font-semibold">
            <span className="size-2 rounded-full bg-current motion-safe:animate-pulse" /> Live
          </span>
        )}
        <span className="min-w-0 truncate font-medium">{session.title}</span>
        <span className="min-w-0 truncate text-white/50 max-sm:hidden">{detail.offeringTitle}</span>
        {detail.canManage && session.state === 'live' && (
          <div className="ml-auto shrink-0">
            <ActionForm
              action={endSession}
              submitLabel="End class"
              submitVariant="destructive"
              submitSize="sm"
              submitIcon={<StopIcon />}
              confirm={{
                title: 'End the class for everyone?',
                message:
                  'Everyone leaves the room and attendance is worked out from the time each student spent in it.',
              }}
            >
              {ref}
            </ActionForm>
          </div>
        )}
      </header>
      <Stage detail={detail} classPage={classPage}>
        {ref}
      </Stage>
    </>
  );
}

function Stage({ detail, classPage, children }: { detail: SessionDetail; classPage: string; children: ReactNode }) {
  const { session } = detail;
  const back = (
    <Button asChild variant="ghost" className="text-(--lk-fg) hover:bg-white/10 hover:text-(--lk-fg)">
      <Link href={classPage}>
        <ArrowLeftIcon /> Open the class page
      </Link>
    </Button>
  );
  if (session.state === 'live') {
    return detail.join ? (
      <LiveRoom
        sessionId={session.id}
        serverUrl={detail.join.serverUrl}
        token={detail.join.token}
        trackFocus={detail.view === 'student'}
        classPage={classPage}
      />
    ) : (
      <RoomNotice
        title="You follow this class from its page"
        text="Its teachers, its students and administrators join the room; heads of department see the class and its attendance from the class page."
      >
        {back}
      </RoomNotice>
    );
  }
  if (session.state === 'upcoming') {
    const now = new Date();
    const when = `${istDayKey(session.scheduledStart) === istDayKey(now) ? 'today' : `on ${formatDay(session.scheduledStart)}`} at ${formatTime(session.scheduledStart)}`;
    const soon = session.scheduledStart.getTime() - now.getTime() < 60 * MINUTE_MS;
    if (!detail.canManage) {
      return (
        <RoomNotice
          title={`The class starts ${when}`}
          text={
            soon
              ? 'Your teacher opens it. Keep this tab open: it updates by itself and the class appears here when it starts.'
              : 'Come back a little before the start. You will also get a notification when the class starts.'
          }
        >
          {soon && <AutoRefresh seconds={20} />}
        </RoomNotice>
      );
    }
    const canStart = now >= detail.canStartAt;
    return (
      <RoomNotice
        title={canStart ? 'Ready to start' : `You can start the class from ${formatTime(detail.canStartAt)}`}
        text={`It is set for ${when}. Your students are told the moment you start.`}
      >
        {canStart ? (
          // A white (outline) button with dark text, so it stands out on the dark stage.
          <div className="text-foreground">
            <ActionForm
              action={startSession}
              submitLabel="Start class"
              submitVariant="outline"
              submitIcon={<PlayIcon />}
            >
              {children}
            </ActionForm>
          </div>
        ) : (
          <AutoRefresh seconds={30} />
        )}
      </RoomNotice>
    );
  }
  const ended = {
    ended: { title: 'This class has ended', text: 'Close this tab, or open the class page to see how it went.' },
    cancelled: { title: 'This class was cancelled', text: 'It does not count towards anyone’s attendance.' },
    not_held: { title: 'This class was not held', text: 'It does not count towards anyone’s attendance.' },
  }[session.state];
  return (
    <RoomNotice title={ended.title} text={ended.text}>
      {back}
    </RoomNotice>
  );
}
