import type { ReactNode } from 'react';
import {
  ArrowsLeftRightIcon,
  CheckSquareIcon,
  CodeIcon,
  FileArrowUpIcon,
  HashIcon,
  ListNumbersIcon,
  RadioButtonIcon,
  TextAaIcon,
  TextboxIcon,
  ToggleRightIcon,
} from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import { Field, FieldErrors } from '@/components/action-form';
import { FormDialog } from '@/components/form-dialog';
import { RichTextEditor } from '@/components/rich-text-editor';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/errors';
import type { TeacherItem } from '@/lib/data/assessments';
import {
  ASSESSMENT_LIMITS,
  DIFFICULTIES,
  OBJECTIVE_TYPES,
  PARTIAL_TYPES,
  type ItemType,
} from '@/lib/schemas/assessment';
import { BLOOM_LEVELS } from '@/lib/schemas/structure';

export const TYPE_ICON: Record<ItemType, Icon> = {
  mcq: RadioButtonIcon,
  msq: CheckSquareIcon,
  true_false: ToggleRightIcon,
  numeric: HashIcon,
  fill_blank: TextboxIcon,
  matching: ArrowsLeftRightIcon,
  ordering: ListNumbersIcon,
  text: TextAaIcon,
  file: FileArrowUpIcon,
  code: CodeIcon,
};

const TYPE_HINT: Record<ItemType, string> = {
  mcq: 'One correct option. Marked automatically.',
  msq: 'Every correct option must be ticked. Marked automatically; part marks if you allow them.',
  true_false: 'A statement that is true or false. Marked automatically.',
  numeric: 'A number, with an allowed margin. Marked automatically.',
  fill_blank: 'A sentence with blanks; each blank accepts the answers you list. Marked automatically.',
  matching: 'Pairs to match; the right sides are shuffled. Marked automatically.',
  ordering: 'Steps to put in order; they are shuffled. Marked automatically.',
  text: 'A typed answer you mark, by a rubric if you give one.',
  file: 'Photos or a PDF of written work, marked by you.',
  code: 'A program run on your tests: students see the visible ones, every one counts after hand-in.',
};

const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

