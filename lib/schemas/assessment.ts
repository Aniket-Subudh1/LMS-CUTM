import { z } from 'zod';
import { istDateTime, objectId, richText } from '@/lib/schemas/common';
import { BLOOM_LEVELS } from '@/lib/schemas/structure';
import { UploadedFile } from '@/lib/schemas/uploads';

// The M04 modes, and M04b's coding modes (TP-09, from M05); M07 adds project_review (05 §5.1).
export const ASSESSMENT_MODES = [
  'quiz',
  'written_test',
  'assignment',
  'learning_record',
  'lab_record',
  'coding_test',
  'lab_test',
  'coding_competition',
] as const;
export type AssessmentMode = (typeof ASSESSMENT_MODES)[number];
export const RECORD_MODES = ['learning_record', 'lab_record'] as const satisfies readonly AssessmentMode[];

// M04b adds true or false, fill in the blanks, matching and ordering (TP-06), and code (TP-09).
export const ITEM_TYPES = [
  'mcq',
  'msq',
  'true_false',
  'numeric',
  'fill_blank',
  'matching',
  'ordering',
  'text',
  'file',
  'code',
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export const OBJECTIVE_TYPES = [
  'mcq',
  'msq',
  'true_false',
  'numeric',
  'fill_blank',
  'matching',
  'ordering',
] as const satisfies readonly ItemType[];
// The types that can earn part of their marks (07 §14, TP-06).
export const PARTIAL_TYPES = ['msq', 'fill_blank', 'matching', 'ordering'] as const satisfies readonly ItemType[];
const OBJECTIVE = ['mcq', 'msq', 'true_false', 'numeric', 'fill_blank', 'matching', 'ordering'] as const;

// Which question types each mode may hold (the milestone's table); saveItem refuses any other pair.
export const MODE_ITEM_TYPES: Record<AssessmentMode, readonly ItemType[]> = {
  quiz: [...OBJECTIVE, 'text'],
  written_test: [...OBJECTIVE, 'text', 'file'],
  assignment: ['text', 'file'],
  learning_record: ['text', 'file'],
  lab_record: ['text', 'file'],
  coding_test: [...OBJECTIVE, 'text', 'code'],
  lab_test: [...OBJECTIVE, 'text', 'file', 'code'],
  coding_competition: ['code'],
};

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

// The typical settings of each mode (the milestone's table): the New assessment dialog asks only for the type, title and
// window, and the builder's Settings change the rest (A-107).
export const MODE_DEFAULTS: Record<
  AssessmentMode,
  { durationMin: number | null; attemptsAllowed: number; shuffleItems: boolean; shuffleOptions: boolean }
> = {
  quiz: { durationMin: 30, attemptsAllowed: 1, shuffleItems: true, shuffleOptions: true },
  written_test: { durationMin: 60, attemptsAllowed: 1, shuffleItems: false, shuffleOptions: false },
  assignment: { durationMin: null, attemptsAllowed: 1, shuffleItems: false, shuffleOptions: false },
  learning_record: { durationMin: null, attemptsAllowed: 1, shuffleItems: false, shuffleOptions: false },
  lab_record: { durationMin: null, attemptsAllowed: 1, shuffleItems: false, shuffleOptions: false },
  coding_test: { durationMin: 90, attemptsAllowed: 1, shuffleItems: false, shuffleOptions: false },
  lab_test: { durationMin: 120, attemptsAllowed: 1, shuffleItems: false, shuffleOptions: false },
  coding_competition: { durationMin: 120, attemptsAllowed: 1, shuffleItems: false, shuffleOptions: false },
};

export const ASSESSMENT_STATUSES = ['draft', 'published', 'results_published'] as const;
export const SUBMISSION_STATUSES = ['in_progress', 'submitted', 'graded'] as const;
export const ATTEMPT_POLICIES = ['best', 'last'] as const;
export type AttemptPolicy = (typeof ATTEMPT_POLICIES)[number];

// 05 §5.1–5.2 bounds. An offering holds at most MAX_ASSESSMENTS (A-102), so its lists are single bounded reads.
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
  // M04b
  sections: 10,
  sectionTitle: 80,
  blanks: 10,
  accepted: 10,
  blankText: 200,
  pairs: 10,
  pairText: 200,
  topic: 60,
  template: 2000,
  extraTime: 200,
  spentSec: 600,
  // TP-09 (05 §5.1): code questions; inputs and expected outputs 8 KB, a student's code 64 KB.
  codeItems: 5,
  languages: 10,
  testCases: 15,
  caseText: 8_000,
  starter: 16_000,
  source: 64_000,
  runLimit: 30,
} as const;

