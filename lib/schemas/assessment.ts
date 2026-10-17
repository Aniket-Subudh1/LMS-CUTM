import { z } from 'zod';
import { istDateTime, objectId, richText } from '@/lib/schemas/common';
import { BLOOM_LEVELS } from '@/lib/schemas/structure';
import { UploadedFile } from '@/lib/schemas/uploads';

// The M04 modes; M05 adds coding_test, lab_test and coding_competition, M07 project_review (05 §5.1).
export const ASSESSMENT_MODES = ['quiz', 'written_test', 'assignment', 'learning_record', 'lab_record'] as const;
export type AssessmentMode = (typeof ASSESSMENT_MODES)[number];
export const RECORD_MODES = ['learning_record', 'lab_record'] as const satisfies readonly AssessmentMode[];

export const ITEM_TYPES = ['mcq', 'msq', 'numeric', 'text', 'file'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export const OBJECTIVE_TYPES = ['mcq', 'msq', 'numeric'] as const satisfies readonly ItemType[];

// Which question types each mode may hold (the milestone's table); saveItem refuses any other pair.
export const MODE_ITEM_TYPES: Record<AssessmentMode, readonly ItemType[]> = {
  quiz: ['mcq', 'msq', 'numeric', 'text'],
  written_test: ['mcq', 'msq', 'numeric', 'text', 'file'],
  assignment: ['text', 'file'],
  learning_record: ['text', 'file'],
  lab_record: ['text', 'file'],
};

// The typical settings of each mode (the milestone's table): the New assessment dialog asks only for the type, title and
// window, and the builder's Settings change the rest (A-M04-6).
export const MODE_DEFAULTS: Record<
  AssessmentMode,
  { durationMin: number | null; attemptsAllowed: number; shuffleItems: boolean; shuffleOptions: boolean }
> = {
  quiz: { durationMin: 30, attemptsAllowed: 1, shuffleItems: true, shuffleOptions: true },
  written_test: { durationMin: 60, attemptsAllowed: 1, shuffleItems: false, shuffleOptions: false },
  assignment: { durationMin: null, attemptsAllowed: 1, shuffleItems: false, shuffleOptions: false },
  learning_record: { durationMin: null, attemptsAllowed: 1, shuffleItems: false, shuffleOptions: false },
  lab_record: { durationMin: null, attemptsAllowed: 1, shuffleItems: false, shuffleOptions: false },
};

export const ASSESSMENT_STATUSES = ['draft', 'published', 'results_published'] as const;
export const SUBMISSION_STATUSES = ['in_progress', 'submitted', 'graded'] as const;
export const ATTEMPT_POLICIES = ['best', 'last'] as const;
export type AttemptPolicy = (typeof ATTEMPT_POLICIES)[number];

// 05 §5.1–5.2 bounds. An offering holds at most MAX_ASSESSMENTS (A-M04-1), so its lists are single bounded reads.
export const ASSESSMENT_LIMITS = {
  perOffering: 200,
  items: 100,
  options: 8,
  optionText: 500,
  criteria: 10,
  criterion: 200,
  files: 10,
  comment: 1000,
  coIds: 15,
} as const;

const title = z.string().trim().min(3, 'Use at least 3 characters.').max(160, 'Use at most 160 characters.');
const blankIsMissing = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
const list = <T extends z.ZodType>(item: T, max: number) =>
  z.preprocess((value) => value ?? [], z.array(item).max(max));
const closesAfterOpening = (input: { opensAt: string; closesAt: string }) => input.opensAt < input.closesAt;
const closing = { path: ['closesAt'], message: 'Close it after it opens.' };

export const CreateAssessment = z
  .object({
    offeringId: objectId,
    mode: z.enum(ASSESSMENT_MODES, 'Choose a type.'),
    title,
    opensAt: istDateTime,
    closesAt: istDateTime,
  })
  .refine(closesAfterOpening, closing);

// While students have attempts, only the title and dates are read: the other fields are disabled, so they do not post.
export const UpdateAssessmentSettings = z
  .object({
    offeringId: objectId,
    assessmentId: objectId,
    title,
    opensAt: istDateTime,
    closesAt: istDateTime,
    lateUntil: blankIsMissing(istDateTime),
    durationMin: blankIsMissing(
      z.coerce.number().int('Use whole minutes.').min(1, 'Use at least 1 minute.').max(600, 'Use at most 600 minutes.'),
    ),
    attemptsAllowed: z.coerce
      .number()
      .int()
      .min(1, 'Allow at least 1 attempt.')
      .max(10, 'Allow at most 10.')
      .default(1),
    attemptPolicy: z.enum(ATTEMPT_POLICIES).default('best'),
    shuffleItems: z.stringbool().default(false),
    shuffleOptions: z.stringbool().default(false),
  })
  .refine(closesAfterOpening, closing)
  .refine((input) => !input.lateUntil || input.lateUntil >= input.closesAt, {
    path: ['lateUntil'],
    message: 'Late hand-ins end at or after the closing time.',
  });

export const SaveInstructions = z.object({ offeringId: objectId, assessmentId: objectId, instructions: richText });

export const AssessmentRef = z.object({ offeringId: objectId, assessmentId: objectId });
export const ItemRef = z.object({ ...AssessmentRef.shape, itemId: objectId });
// A drag or a Move menu sends the whole new order (lib/domain/order.ts).
export const ReorderItems = z.object({
  ...AssessmentRef.shape,
  'ids[]': z.array(objectId).min(1).max(ASSESSMENT_LIMITS.items),
});

// --- One question (T4). Each type's dialog posts only its own fields; blank option and rubric rows are skipped. ---

const itemBase = {
  ...AssessmentRef.shape,
  itemId: blankIsMissing(objectId),
  prompt: richText.refine((doc) => doc !== null, 'Write the question.'),
  maxMarks: z.coerce.number({ error: 'Enter the marks.' }).gt(0, 'Give it more than 0 marks.').max(1000),
  'cos[]': list(objectId, ASSESSMENT_LIMITS.coIds),
  bloomLevel: blankIsMissing(z.enum(BLOOM_LEVELS, 'Pick from the levels shown.')),
};
const optionRows = list(
  z.string().trim().max(ASSESSMENT_LIMITS.optionText, `Use at most ${ASSESSMENT_LIMITS.optionText} characters.`),
  ASSESSMENT_LIMITS.options,
);
const rowIndex = z.coerce
  .number()
  .int()
  .min(0)
  .max(ASSESSMENT_LIMITS.options - 1);
const rubricRows = {
  'criterion[]': list(
    z.string().trim().max(ASSESSMENT_LIMITS.criterion, `Use at most ${ASSESSMENT_LIMITS.criterion} characters.`),
    ASSESSMENT_LIMITS.criteria,
  ),
  'criterionMarks[]': list(z.string().trim().max(20), ASSESSMENT_LIMITS.criteria),
};

const ItemFields = z.discriminatedUnion(
  'type',
  [
    z.object({ ...itemBase, type: z.literal('mcq'), 'option[]': optionRows, correct: blankIsMissing(rowIndex) }),
    z.object({
      ...itemBase,
      type: z.literal('msq'),
      'option[]': optionRows,
      'correct[]': list(rowIndex, ASSESSMENT_LIMITS.options),
    }),
    z.object({
      ...itemBase,
      type: z.literal('numeric'),
      value: z.coerce.number({ error: 'Enter the answer as a number.' }).min(-1e12).max(1e12),
      tolerance: z.preprocess(
        (value) => (value === '' || value === undefined ? 0 : value),
        z.coerce.number({ error: 'Enter a number.' }).min(0, 'The margin cannot be negative.').max(1e12),
      ),
    }),
    z.object({ ...itemBase, type: z.literal('text'), ...rubricRows }),
    z.object({ ...itemBase, type: z.literal('file'), ...rubricRows }),
  ],
  { error: 'Choose a question type.' },
);

export type ItemKey = { correct: number[] } | { value: number; tolerance: number };

// Rows become options and criteria; the key names options by their place among the filled rows.
export const SaveItem = ItemFields.transform((input, ctx) => {
  const fail = (path: string, message: string) => {
    ctx.addIssue({ code: 'custom', path: [path], message });
    return z.NEVER;
  };
  const base = {
    offeringId: input.offeringId,
    assessmentId: input.assessmentId,
    itemId: input.itemId,
    type: input.type,
    prompt: input.prompt,
    maxMarks: input.maxMarks,
    coIds: input['cos[]'],
    bloomLevel: input.bloomLevel ?? null,
  };
  if (input.type === 'mcq' || input.type === 'msq') {
    const rows = input['option[]'].map((text, row) => ({ text, row })).filter((option) => option.text !== '');
    if (rows.length < 2) return fail('option[]', 'Write at least two options.');
    const chosen = input.type === 'mcq' ? (input.correct === undefined ? [] : [input.correct]) : input['correct[]'];
    const correct = rows.flatMap((option, place) => (chosen.includes(option.row) ? [place] : []));
    if (correct.length === 0 || correct.length !== chosen.length) {
      return fail('correct', input.type === 'mcq' ? 'Pick the correct option.' : 'Tick every correct option.');
    }
    return { ...base, options: rows.map((option) => option.text), key: { correct } satisfies ItemKey, rubric: null };
  }
  if (input.type === 'numeric') {
    return {
      ...base,
      options: null,
      key: { value: input.value, tolerance: input.tolerance } satisfies ItemKey,
      rubric: null,
    };
  }
  const rubric: { criterion: string; maxMarks: number }[] = [];
  for (const [row, criterion] of input['criterion[]'].entries()) {
    const raw = input['criterionMarks[]'][row] ?? '';
    if (criterion === '' && raw === '') continue;
    const value = Number(raw);
    if (criterion === '') return fail('criterion[]', `Row ${row + 1}: name the criterion.`);
    if (raw === '' || !Number.isFinite(value) || value <= 0)
      return fail('criterion[]', `Row ${row + 1}: give it more than 0 marks.`);
    rubric.push({ criterion, maxMarks: value });
  }
  return { ...base, options: null, key: null, rubric: rubric.length > 0 ? rubric : null };
});
export type SaveItem = z.output<typeof SaveItem>;

// --- Attempting (T5) ---

// What the runner saves for one question. A text answer is the editor's JSON string, as a form would post it.
export const Answer = z.discriminatedUnion('type', [
  z.object({ type: z.literal('mcq'), optionId: objectId.nullable() }),
  z.object({ type: z.literal('msq'), optionIds: z.array(objectId).max(ASSESSMENT_LIMITS.options) }),
  z.object({ type: z.literal('numeric'), value: z.number().finite().min(-1e12).max(1e12).nullable() }),
  z.object({ type: z.literal('text'), text: richText }),
  z.object({
    type: z.literal('file'),
    files: z.array(UploadedFile).max(ASSESSMENT_LIMITS.files, `Upload at most ${ASSESSMENT_LIMITS.files} files.`),
  }),
]);
export type Answer = z.output<typeof Answer>;

export const SaveAnswer = z.object({ offeringId: objectId, submissionId: objectId, itemId: objectId, answer: Answer });
export const SubmissionRef = z.object({ offeringId: objectId, submissionId: objectId });

// --- Grading (T6). One row per question in order; a rubric question posts its criteria instead of marks. ---

export const GradeSubmission = z
  .object({
    ...SubmissionRef.shape,
    'item[]': z.array(objectId).min(1).max(ASSESSMENT_LIMITS.items),
    'marks[]': list(z.string().trim().max(20), ASSESSMENT_LIMITS.items),
    'comment[]': list(
      z.string().trim().max(ASSESSMENT_LIMITS.comment, `Use at most ${ASSESSMENT_LIMITS.comment} characters.`),
      ASSESSMENT_LIMITS.items,
    ),
    'criterion[]': list(
      z.string().regex(/^[a-f\d]{24}:[a-f\d]{24}$/i),
      ASSESSMENT_LIMITS.items * ASSESSMENT_LIMITS.criteria,
    ),
    'criterionMarks[]': list(z.string().trim().max(20), ASSESSMENT_LIMITS.items * ASSESSMENT_LIMITS.criteria),
    // "Save and open the next" (M04 decision 5) posts then=next.
    then: blankIsMissing(z.literal('next')),
  })
  .refine(
    (input) =>
      input['marks[]'].length === input['item[]'].length &&
      input['comment[]'].length === input['item[]'].length &&
      input['criterionMarks[]'].length === input['criterion[]'].length,
    'Reload the page and grade again.',
  );

// --- The Assessments tab's filters ---

export const ASSESSMENT_STATES = ['draft', 'upcoming', 'open', 'closed', 'results'] as const;
export type AssessmentState = (typeof ASSESSMENT_STATES)[number];
