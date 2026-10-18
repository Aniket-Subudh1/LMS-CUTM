import {
  BookOpenIcon,
  CodeIcon,
  ExamIcon,
  FlaskIcon,
  InfoIcon,
  ListChecksIcon,
  NotebookIcon,
  PlusIcon,
  TestTubeIcon,
  TrophyIcon,
} from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import { createAssessment } from '@/app/(app)/courses/[offeringId]/assessments/actions';
import { createTest } from '@/app/(app)/tests/actions';
import { Field, FieldErrors } from '@/components/action-form';
import { FormDialog } from '@/components/form-dialog';
import { Input } from '@/components/ui/input';
import { istDayKey, istTimeOfDay } from '@/lib/domain/time';
import { MODE_LABEL } from '@/lib/format';
import { ASSESSMENT_MODES, type AssessmentMode } from '@/lib/schemas/assessment';

export const MODE_ICON: Record<AssessmentMode, Icon> = {
  quiz: ListChecksIcon,
  written_test: ExamIcon,
  assignment: NotebookIcon,
  learning_record: BookOpenIcon,
  lab_record: FlaskIcon,
  coding_test: CodeIcon,
  lab_test: TestTubeIcon,
  coding_competition: TrophyIcon,
};

const MODE_HINT: Record<AssessmentMode, string> = {
  quiz: 'Short and timed. Marked automatically. Up to 3 attempts.',
  written_test: 'Timed, one attempt. Typed or uploaded answers you mark.',
  assignment: 'Untimed. Students type or upload by a deadline.',
  learning_record: 'A theory course’s record, for a period or the whole year.',
  lab_record: 'One per experiment in a practice course.',
  coding_test: 'Timed. Programs run on your tests, with other questions beside them.',
  lab_test: 'A practical exam: programs, questions and uploads, timed.',
  coding_competition: 'Programs only, ranked by the tests they pass.',
};

// What datetime-local shows for a time: its IST wall clock (06 §2).
export const istLocal = (date: Date) => `${istDayKey(date)}T${istTimeOfDay(date)}`;

// M04 decision 2 (A-M04-6): the type, a title and the window; the builder changes the rest. Opened from the URL
// (`?new=<mode>`) on the Assessments and Records tabs, with that type chosen; without a course, on Tests (M04b, TP-02).
export function NewAssessmentDialog({ offeringId, mode }: { offeringId: string | null; mode: AssessmentMode }) {
  // The next whole hour, and an hour later for a timed one or a week later for work done at home.
  const opens = new Date(Math.ceil(new Date().getTime() / 3_600_000) * 3_600_000);
  const closes = new Date(opens.getTime() + (mode === 'quiz' || mode === 'written_test' ? 3_600_000 : 7 * 86_400_000));
  return (
    <FormDialog
      openParam={mode}
      size="wide"
      icon={<PlusIcon weight="duotone" />}
      title={offeringId ? 'New assessment' : 'New test'}
      description="Pick the kind of work. You add the questions in the next step."
      action={offeringId ? createAssessment : createTest}
      submitLabel="Create and add questions"
      successMessage="Created. Opening the builder…"
    >
      {offeringId && <input type="hidden" name="offeringId" value={offeringId} />}
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Type</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ASSESSMENT_MODES.map((value) => {
            const ModeIcon = MODE_ICON[value];
            return (
              <label
                key={value}
                className="ring-border has-checked:ring-foreground has-checked:bg-muted/40 has-focus-visible:ring-ring flex cursor-pointer items-start gap-3 rounded-md p-3 ring-1 transition-colors has-checked:ring-2"
              >
                <input type="radio" name="mode" value={value} defaultChecked={value === mode} className="sr-only" />
                <span className="icon-chip size-8">
                  <ModeIcon className="size-4" />
                </span>
                <span className="grid gap-0.5">
                  <span className="text-[0.8125rem] font-semibold">{MODE_LABEL[value]}</span>
                  <span className="text-muted-foreground text-xs leading-relaxed">{MODE_HINT[value]}</span>
                </span>
              </label>
            );
          })}
        </div>
        <FieldErrors name="mode" />
      </fieldset>
      <Field name="title" label="Title">
        <Input name="title" required minLength={3} maxLength={160} placeholder="Quiz 2 · Arrays" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="opensAt" label="Opens">
          <Input name="opensAt" type="datetime-local" required defaultValue={istLocal(opens)} />
        </Field>
        <Field name="closesAt" label="Closes">
          <Input name="closesAt" type="datetime-local" required defaultValue={istLocal(closes)} />
        </Field>
      </div>
      <p className="text-muted-foreground bg-muted/60 flex gap-2 rounded-md px-3 py-2 text-xs leading-relaxed">
        <InfoIcon className="size-4 shrink-0" />
        The time limit, attempts and shuffling start from the type’s usual settings (a quiz: 30 minutes, one attempt,
        shuffled). Change them in the next step. Times are Indian Standard Time.
      </p>
    </FormDialog>
  );
}
