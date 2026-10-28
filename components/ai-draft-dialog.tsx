import type { ReactNode } from 'react';
import { InfoIcon } from '@phosphor-icons/react/ssr';
import { Field, FieldErrors } from '@/components/action-form';
import { FormDialog } from '@/components/form-dialog';
import { PageIcon } from '@/components/page-icon';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { ActionResult } from '@/lib/errors';
import { ITEM_LABEL } from '@/lib/format';
import { ASSESSMENT_LIMITS, DIFFICULTIES } from '@/lib/schemas/assessment';
import type { DRAFT_TYPES } from '@/lib/schemas/bank';

const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

// TP-10 (mock-up C2): "Create with AI" — a topic, how many, the type, the level and the course's outcomes, with what is
// sent. The bank keeps the drafts there; the builder adds them to its test. Either way each waits for a review.
export function AiDraftDialog({
  action,
  hidden,
  description,
  successMessage,
  types,
  max,
  cos,
  aiReady,
}: {
  action: (input: FormData) => Promise<ActionResult<unknown>>;
  hidden: ReactNode;
  description: string;
  successMessage: string;
  types: readonly (typeof DRAFT_TYPES)[number][];
  max: number;
  cos: readonly { id: string; code: string; statement: string }[];
  aiReady: boolean;
}) {
  return (
    <FormDialog
      openParam="ai"
      size="wide"
      icon={<PageIcon name="sparkle" className="size-8" />}
      title="Create questions with AI"
      description={description}
      action={action}
      submitLabel="Create the questions"
      successMessage={successMessage}
    >
      {hidden}
      {!aiReady && (
        <p className="bg-gold/10 rounded-md px-3 py-2 text-[0.8125rem]">
          <b className="font-semibold">AI suggestions are not set up.</b> An administrator adds the AI key to the
          server. Until then, write questions yourself or import a CSV.
        </p>
      )}
      <Field name="topic" label="Topic">
        <Input
          name="topic"
          required
          minLength={3}
          maxLength={ASSESSMENT_LIMITS.topic}
          placeholder="Pointers and dynamic memory in C"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="count" label="How many">
          <Input name="count" type="number" min={1} max={max} defaultValue={Math.min(10, max)} required />
        </Field>
        <Field name="type" label="Type">
          <NativeSelect name="type" defaultValue={types[0]}>
            {types.map((type) => (
              <NativeSelectOption key={type} value={type}>
                {ITEM_LABEL[type]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field name="level" label="Level">
          <NativeSelect name="level" defaultValue="mixed">
            <NativeSelectOption value="mixed">Mixed (30/45/25)</NativeSelectOption>
            {DIFFICULTIES.map((level) => (
              <NativeSelectOption key={level} value={level}>
                {cap(level)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      {cos.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Course outcomes</legend>
          <div className="ring-border grid gap-2.5 rounded-md p-3 ring-1">
            {cos.map((co) => (
              <label key={co.id} className="flex items-start gap-2.5 text-[0.8125rem]">
                <input
                  type="checkbox"
                  name="coIds[]"
                  value={co.id}
                  className="accent-foreground mt-0.5 size-4 shrink-0"
                />
                <span>
                  <b className="font-semibold">{co.code}</b> {co.statement}
                </span>
              </label>
            ))}
          </div>
          <FieldErrors name="coIds[]" />
        </fieldset>
      )}
      <p className="text-muted-foreground bg-muted/60 flex gap-2 rounded-md px-3 py-2 text-xs">
        <InfoIcon className="size-4 shrink-0" />
        Only the topic, the outcomes you pick and the level are sent. No student data leaves the LMS.
      </p>
    </FormDialog>
  );
}
