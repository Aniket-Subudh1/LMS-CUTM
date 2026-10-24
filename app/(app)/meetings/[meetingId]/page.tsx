import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ArrowSquareOutIcon, PencilSimpleIcon, XIcon } from '@phosphor-icons/react/ssr';
import Loading from '../../loading';
import { cancelMeeting } from '../actions';
import { ActionForm } from '@/components/action-form';
import { MeetingDialog } from '@/components/meeting-dialog';
import { PageHeader } from '@/components/page-header';
import { PageIcon } from '@/components/page-icon';
import { RecordingList } from '@/components/recording-list';
import { Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getMeeting, type GuestState, type Person } from '@/lib/data/meetings';
import { formatDay, formatTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Meeting' };

export default function MeetingPage({ params }: PageProps<'/meetings/[meetingId]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Meeting params={params} />
    </Suspense>
  );
}

const GUEST: Record<GuestState, { label: string; variant: 'outline' | 'success' | 'warning' | 'danger' }> = {
  invited: { label: 'Invited', variant: 'outline' },
  waiting: { label: 'Waiting to join', variant: 'warning' },
  admitted: { label: 'Let in', variant: 'success' },
  denied: { label: 'Turned away', variant: 'danger' },
  removed: { label: 'Removed', variant: 'danger' },
};

const STATE = {
  upcoming: 'Upcoming',
  live: 'Live now',
  ended: 'Held',
  cancelled: 'Cancelled',
  not_held: 'Not held',
} as const;

function People({ people, empty }: { people: Person[]; empty: string }) {
  if (people.length === 0) return <p className="text-muted-foreground text-sm">{empty}</p>;
  return (
    <ul className="divide-border/70 grid divide-y">
      {people.map((p) => (
        <li key={p.id} className="grid py-2 text-[0.8125rem]">
          <span className="font-medium">{p.name}</span>
          <span className="text-muted-foreground text-xs">{p.detail}</span>
        </li>
      ))}
    </ul>
  );
}

// M03c T4: one meeting — when, who, and for its hosts the guests and where each stands; the room opens in a new tab.
async function Meeting({ params }: { params: PageProps<'/meetings/[meetingId]'>['params'] }) {
  const { meetingId } = await params;
  const meeting = await getMeeting(meetingId);
  const { session } = meeting;
  const host = meeting.role === 'host';
  const open = session.state === 'live' || (session.state === 'upcoming' && host);
  return (
    <div className="grid gap-5">
      <PageHeader
        icon={<PageIcon name="live" />}
        title={session.title}
        description={`${formatDay(session.scheduledStart)}, ${formatTime(session.scheduledStart)}–${formatTime(session.scheduledEnd)} · ${STATE[session.state]}`}
        actions={
          <>
            {open && (
              <Button asChild>
                <a href={`/meetings/${meetingId}/room`} target="_blank" rel="noopener">
                  <ArrowSquareOutIcon /> {session.state === 'live' ? 'Join' : 'Open the room'}
                </a>
              </Button>
            )}
            {meeting.canEdit && (
              <MeetingDialog
                meeting={meeting}
                trigger={
                  <Button variant="outline">
                    <PencilSimpleIcon /> Edit
                  </Button>
                }
              />
            )}
            {meeting.canEdit && (
              <ActionForm
                action={cancelMeeting}
                submitLabel="Cancel the meeting"
                submitVariant="outline"
                submitIcon={<XIcon />}
                confirm={{
                  title: 'Cancel this meeting?',
                  message: 'Everyone invited is told, and the meeting leaves their calendars.',
                }}
              >
                <input type="hidden" name="meetingId" value={meetingId} />
              </ActionForm>
            )}
          </>
        }
      />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Section icon={<PageIcon name="people" className="size-8" />} title="Hosts" description="They let guests in.">
          <People people={[meeting.owner, ...meeting.coHosts]} empty="" />
        </Section>
        <Section
          icon={<PageIcon name="users" className="size-8" />}
          title="People from the LMS"
          description="They join after signing in."
        >
          <People people={meeting.members} empty="Nobody else from the LMS is invited." />
        </Section>
      </div>
      <RecordingList recordings={meeting.recordings} noun="meeting" />
      {meeting.guests && (
        <Section
          icon={<PageIcon name="envelope" className="size-8" />}
          title="Guests"
          description="Each has their own link and waits in a lobby until a host lets them in."
        >
          {meeting.guests.length === 0 ? (
            <p className="text-muted-foreground text-sm">No guests are invited.</p>
          ) : (
            <ul className="divide-border/70 grid divide-y">
              {meeting.guests.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[0.8125rem]">
                  <span className="grid min-w-0">
                    <span className="truncate font-medium">{g.name ?? g.email}</span>
                    {g.name && <span className="text-muted-foreground truncate text-xs">{g.email}</span>}
                  </span>
                  <Badge variant={GUEST[g.state].variant}>{GUEST[g.state].label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}
