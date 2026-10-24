import type { ReactNode } from 'react';
import { saveMeeting } from '@/app/(app)/meetings/actions';
import { Field, FieldErrors } from '@/components/action-form';
import { FormDialog } from '@/components/form-dialog';
import { PageIcon } from '@/components/page-icon';
import { PeoplePicker } from '@/components/people-picker';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { MeetingDetail } from '@/lib/data/meetings';
import { istDayKey, istTimeOfDay } from '@/lib/domain/time';
import { MEETING_LIMITS } from '@/lib/schemas/live';

// M03c T4, mock-up R2-A: "New meeting" on the Meetings page (`?new=meeting`) and "Edit" on a meeting's page. Everyone
// invited gets an email with the link and a calendar file; people from the LMS also get a notification.
export function MeetingDialog({ meeting, trigger }: { meeting?: MeetingDetail; trigger?: ReactNode }) {
  const start = meeting?.session.scheduledStart;
  const end = meeting?.session.scheduledEnd;
  return (
    <FormDialog
      trigger={trigger}
      openParam={meeting ? undefined : 'meeting'}
      size="wide"
      icon={<PageIcon name="live" className="size-8" />}
      title={meeting ? 'Change this meeting' : 'New meeting'}
      description={
        meeting
          ? 'A new time or title is sent to everyone again; people you add are invited, people you take off are told.'
          : 'Everyone invited gets an email with the link and a calendar file.'
      }
      action={saveMeeting}
      submitLabel={meeting ? 'Save and tell everyone' : 'Schedule and send invitations'}
      successMessage={meeting ? 'Meeting changed.' : 'Meeting scheduled. The invitations are on their way.'}
    >
      {meeting && <input type="hidden" name="meetingId" value={meeting.id} />}
      <Field name="title" label="Title">
        <Input name="title" required maxLength={160} defaultValue={meeting?.session.title} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field name="date" label="Date">
          <Input name="date" type="date" required defaultValue={start ? istDayKey(start) : undefined} />
        </Field>
        <Field name="startTime" label="Starts">
          <Input name="startTime" type="time" required defaultValue={start ? istTimeOfDay(start) : '16:00'} />
        </Field>
        <Field name="endTime" label="Ends">
          <Input name="endTime" type="time" required defaultValue={end ? istTimeOfDay(end) : '17:00'} />
        </Field>
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium">Co-hosts</span>
        <PeoplePicker
          name="coHost[]"
          initial={meeting?.coHosts ?? []}
          max={MEETING_LIMITS.coHosts}
          staffOnly
          placeholder="Add a co-host"
        />
        <p className="text-muted-foreground text-xs">Hosts let guests in, mute, remove and record. Staff only.</p>
        <FieldErrors name="coHost[]" />
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium">People from the LMS</span>
        <PeoplePicker
          name="member[]"
          initial={meeting?.members ?? []}
          max={MEETING_LIMITS.members}
          placeholder="Search by name, roll number or email"
        />
        <p className="text-muted-foreground text-xs">
          Staff, and the students you teach or oversee. Up to {MEETING_LIMITS.members}.
        </p>
        <FieldErrors name="member[]" />
      </div>
      <Field
        name="guests"
        label="Guests by email"
        hint={`One a line, up to ${MEETING_LIMITS.guests}. Each gets their own link and waits in a lobby until a host lets them in.`}
      >
        <Textarea
          name="guests"
          rows={3}
          defaultValue={meeting?.guests?.map((g) => g.email).join('\n')}
          placeholder="name@example.com"
        />
      </Field>
    </FormDialog>
  );
}