// What happened to one run of a test (06 §4.4); "wrong_answer" is ours, from comparing outputs (07 §14).
export const RUN_STATUSES = [
  'accepted',
  'wrong_answer',
  'time_limit',
  'compile_error',
  'runtime_error',
  'internal_error',
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

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

export const SaveInstructions = z.object({ assessmentId: objectId, instructions: richText });

// M04b: an assessment is found by its own id; access comes from it (its course or its owners), never from a posted course.
export const AssessmentRef = z.object({ assessmentId: objectId });
export const ItemRef = z.object({ ...AssessmentRef.shape, itemId: objectId });
// A drag or a Move menu sends the whole new order (lib/domain/order.ts).
export const ReorderItems = z.object({
  ...AssessmentRef.shape,
  'ids[]': z.array(objectId).min(1).max(ASSESSMENT_LIMITS.items),
});

// --- One question (T4; M04b TP-06). Each type's dialog posts only its own fields; blank option, rubric, blank and
// pair rows are skipped. The fields are shared by an assessment's questions and the question bank (TP-05). ---

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
const pairRows = list(
  z.string().trim().max(ASSESSMENT_LIMITS.pairText, `Use at most ${ASSESSMENT_LIMITS.pairText} characters.`),
  ASSESSMENT_LIMITS.pairs,
);

// A textarea posts \r\n; a program reads \n.
const lf = (text: string) => text.replace(/\r\n/g, '\n');
const caseText = z
  .string()
  .max(ASSESSMENT_LIMITS.caseText, `Keep each test's input and output under ${ASSESSMENT_LIMITS.caseText} characters.`);
const languageKey = z.string().trim().min(1).max(20);

const itemBase = {
  prompt: richText.refine((doc) => doc !== null, 'Write the question.'),
  maxMarks: z.coerce.number({ error: 'Enter the marks.' }).gt(0, 'Give it more than 0 marks.').max(1000),
  'cos[]': list(objectId, ASSESSMENT_LIMITS.coIds),
  bloomLevel: blankIsMissing(z.enum(BLOOM_LEVELS, 'Pick from the levels shown.')),
  difficulty: blankIsMissing(z.enum(DIFFICULTIES, 'Pick easy, medium or hard.')),
  topic: blankIsMissing(
    z.string().trim().toLowerCase().max(ASSESSMENT_LIMITS.topic, `Use at most ${ASSESSMENT_LIMITS.topic} characters.`),
  ),
  negativeMarks: z.coerce.number({ error: 'Enter a number.' }).min(0, 'Use 0 or more.').max(1000).default(0),
  partialCredit: z.stringbool().default(false),
  explanation: richText,
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
    z.object({ ...itemBase, type: z.literal('true_false'), truth: z.enum(['true', 'false'], 'Pick true or false.') }),
    z.object({
      ...itemBase,
      type: z.literal('numeric'),
      value: z.coerce.number({ error: 'Enter the answer as a number.' }).min(-1e12).max(1e12),
      tolerance: z.preprocess(
        (value) => (value === '' || value === undefined ? 0 : value),
        z.coerce.number({ error: 'Enter a number.' }).min(0, 'The margin cannot be negative.').max(1e12),
      ),
    }),
    z.object({
      ...itemBase,
      type: z.literal('fill_blank'),
      template: z
        .string()
        .trim()
        .max(ASSESSMENT_LIMITS.template, `Use at most ${ASSESSMENT_LIMITS.template} characters.`),
      'accepted[]': list(
        z
          .string()
          .trim()
          .max(ASSESSMENT_LIMITS.blankText * 4),
        ASSESSMENT_LIMITS.blanks,
      ),
    }),
    z.object({ ...itemBase, type: z.literal('matching'), 'left[]': pairRows, 'right[]': pairRows }),
    z.object({ ...itemBase, type: z.literal('ordering'), 'option[]': optionRows }),
    z.object({ ...itemBase, type: z.literal('text'), ...rubricRows }),
    z.object({ ...itemBase, type: z.literal('file'), ...rubricRows }),
    // TP-09: the languages offered (from the codeRunner setting) and a starter for each; the limits; up to 15 tests,
    // each an input and its expected output, hidden or not, weighed 1–10. Blank test rows are skipped.
    z.object({
      ...itemBase,
      type: z.literal('code'),
      'language[]': list(languageKey, ASSESSMENT_LIMITS.languages),
      'starterLanguage[]': list(languageKey, ASSESSMENT_LIMITS.languages),
      'starter[]': list(
        z.string().max(ASSESSMENT_LIMITS.starter, `Keep each starter under ${ASSESSMENT_LIMITS.starter} characters.`),
        ASSESSMENT_LIMITS.languages,
      ),
      timeLimitSec: z.coerce.number().int('Use whole seconds.').min(1, 'At least 1 second.').max(10).default(2),
      memoryMb: z.coerce
        .number()
        .int('Use whole MB.')
        .min(64, 'At least 64 MB.')
        .max(512, 'At most 512 MB.')
        .default(128),
      runLimit: z.coerce
        .number()
        .int('Use a whole number.')
        .min(1, 'Allow at least 1 run.')
        .max(ASSESSMENT_LIMITS.runLimit, `Allow at most ${ASSESSMENT_LIMITS.runLimit} runs.`)
        .default(10),
      'caseInput[]': list(caseText, ASSESSMENT_LIMITS.testCases),
      'caseExpected[]': list(caseText, ASSESSMENT_LIMITS.testCases),
      'caseWeight[]': list(z.string().trim().max(3), ASSESSMENT_LIMITS.testCases),
      'caseHidden[]': list(
        z.coerce
          .number()
          .int()
          .min(0)
          .max(ASSESSMENT_LIMITS.testCases - 1),
        ASSESSMENT_LIMITS.testCases,
      ),
    }),
  ],
  { error: 'Choose a question type.' },
);

