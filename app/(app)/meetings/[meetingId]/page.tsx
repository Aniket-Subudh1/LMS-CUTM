import { Suspense } from 'react';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ArrowSquareOutIcon, PaperPlaneTiltIcon, PencilSimpleIcon, XIcon } from '@phosphor-icons/react/ssr';
import Loading from '../../loading';
import { cancelMeeting, resendInvitation } from '../actions';
import { ActionForm } from '@/components/action-form';
import { CopyButton } from '@/components/copy-button';
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

const GUEST: Record<GuestState, { label: string; variant: 'outline' | 'success' | 'danger' }> = {
  invited: { label: 'Invited', variant: 'outline' },
  joined: { label: 'Joined', variant: 'success' },
  removed: { label: 'Removed', variant: 'danger' },
};

const STATE = {
  upcoming: 'Upcoming',
  live: 'Live now',
  ended: 'Held',
  cancelled: 'Cancelled',
  not_held: 'Not held',
} as const;

function People({ people, empty, share }: { people: Person[]; empty: string; share: (id: string) => ReactNode }) {
  if (people.length === 0) return <p className="text-muted-foreground text-sm">{empty}</p>;
  return (
    <ul className="divide-border/70 grid divide-y">
      {people.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[0.8125rem]">
          <span className="grid min-w-0">
            <span className="truncate font-medium">{p.name}</span>
            <span className="text-muted-foreground truncate text-xs">{p.detail}</span>
          </span>
          {share(p.id)}
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
  const { invitation } = meeting;
  const going = session.state === 'upcoming' || session.state === 'live';
  // T14: for hosts while it is ahead or running, each person's own link to copy, and their invitation to send again.
  const share = (id: string) => {
    const link = invitation?.links[id];
    if (!link || !going) return null;
    return (
      <span className="flex shrink-0 items-start gap-2">
        <CopyButton value={link} label="Copy link" />
        <ActionForm
          action={resendInvitation}
          submitLabel="Send again"
          submitVariant="outline"
          submitSize="sm"
          submitIcon={<PaperPlaneTiltIcon />}
          successMessage="Sent."
        >
          <input type="hidden" name="meetingId" value={meetingId} />
          <input type="hidden" name="personId" value={id} />
        </ActionForm>
      </span>
    );
  };
  return (
    <div className="grid gap-5">
      <PageHeader
        icon={<PageIcon name="meetings" />}
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
                  message:
                    session.state === 'live'
                      ? 'Everyone in it leaves now. Everyone invited is told, and the meeting leaves their calendars.'
                      : 'Everyone invited is told, and the meeting leaves their calendars.',
                }}
              >
                <input type="hidden" name="meetingId" value={meetingId} />
              </ActionForm>
            )}
          </>
        }
      />
      {invitation && going && (
        <Section
          icon={<PageIcon name="envelope" className="size-8" />}
          title="How people join"
          description={
            invitation.passcode
              ? 'Each invitation holds the person’s own link and this passcode. Signed in to the LMS, the link opens the meeting at once; otherwise it asks for the passcode. If an invitation did not arrive, copy that person’s link below or send it again.'
              : 'Each invitation holds the person’s own link. If one did not arrive, copy that person’s link below or send it again.'
          }
          action={invitation.passcode ? <CopyButton value={invitation.passcode} label="Copy passcode" /> : undefined}
        >
          {invitation.passcode && (
            <p className="text-sm">
              Passcode <b className="ml-1 font-mono text-lg font-semibold tracking-[0.2em]">{invitation.passcode}</b>
            </p>
          )}
        </Section>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Section
          icon={<PageIcon name="people" className="size-8" />}
          title="Hosts"
          description="They run the meeting: mute, remove and record. Hosting needs signing in."
        >
          <People people={[meeting.owner, ...meeting.coHosts]} empty="" share={share} />
        </Section>
        <Section
          icon={<PageIcon name="users" className="size-8" />}
          title="People from the LMS"
          description="They join from their own link, signed in or with the passcode."
        >
          <People people={meeting.members} empty="Nobody else from the LMS is invited." share={share} />
        </Section>
      </div>
      <RecordingList recordings={meeting.recordings} noun="meeting" />
      {meeting.guests && (
        <Section
          icon={<PageIcon name="guests" className="size-8" />}
          title="Guests"
          description="Each joins from their own link with the passcode; no account is needed."
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
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant={GUEST[g.state].variant}>{GUEST[g.state].label}</Badge>
                    {share(g.id)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}
