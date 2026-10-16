import type { ReactNode } from 'react';
import { CalendarPlusIcon, ChalkboardTeacherIcon, HourglassIcon, PencilSimpleIcon } from '@phosphor-icons/react/ssr';
import { scheduleSession, updateSession } from './actions';
import { Field, FieldErrors } from '@/components/action-form';
import { FormDialog } from '@/components/form-dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { formatDuration, formatPct } from '@/lib/format';
import { LENGTHS_MIN, type AttendanceMode } from '@/lib/schemas/live';

export type SessionValues = {
  id: string;
  title: string;
  day: string;
  startTime: string;
  lengthMin: number;
  attendanceMode: AttendanceMode;
};

// "Schedule a class" on the Live tab and "Edit" on a class (A-68): a date, a start time and a length, with the title
// and date taken from the course calendar when there is a next session.
export function SessionDialog({
  offeringId,
  category,
  thresholdPct,
  session,
  next,
  trigger,
}: {
  offeringId: string;
  category: 'ugc' | 'skill';
  thresholdPct: number;
  session?: SessionValues;
  next?: { title: string; day: string } | null;
  trigger: ReactNode;
}) {
  const mode = session?.attendanceMode ?? 'manual';
  const modes = [
    {
      value: 'manual',
      label: 'I take attendance in class',
      hint: 'Students who join are ticked present; you correct the list and save.',
      icon: ChalkboardTeacherIcon,
    },
    {
      value: 'derived',
      label: 'Automatic',
      hint: `Present after ${formatPct(thresholdPct)} of the class in the room.`,
      icon: HourglassIcon,
    },
  ] as const;
  return (
    <FormDialog
      trigger={trigger}
      icon={session ? <PencilSimpleIcon weight="duotone" /> : <CalendarPlusIcon weight="duotone" />}
      title={session ? 'Change this class' : 'Schedule a live class'}
      description={
        session
          ? 'Students are told about a new title or time.'
          : 'Students are told straight away. You can start the class 15 minutes early.'
      }
      action={session ? updateSession : scheduleSession}
      submitLabel={session ? 'Save changes' : 'Schedule class'}
      successMessage={session ? 'Class updated.' : 'Class scheduled. Your students have been told.'}
    >
      <input type="hidden" name="offeringId" value={offeringId} />
      {session && <input type="hidden" name="sessionId" value={session.id} />}
      <Field
        name="title"
        label="What is the class about?"
        hint={next && !session ? 'From your course calendar.' : undefined}
      >
        <Input name="title" required maxLength={160} defaultValue={session?.title ?? next?.title} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field name="date" label="Date">
          <Input name="date" type="date" required defaultValue={session?.day ?? next?.day} />
        </Field>
        <Field name="startTime" label="Starts at">
          <Input name="startTime" type="time" required defaultValue={session?.startTime ?? '10:00'} />
        </Field>
        <Field name="lengthMin" label="Length">
          <NativeSelect name="lengthMin" defaultValue={String(session?.lengthMin ?? 60)}>
            {LENGTHS_MIN.map((minutes) => (
              <NativeSelectOption key={minutes} value={minutes}>
                {formatDuration(minutes * 60)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      {category === 'skill' ? (
        <>
          <input type="hidden" name="attendanceMode" value="derived" />
          <p className="text-muted-foreground text-sm">
            Attendance on a skill course is automatic: present after {formatPct(thresholdPct)} of the class in the room.
          </p>
        </>
      ) : (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Attendance</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {modes.map(({ value, label, hint, icon: Icon }) => (
              <label
                key={value}
                className="ring-border has-checked:ring-primary has-checked:bg-primary/4 has-focus-visible:ring-ring flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ring-1 transition-colors has-checked:ring-2"
              >
                <input
                  type="radio"
                  name="attendanceMode"
                  value={value}
                  defaultChecked={value === mode}
                  className="sr-only"
                />
                <Icon weight="duotone" className="text-primary size-6 shrink-0" />
                <span className="grid">
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-muted-foreground text-xs">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          <FieldErrors name="attendanceMode" />
        </fieldset>
      )}
      <p className="text-muted-foreground text-xs">
        A class still open 30 minutes after its end time is ended for you.
      </p>
    </FormDialog>
  );
}