// mcq/msq: the right options by their place among the filled rows; ordering: the rows as written are the right order.
export type ItemKey =
  { correct: number[] } | { value: number; tolerance: number } | { truth: boolean } | { ordered: true };

// A code question's settings and tests (TP-09); `memoryKb` as the runner takes it.
export type CodeParts = {
  languages: string[];
  starter: { language: string; source: string }[];
  timeLimitSec: number;
  memoryKb: number;
  runLimit: number;
  testCases: { input: string; expected: string; hidden: boolean; weight: number }[];
};

// What only some types have; each type's branch fills in its own.
type ItemParts = {
  options: string[] | null;
  key: ItemKey | null;
  rubric: { criterion: string; maxMarks: number }[] | null;
  template: string | null;
  blanks: { accepted: string[] }[] | null;
  pairs: { left: string; right: string }[] | null;
  code: CodeParts | null;
};
const NO_PARTS: ItemParts = {
  options: null,
  key: null,
  rubric: null,
  template: null,
  blanks: null,
  pairs: null,
  code: null,
};

// A blank in a fill-in-the-blanks sentence: three or more underscores.
export const BLANK = /_{3,}/g;

// Rows become options, blanks, pairs and criteria. Negative marks and partial credit apply only where they mean
// something (07 §14).
export const ItemInput = ItemFields.transform((input, ctx) => {
  const fail = (path: string, message: string) => {
    ctx.addIssue({ code: 'custom', path: [path], message });
    return z.NEVER;
  };
  const objective = OBJECTIVE_TYPES.some((type) => type === input.type);
  if (input.negativeMarks > input.maxMarks)
    return fail('negativeMarks', 'Take off no more than the question is worth.');
  const base = {
    type: input.type,
    prompt: input.prompt,
    maxMarks: input.maxMarks,
    coIds: input['cos[]'],
    bloomLevel: input.bloomLevel ?? null,
    difficulty: input.difficulty ?? null,
    topic: input.topic ?? null,
    negativeMarks: objective ? input.negativeMarks : 0,
    partialCredit: PARTIAL_TYPES.some((type) => type === input.type) && input.partialCredit,
    explanation: input.explanation,
    ...NO_PARTS,
  };
  switch (input.type) {
    case 'mcq':
    case 'msq': {
      const rows = input['option[]'].map((text, row) => ({ text, row })).filter((option) => option.text !== '');
      if (rows.length < 2) return fail('option[]', 'Write at least two options.');
      const chosen = input.type === 'mcq' ? (input.correct === undefined ? [] : [input.correct]) : input['correct[]'];
      const correct = rows.flatMap((option, place) => (chosen.includes(option.row) ? [place] : []));
      if (correct.length === 0 || correct.length !== chosen.length) {
        return fail('correct', input.type === 'mcq' ? 'Pick the correct option.' : 'Tick every correct option.');
      }
      return { ...base, options: rows.map((option) => option.text), key: { correct } };
    }
    case 'true_false':
      return { ...base, key: { truth: input.truth === 'true' } };
    case 'numeric':
      return { ...base, key: { value: input.value, tolerance: input.tolerance } };
    case 'ordering': {
      const rows = input['option[]'].filter((text) => text !== '');
      if (rows.length < 2) return fail('option[]', 'Write at least two steps.');
      return { ...base, options: rows, key: { ordered: true as const } };
    }
    case 'fill_blank': {
      const count = input.template.match(BLANK)?.length ?? 0;
      if (count === 0) return fail('template', 'Mark each blank with three underscores: ___');
      if (count > ASSESSMENT_LIMITS.blanks) return fail('template', `Use at most ${ASSESSMENT_LIMITS.blanks} blanks.`);
      const blanks = Array.from({ length: count }, (_, i) => ({
        accepted: [
          ...new Set(
            (input['accepted[]'][i] ?? '')
              .split('|')
              .map((answer) => answer.trim())
              .filter(Boolean),
          ),
        ].slice(0, ASSESSMENT_LIMITS.accepted),
      }));
      const missing = blanks.findIndex((blank) => blank.accepted.length === 0);
      if (missing !== -1) return fail('accepted[]', `Blank ${missing + 1}: write the answer it accepts.`);
      return { ...base, template: input.template, blanks };
    }
    case 'matching': {
      const pairs: { left: string; right: string }[] = [];
      for (const [row, left] of input['left[]'].entries()) {
        const right = input['right[]'][row] ?? '';
        if (left === '' && right === '') continue;
        if (left === '' || right === '') return fail('left[]', `Row ${row + 1}: fill in both sides.`);
        pairs.push({ left, right });
      }
      if (pairs.length < 2) return fail('left[]', 'Write at least two pairs.');
      return { ...base, pairs };
    }
    case 'text':
    case 'file': {
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
      return { ...base, rubric: rubric.length > 0 ? rubric : null };
    }
    case 'code': {
      const languages = [...new Set(input['language[]'])];
      if (languages.length === 0) return fail('language[]', 'Tick at least one language.');
      const starter = input['starterLanguage[]'].flatMap((language, row) => {
        const source = lf(input['starter[]'][row] ?? '');
        return languages.includes(language) && source.trim() !== '' ? [{ language, source }] : [];
      });
      const hidden = new Set(input['caseHidden[]']);
      const testCases: CodeParts['testCases'] = [];
      for (const [row, raw] of input['caseInput[]'].entries()) {
        const stdin = lf(raw);
        const expected = lf(input['caseExpected[]'][row] ?? '');
        if (stdin === '' && expected === '') continue;
        if (expected.trim() === '') return fail('caseExpected[]', `Test ${row + 1}: write the expected output.`);
        const given = input['caseWeight[]'][row] ?? '';
        const weight = given === '' ? 1 : Number(given);
        if (!Number.isInteger(weight) || weight < 1 || weight > 10) {
          return fail('caseWeight[]', `Test ${row + 1}: weigh it from 1 to 10.`);
        }
        testCases.push({ input: stdin, expected, hidden: hidden.has(row), weight });
      }
      if (testCases.length === 0) return fail('caseExpected[]', 'Write at least one test.');
      if (testCases.every((test) => test.hidden)) {
        return fail('caseExpected[]', 'Leave at least one test visible, so students can try their code on it.');
      }
      return {
        ...base,
        code: {
          languages,
          starter,
          timeLimitSec: input.timeLimitSec,
          memoryKb: input.memoryMb * 1000,
          runLimit: input.runLimit,
          testCases,
        },
      };
    }
  }
});
export type ItemInput = z.output<typeof ItemInput>;

