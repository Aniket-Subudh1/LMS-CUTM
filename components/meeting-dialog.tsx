import type { ReactNode } from 'react';
import { saveMeeting } from '@/app/(app)/meetings/actions';
import { Field } from '@/components/action-form';
import { FormDialog } from '@/components/form-dialog';
import { PageIcon } from '@/components/page-icon';
import { MeetingPeople } from '@/components/meeting-people';
import { Input } from '@/components/ui/input';
import type { MeetingDetail } from '@/lib/data/meetings';
import { istDayKey, istTimeOfDay } from '@/lib/domain/time';

// M03c T4, mock-up R2-A: "New meeting" on the Meetings page (`?new=meeting`) and "Edit" on a meeting's page. Everyone
// invited gets an email with their own link, the passcode (T14) and a calendar file; people from the LMS also get a
// notification.
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
          : 'Everyone invited gets an email with their own link, the passcode and a calendar file.'
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
      <MeetingPeople
        owner={meeting?.owner ?? null}
        initial={{
          coHosts: meeting?.coHosts ?? [],
          members: meeting?.members ?? [],
          guests: meeting?.guests?.map((g) => g.email) ?? [],
        }}
      />
    </FormDialog>
  );
}