// TP-05, TP-06: one question's dialog — for an assessment (builder) and for a question bank. `hidden` carries where
// it is saved; `cos` is null where course outcomes do not apply (a standalone test, a personal bank); `sections` lets
// an assessment's question move between its sections; `languages` are those a code question may offer (TP-09).
export function QuestionDialog({
  openParam,
  title,
  type,
  item,
  action,
  hidden,
  cos,
  credit,
  sections,
  languages,
}: {
  openParam: string;
  title: string;
  type: ItemType;
  item: TeacherItem | undefined;
  action: (input: FormData) => Promise<ActionResult<unknown>>;
  hidden: ReactNode;
  cos: { id: string; code: string; statement: string }[] | null;
  credit: boolean;
  sections: { id: string; title: string }[];
  languages: { key: string; label: string }[];
}) {
  const TypeIcon = TYPE_ICON[type];
  const options = item?.options ?? [];
  const correct = new Set(item?.key && 'optionIds' in item.key ? item.key.optionIds : []);
  const rubric = item?.rubric ?? [];
  const blanks = item?.blanks ?? [];
  const pairs = item?.pairs ?? [];
  const objective = OBJECTIVE_TYPES.some((t) => t === type);
  // An ordering question is edited in its right order (the key), whatever order a paper showed.
  const steps =
    type === 'ordering' && item?.key && 'optionIds' in item.key
      ? item.key.optionIds.flatMap((id) => options.find((o) => o.id === id) ?? [])
      : options;
  const more = (shown: number, max: number, noun: string, row: (i: number) => ReactNode) =>
    shown < max && (
      <details>
        <summary className="text-primary cursor-pointer text-xs font-medium">
          Up to {max - shown} more {noun}
        </summary>
        <div className="mt-2 grid gap-2">{Array.from({ length: max - shown }, (_, i) => row(shown + i))}</div>
      </details>
    );
  const optionRow = (row: number) => (
    <div key={row} className="flex items-center gap-3">
      <input
        type={type === 'mcq' ? 'radio' : 'checkbox'}
        name={type === 'mcq' ? 'correct' : 'correct[]'}
        value={row}
        defaultChecked={options[row] ? correct.has(options[row].id) : false}
        aria-label={`Option ${row + 1} is correct`}
        className="accent-foreground size-4 shrink-0"
      />
      <Input
        name="option[]"
        defaultValue={options[row]?.text ?? ''}
        maxLength={ASSESSMENT_LIMITS.optionText}
        placeholder={`Option ${row + 1}`}
      />
    </div>
  );
  const stepRow = (row: number) => (
    <div key={row} className="flex items-center gap-3">
      <span className="bg-muted grid size-6 shrink-0 place-items-center rounded-sm text-xs font-semibold">
        {row + 1}
      </span>
      <Input
        name="option[]"
        defaultValue={steps[row]?.text ?? ''}
        maxLength={ASSESSMENT_LIMITS.optionText}
        placeholder={`Step ${row + 1}`}
        aria-label={`Step ${row + 1}`}
      />
    </div>
  );
  const pairRow = (row: number) => (
    <div key={row} className="grid grid-cols-2 gap-3">
      <Input
        name="left[]"
        defaultValue={pairs[row]?.left ?? ''}
        maxLength={ASSESSMENT_LIMITS.pairText}
        placeholder="Left side"
        aria-label={`Pair ${row + 1}, left`}
      />
      <Input
        name="right[]"
        defaultValue={pairs[row]?.right ?? ''}
        maxLength={ASSESSMENT_LIMITS.pairText}
        placeholder="Its match"
        aria-label={`Pair ${row + 1}, right`}
      />
    </div>
  );
  const blankRow = (row: number) => (
    <Field key={row} name={`accepted-${row}`} label={`Blank ${row + 1} accepts`}>
      <Input
        name="accepted[]"
        defaultValue={blanks[row]?.join(' | ') ?? ''}
        placeholder="recursive | recursion"
        aria-label={`Answers blank ${row + 1} accepts`}
      />
    </Field>
  );
  const tests = item?.tests ?? [];
  const testRow = (row: number) => (
    <div key={row} className="grid gap-2 sm:grid-cols-[1fr_1fr_4.5rem_5.5rem] sm:items-start">
      <Textarea
        name="caseInput[]"
        rows={2}
        defaultValue={tests[row]?.input ?? ''}
        maxLength={ASSESSMENT_LIMITS.caseText}
        spellCheck={false}
        placeholder={`Input ${row + 1}`}
        aria-label={`Test ${row + 1} input`}
        className="min-h-0 font-mono text-xs"
      />
      <Textarea
        name="caseExpected[]"
        rows={2}
        defaultValue={tests[row]?.expected ?? ''}
        maxLength={ASSESSMENT_LIMITS.caseText}
        spellCheck={false}
        placeholder={`Expected output ${row + 1}`}
        aria-label={`Test ${row + 1} expected output`}
        className="min-h-0 font-mono text-xs"
      />
      <Input
        name="caseWeight[]"
        type="number"
        min={1}
        max={10}
        defaultValue={tests[row]?.weight ?? 1}
        aria-label={`Test ${row + 1} weight`}
      />
      <label className="flex items-center gap-2 text-[0.8125rem] sm:pt-2">
        <input
          type="checkbox"
          name="caseHidden[]"
          value={row}
          defaultChecked={tests[row]?.hidden ?? row > 0}
          className="accent-foreground size-4"
        />
        Hidden
      </label>
    </div>
  );
  const criterionRow = (row: number) => (
    <div key={row} className="grid grid-cols-[1fr_6rem] gap-3">
      <Input
        name="criterion[]"
        defaultValue={rubric[row]?.criterion ?? ''}
        maxLength={ASSESSMENT_LIMITS.criterion}
        placeholder="Criterion"
        aria-label={`Criterion ${row + 1}`}
      />
      <Input
        name="criterionMarks[]"
        type="number"
        min={0.01}
        step={0.01}
        defaultValue={rubric[row]?.maxMarks ?? ''}
        aria-label={`Marks for criterion ${row + 1}`}
      />
    </div>
  );
  return (
    <FormDialog
      openParam={openParam}
      size="wide"
      icon={<TypeIcon weight="duotone" />}
      title={title}
      description={TYPE_HINT[type]}
      action={action}
      submitLabel="Save question"
      successMessage="Question saved."
    >
      {hidden}
      <input type="hidden" name="type" value={type} />
      <div className="grid gap-2">
        <span className="text-sm font-medium">Question</span>
        <RichTextEditor name="prompt" initial={item?.prompt} placeholder="Write the question…" />
        <FieldErrors name="prompt" />
      </div>
      <div className="grid gap-5 sm:grid-cols-4">
        <Field name="maxMarks" label="Marks">
          <Input
            name="maxMarks"
            type="number"
            required
            min={0.01}
            max={1000}
            step={0.01}
            defaultValue={item?.maxMarks ?? ''}
          />
        </Field>
        <Field name="difficulty" label="Difficulty">
          <NativeSelect name="difficulty" defaultValue={item?.difficulty ?? ''}>
            <NativeSelectOption value="">Not set</NativeSelectOption>
            {DIFFICULTIES.map((level) => (
              <NativeSelectOption key={level} value={level}>
                {cap(level)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field name="bloomLevel" label="Thinking level (Bloom)">
          <NativeSelect name="bloomLevel" defaultValue={item?.bloomLevel ?? ''}>
            <NativeSelectOption value="">Not set</NativeSelectOption>
            {BLOOM_LEVELS.map((level) => (
              <NativeSelectOption key={level} value={level}>
                {cap(level)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field name="topic" label="Topic">
          <Input
            name="topic"
            defaultValue={item?.topic ?? ''}
            maxLength={ASSESSMENT_LIMITS.topic}
            placeholder="arrays"
          />
        </Field>
      </div>
      {sections.length > 0 && (
        <Field name="sectionId" label="Section">
          <NativeSelect name="sectionId" defaultValue={item?.sectionId ?? sections[0].id}>
            {sections.map((section) => (
              <NativeSelectOption key={section.id} value={section.id}>
                {section.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
      {cos && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Course outcomes</legend>
          {cos.length === 0 ? (
            <p className="text-muted-foreground text-[0.8125rem]">
              This course has no outcomes yet. The course coordinator adds them on the Outcomes tab.
            </p>
          ) : (
            <div className="ring-border grid gap-2.5 rounded-md p-3 ring-1">
              {cos.map((co) => (
                <label key={co.id} className="flex items-start gap-2.5 text-[0.8125rem]">
                  <input
                    type="checkbox"
                    name="cos[]"
                    value={co.id}
                    defaultChecked={item?.coIds.includes(co.id) ?? false}
                    className="accent-foreground mt-0.5 size-4 shrink-0"
                  />
                  <span>
                    <b className="font-semibold">{co.code}</b> {co.statement}
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="text-muted-foreground text-xs leading-relaxed">
            {credit
              ? 'Every question of a credit course is tagged with at least one outcome; it feeds attainment.'
              : 'Optional here; tagged questions can be drawn by outcome.'}
          </p>
          <FieldErrors name="cos[]" />
        </fieldset>
      )}

      {(type === 'mcq' || type === 'msq') && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">
            {type === 'mcq' ? 'Options · pick the correct one' : 'Options · tick every correct one'}
          </legend>
          {Array.from({ length: Math.max(4, options.length) }, (_, row) => optionRow(row))}
          {more(Math.max(4, options.length), ASSESSMENT_LIMITS.options, 'options', optionRow)}
          <p className="text-muted-foreground text-xs">Leave a row empty to skip it.</p>
          <FieldErrors name="option[]" />
          <FieldErrors name="correct" />
        </fieldset>
      )}

      {type === 'true_false' && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">The statement is</legend>
          <div className="flex gap-5 text-[0.8125rem]">
            {(['true', 'false'] as const).map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="truth"
                  value={value}
                  required
                  defaultChecked={item?.key && 'truth' in item.key ? String(item.key.truth) === value : false}
                  className="accent-foreground size-4"
                />
                {cap(value)}
              </label>
            ))}
          </div>
          <FieldErrors name="truth" />
        </fieldset>
      )}

      {type === 'numeric' && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="value" label="Correct answer">
            <Input
              name="value"
              type="number"
              step="any"
              required
              defaultValue={item?.key && 'value' in item.key ? item.key.value : ''}
            />
          </Field>
          <Field name="tolerance" label="Allowed margin (±)" hint="0 means the exact value only.">
            <Input
              name="tolerance"
              type="number"
              step="any"
              min={0}
              defaultValue={item?.key && 'tolerance' in item.key ? item.key.tolerance : 0}
            />
          </Field>
        </div>
      )}

      {type === 'fill_blank' && (
        <div className="grid gap-4">
          <Field
            name="template"
            label="The sentence"
            hint="Write ___ (three underscores) where each blank goes. Up to 10 blanks."
          >
            <Textarea
              name="template"
              rows={3}
              required
              maxLength={ASSESSMENT_LIMITS.template}
              defaultValue={item?.template ?? ''}
              placeholder="A function that calls itself is ___; the case that stops it is the ___ case."
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: Math.max(2, blanks.length) }, (_, row) => blankRow(row))}
          </div>
          {more(Math.max(2, blanks.length), ASSESSMENT_LIMITS.blanks, 'blanks', blankRow)}
          <p className="text-muted-foreground text-xs">
            Separate answers a blank accepts with |. Case and extra spaces do not matter.
          </p>
          <FieldErrors name="accepted[]" />
        </div>
      )}

      {type === 'matching' && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Pairs · each left side with its match</legend>
          {Array.from({ length: Math.max(4, pairs.length) }, (_, row) => pairRow(row))}
          {more(Math.max(4, pairs.length), ASSESSMENT_LIMITS.pairs, 'pairs', pairRow)}
          <FieldErrors name="left[]" />
        </fieldset>
      )}

      {type === 'ordering' && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Steps · in the right order</legend>
          {Array.from({ length: Math.max(4, steps.length) }, (_, row) => stepRow(row))}
          {more(Math.max(4, steps.length), ASSESSMENT_LIMITS.options, 'steps', stepRow)}
          <FieldErrors name="option[]" />
        </fieldset>
      )}

      {(type === 'text' || type === 'file') && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Rubric (optional)</legend>
          <div className="text-muted-foreground grid grid-cols-[1fr_6rem] gap-3 text-[0.6875rem] font-medium tracking-wide uppercase">
            <span>Criterion</span>
            <span>Marks</span>
          </div>
          {Array.from({ length: Math.max(3, rubric.length) }, (_, row) => criterionRow(row))}
          {more(Math.max(3, rubric.length), ASSESSMENT_LIMITS.criteria, 'criteria', criterionRow)}
          <p className="text-muted-foreground text-xs leading-relaxed">
            With a rubric you mark each criterion, and the question’s marks are their total, so they must add up to its
            marks.
          </p>
          <FieldErrors name="criterion[]" />
        </fieldset>
      )}

      {type === 'code' && (
        <>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Languages students may use</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {languages.map((language) => (
                <label key={language.key} className="flex items-center gap-2 text-[0.8125rem]">
                  <input
                    type="checkbox"
                    name="language[]"
                    value={language.key}
                    defaultChecked={item?.code ? item.code.languages.includes(language.key) : true}
                    className="accent-foreground size-4"
                  />
                  {language.label}
                </label>
              ))}
            </div>
            <FieldErrors name="language[]" />
          </fieldset>
          <details>
            <summary className="cursor-pointer text-sm font-medium">Starter code (optional)</summary>
            <div className="mt-2 grid gap-3">
              {languages.map((language) => (
                <Field key={language.key} name={`starter-${language.key}`} label={language.label}>
                  <input type="hidden" name="starterLanguage[]" value={language.key} />
                  <Textarea
                    name="starter[]"
                    rows={5}
                    defaultValue={item?.code?.starter.find((s) => s.language === language.key)?.source ?? ''}
                    maxLength={ASSESSMENT_LIMITS.starter}
                    spellCheck={false}
                    className="font-mono text-xs"
                  />
                </Field>
              ))}
              <p className="text-muted-foreground text-xs">What the editor starts with in each language.</p>
            </div>
          </details>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field name="timeLimitSec" label="Time for each test (seconds)">
              <Input name="timeLimitSec" type="number" min={1} max={10} defaultValue={item?.code?.timeLimitSec ?? 2} />
            </Field>
            <Field name="memoryMb" label="Memory (MB)">
              <Input
                name="memoryMb"
                type="number"
                min={64}
                max={512}
                defaultValue={item?.code ? Math.round(item.code.memoryKb / 1000) : 128}
              />
            </Field>
            <Field name="runLimit" label="Runs a student may make" hint="Of the visible tests, in one attempt.">
              <Input
                name="runLimit"
                type="number"
                min={1}
                max={ASSESSMENT_LIMITS.runLimit}
                defaultValue={item?.code?.runLimit ?? 10}
              />
            </Field>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Tests</legend>
            <div className="text-muted-foreground hidden gap-2 text-[0.6875rem] font-medium tracking-wide uppercase sm:grid sm:grid-cols-[1fr_1fr_4.5rem_5.5rem]">
              <span>Input</span>
              <span>Expected output</span>
              <span>Weight</span>
              <span />
            </div>
            {Array.from({ length: Math.max(3, tests.length) }, (_, row) => testRow(row))}
            {more(Math.max(3, tests.length), ASSESSMENT_LIMITS.testCases, 'tests', testRow)}
            <p className="text-muted-foreground text-xs leading-relaxed">
              Students see the visible tests and can run their code on them. Every test counts when they hand in: the
              marks follow the weight of the tests passed. Spaces at the end of lines and blank lines at the end are
              ignored.
            </p>
            <FieldErrors name="caseExpected[]" />
            <FieldErrors name="caseWeight[]" />
          </fieldset>
        </>
      )}

      {objective && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="negativeMarks" label="Taken off if wrong" hint="Not for an unanswered question. 0 for none.">
            <Input name="negativeMarks" type="number" min={0} step={0.01} defaultValue={item?.negativeMarks ?? 0} />
          </Field>
          {PARTIAL_TYPES.some((t) => t === type) && (
            <label className="flex items-start gap-2.5 self-end pb-2 text-[0.8125rem]">
              <input
                type="checkbox"
                name="partialCredit"
                value="true"
                defaultChecked={item?.partialCredit ?? false}
                className="accent-foreground mt-0.5 size-4 shrink-0"
              />
              Give part marks for a partly right answer
            </label>
          )}
        </div>
      )}

      <details className="grid gap-2">
        <summary className="cursor-pointer text-sm font-medium">Explanation (optional)</summary>
        <div className="mt-2 grid gap-2">
          <RichTextEditor
            name="explanation"
            initial={item?.explanation}
            placeholder="Why the answer is right, shown with the results when you choose to."
          />
          <FieldErrors name="explanation" />
        </div>
      </details>
    </FormDialog>
  );
}