// An assessment's question: the assessment, the question when editing one, and its section (M04b).
export const SaveItem = z.intersection(
  z.object({ ...AssessmentRef.shape, itemId: blankIsMissing(objectId), sectionId: blankIsMissing(objectId) }),
  ItemInput,
);
export type SaveItem = z.output<typeof SaveItem>;

// --- Attempting (T5) ---

// What the runner saves for one question. A text answer is the editor's JSON string, as a form would post it.
export const Answer = z.discriminatedUnion('type', [
  z.object({ type: z.literal('mcq'), optionId: objectId.nullable() }),
  z.object({ type: z.literal('msq'), optionIds: z.array(objectId).max(ASSESSMENT_LIMITS.options) }),
  z.object({ type: z.literal('true_false'), truth: z.boolean().nullable() }),
  z.object({ type: z.literal('numeric'), value: z.number().finite().min(-1e12).max(1e12).nullable() }),
  z.object({
    type: z.literal('fill_blank'),
    texts: z.array(z.string().max(ASSESSMENT_LIMITS.blankText)).max(ASSESSMENT_LIMITS.blanks),
  }),
  z.object({
    type: z.literal('matching'),
    matches: z.array(z.object({ left: objectId, right: objectId })).max(ASSESSMENT_LIMITS.pairs),
  }),
  z.object({ type: z.literal('ordering'), optionIds: z.array(objectId).max(ASSESSMENT_LIMITS.options) }),
  z.object({ type: z.literal('text'), text: richText }),
  z.object({
    type: z.literal('code'),
    language: languageKey,
    source: z.string().max(ASSESSMENT_LIMITS.source, 'Your code is longer than 64 KB.'),
  }),
  z.object({
    type: z.literal('file'),
    files: z.array(UploadedFile).max(ASSESSMENT_LIMITS.files, `Upload at most ${ASSESSMENT_LIMITS.files} files.`),
  }),
]);
export type Answer = z.output<typeof Answer>;

// `spentSec`: seconds on this question since the last save (TP-07, "time per question").
export const SaveAnswer = z.object({
  submissionId: objectId,
  itemId: objectId,
  answer: Answer,
  spentSec: z.number().int().min(0).max(ASSESSMENT_LIMITS.spentSec).default(0),
});
export const SubmissionRef = z.object({ submissionId: objectId });
// TP-09: "Run sample tests" — the code as it stands is saved and run on the question's visible tests.
export const RunCode = z.object({
  ...SubmissionRef.shape,
  itemId: objectId,
  language: languageKey,
  source: z.string().max(ASSESSMENT_LIMITS.source, 'Your code is longer than 64 KB.'),
});
// TP-07: "Flag for review".
export const FlagItem = z.object({ ...SubmissionRef.shape, itemId: objectId, flagged: z.boolean() });
// TP-06: opening a section (the runner's tabs and its move to the next one).
export const EnterSection = z.object({ ...SubmissionRef.shape, sectionId: objectId });

// --- Sections (M04b, TP-05, TP-06): their own time and "no going back"; a passage beside their questions; and
// questions drawn from the bank for each attempt, by count, difficulty mix, outcomes and topics. ---

const percent = z.coerce.number().int('Use whole percentages.').min(0).max(100).default(0);
export const SaveSection = z
  .object({
    ...AssessmentRef.shape,
    sectionId: blankIsMissing(objectId),
    title: z
      .string()
      .trim()
      .min(1, 'Name the section.')
      .max(ASSESSMENT_LIMITS.sectionTitle, `Use at most ${ASSESSMENT_LIMITS.sectionTitle} characters.`),
    durationMin: blankIsMissing(z.coerce.number().int('Use whole minutes.').min(1).max(600)),
    locked: z.stringbool().default(false),
    passage: richText,
    drawCount: blankIsMissing(
      z.coerce
        .number()
        .int()
        .min(1, 'Draw at least 1.')
        .max(ASSESSMENT_LIMITS.items, `Draw at most ${ASSESSMENT_LIMITS.items}.`),
    ),
    easy: percent,
    medium: percent,
    hard: percent,
    'drawCos[]': list(objectId, ASSESSMENT_LIMITS.coIds),
    drawTopics: z
      .string()
      .max(400)
      .default('')
      .transform((value) => [
        ...new Set(
          value
            .split(',')
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean),
        ),
      ])
      .pipe(z.array(z.string().max(ASSESSMENT_LIMITS.topic)).max(10, 'Use at most 10 topics.')),
    marksEach: blankIsMissing(z.coerce.number().gt(0, 'Give each more than 0 marks.').max(1000)),
    negativeEach: z.coerce.number().min(0, 'Use 0 or more.').max(1000).default(0),
  })
  .superRefine((input, ctx) => {
    const mix = input.easy + input.medium + input.hard;
    if (mix !== 0 && mix !== 100)
      ctx.addIssue({
        code: 'custom',
        path: ['easy'],
        message: 'Make the mix add up to 100%, or leave all three at 0.',
      });
    if (input.drawCount !== undefined && input.marksEach === undefined) {
      ctx.addIssue({ code: 'custom', path: ['marksEach'], message: 'Give the drawn questions their marks.' });
    }
    if (input.marksEach !== undefined && input.negativeEach > input.marksEach) {
      ctx.addIssue({ code: 'custom', path: ['negativeEach'], message: 'Take off no more than a question is worth.' });
    }
  });
export const SectionRef = z.object({ ...AssessmentRef.shape, sectionId: objectId });
export const ReorderSections = z.object({
  ...AssessmentRef.shape,
  'ids[]': z.array(objectId).min(1).max(ASSESSMENT_LIMITS.sections),
});

// TP-07: extra time for one person on one test (0 takes it away).
export const SetExtraTime = z.object({
  ...AssessmentRef.shape,
  // An email or a roll number.
  who: z.string().trim().min(1, 'Enter an email or a roll number.').max(120),
  minutes: z.coerce.number().int('Use whole minutes.').min(0).max(600, 'Give at most 600 minutes.'),
});

// --- Proctoring and the live monitor (M04b, TP-08; the rules are 07 §15) ---

// Serious warnings count towards the limit that hands an attempt in, and towards the penalty; the others are recorded.
export const HARD_EVENTS = ['fullscreen_exit', 'left_page', 'second_device'] as const;
export const SOFT_EVENTS = [
  'copy',
  'paste',
  'right_click',
  'print',
  'devtools',
  'connection_gap',
  'camera_off',
] as const;
export const PROCTOR_EVENTS = [...HARD_EVENTS, ...SOFT_EVENTS] as const;
export type ProctorEvent = (typeof PROCTOR_EVENTS)[number];
// What a runner reports; the server notices lost connections and second devices itself.
const REPORTED_EVENTS = [
  'fullscreen_exit',
  'left_page',
  'copy',
  'paste',
  'right_click',
  'print',
  'devtools',
  'camera_off',
] as const satisfies readonly ProctorEvent[];
export type ReportedEvent = (typeof REPORTED_EVENTS)[number];
export const ENDED_BY = ['warnings', 'teacher'] as const;

export const PROCTOR_LIMITS = {
  events: 300,
  snapshots: 240,
  messages: 20,
  message: 300,
  perBeat: 10,
  hardLimit: 20,
  addMinutes: 120,
} as const;

// Saved with "Proctor this test" unticked, the rest is not read and the test is not proctored.
export const SaveProctoring = z
  .object({
    ...AssessmentRef.shape,
    enabled: z.stringbool().default(false),
    fullscreen: z.stringbool().default(false),
    camera: z.stringbool().default(false),
    snapshotEverySec: z.coerce
      .number()
      .int('Use whole seconds.')
      .min(30, 'Take one every 30 seconds at most.')
      .max(600, 'Take one at least every 600 seconds.')
      .default(60),
    blockCopy: z.stringbool().default(false),
    hardLimit: z.coerce
      .number()
      .int('Use a whole number.')
      .min(0, 'Use 0 or more.')
      .max(PROCTOR_LIMITS.hardLimit, `Use at most ${PROCTOR_LIMITS.hardLimit}.`)
      .default(3),
    penaltyEach: z.coerce.number().min(0, 'Use 0 or more.').max(1000).default(0),
  })
  .refine((input) => Number.isInteger(input.penaltyEach * 100), {
    path: ['penaltyEach'],
    message: 'Use at most two decimal places.',
  });

// The runner's beat every BEAT_MS, and at once with what it noticed. `sessionId` names this tab (kept in
// sessionStorage, so a reload keeps it); a second tab or device has another.
export const ProctorBeat = z.object({
  ...SubmissionRef.shape,
  sessionId: z.uuid(),
  events: z.array(z.enum(REPORTED_EVENTS)).max(PROCTOR_LIMITS.perBeat).default([]),
});
export const AddSnapshot = z.object({ ...SubmissionRef.shape, key: z.string().trim().min(1).max(500) });

// The monitor's actions: one running attempt when `submissionId` is posted, else every running attempt of the test.
export const ExtendAttempts = z.object({
  ...AssessmentRef.shape,
  submissionId: blankIsMissing(objectId),
  minutes: z.coerce
    .number()
    .int('Use whole minutes.')
    .min(1, 'Add at least 1 minute.')
    .max(PROCTOR_LIMITS.addMinutes, `Add at most ${PROCTOR_LIMITS.addMinutes} minutes at a time.`),
});
export const MessageTakers = z.object({
  ...AssessmentRef.shape,
  submissionId: blankIsMissing(objectId),
  text: z
    .string()
    .trim()
    .min(1, 'Write the message.')
    .max(PROCTOR_LIMITS.message, `Use at most ${PROCTOR_LIMITS.message} characters.`),
});
export const WaivePenalty = z.object({ ...SubmissionRef.shape, waived: z.stringbool() });

// --- Results (M04b, TP-11; the rules are 07 §19) ---

// manual: published by hand once it closes and all is marked (M04) · on_close: published by itself then · instant:
// each person sees their marks once their attempt is marked; ranks wait for the published results.
export const RELEASE_RULES = ['manual', 'on_close', 'instant'] as const;
export type ReleaseRule = (typeof RELEASE_RULES)[number];
export const RESULT_LIMITS = { bands: 5, bandLabel: 40, leaderboard: 10, similar: 10, statsItems: 300 } as const;

export const SaveResultRules = z
  .object({
    ...AssessmentRef.shape,
    release: z.enum(RELEASE_RULES, 'Choose when results go out.').default('manual'),
    showAnswers: z.stringbool().default(false),
    showExplanations: z.stringbool().default(false),
    leaderboard: z.stringbool().default(false),
    // TP-12: certificates for those who reach this percentage; empty gives none.
    certificateFrom: blankIsMissing(
      z.coerce.number({ error: 'Enter a percentage.' }).min(0, 'Use 0 to 100.').max(100, 'Use 0 to 100.'),
    ),
    'bandLabel[]': list(
      z.string().trim().max(RESULT_LIMITS.bandLabel, `Use at most ${RESULT_LIMITS.bandLabel} characters.`),
      RESULT_LIMITS.bands,
    ),
    'bandMin[]': list(z.string().trim().max(6), RESULT_LIMITS.bands),
  })
  .transform((input, ctx) => {
    const bands: { label: string; minPct: number }[] = [];
    for (const [row, label] of input['bandLabel[]'].entries()) {
      const raw = input['bandMin[]'][row] ?? '';
      if (label === '' && raw === '') continue;
      const minPct = Number(raw);
      if (label === '' || raw === '' || !Number.isFinite(minPct) || minPct < 0 || minPct > 100) {
        ctx.addIssue({ code: 'custom', path: ['bandLabel[]'], message: `Band ${row + 1}: give a name and a 0–100 %.` });
        return z.NEVER;
      }
      bands.push({ label, minPct });
    }
    if (new Set(bands.map((band) => band.minPct)).size !== bands.length) {
      ctx.addIssue({ code: 'custom', path: ['bandLabel[]'], message: 'Give each band its own percentage.' });
      return z.NEVER;
    }
    const { assessmentId, release, showAnswers, showExplanations, leaderboard } = input;
    return {
      assessmentId,
      release,
      showAnswers,
      showExplanations,
      leaderboard,
      certificateFromPct: input.certificateFrom ?? null,
      bands: bands.sort((a, b) => b.minPct - a.minPct),
    };
  });

// --- Files made from the results (M04b, TP-12) ---

// The staff's: every result in Excel, every hand-in's report in one PDF. A taker's: their scorecard and certificate.
export const TEST_FILE_KINDS = ['results_xlsx', 'reports_pdf', 'scorecard', 'certificate'] as const;
export type TestFileKind = (typeof TEST_FILE_KINDS)[number];
export const STAFF_FILE_KINDS = ['results_xlsx', 'reports_pdf'] as const satisfies readonly TestFileKind[];
export const TEST_FILE_STATUSES = ['making', 'ready', 'failed'] as const;
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const RequestTestFile = z.object({ ...AssessmentRef.shape, kind: z.enum(TEST_FILE_KINDS) });
// A certificate's verification code, as printed and in its link: two groups of five.
export const certificateCode = z.string().regex(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);

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
