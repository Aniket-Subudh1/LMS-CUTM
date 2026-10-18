import { z } from 'zod';
import { ASSESSMENT_LIMITS, DIFFICULTIES, ItemInput } from '@/lib/schemas/assessment';
import { objectId } from '@/lib/schemas/common';
import { BLOOM_LEVELS, csvFile } from '@/lib/schemas/structure';

// M04b (TP-05): the question bank. A course's bank is reached through an offering of it (whoever teaches the offering
// edits its course's bank); without an offering it is the viewer's own bank, for their standalone tests.
export const BANK_LIMITS = { perBank: 5000, csvRows: 500, pick: 100 } as const;

const blankIsMissing = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const scope = { offeringId: blankIsMissing(objectId) };

export const SaveBankItem = z.intersection(z.object({ ...scope, bankItemId: blankIsMissing(objectId) }), ItemInput);
export type SaveBankItem = z.output<typeof SaveBankItem>;
export const BankItemRef = z.object({ ...scope, bankItemId: objectId });
export const ImportBankCsv = z.object({ ...scope, file: csvFile });
// An assessment's questions into its bank (its course's, or its owners' for a standalone test), and back.
export const CopyToBank = z.object({
  assessmentId: objectId,
  'itemIds[]': z.array(objectId).min(1, 'Pick at least one question.').max(ASSESSMENT_LIMITS.items),
});
export const AddFromBank = z.object({
  assessmentId: objectId,
  sectionId: blankIsMissing(objectId),
  'bankItemIds[]': z.array(objectId).min(1, 'Pick at least one question.').max(BANK_LIMITS.pick),
});

export const BankFilter = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  type: z.string().max(20).optional().catch(undefined),
  difficulty: z.enum(DIFFICULTIES).optional().catch(undefined),
  coId: objectId.optional().catch(undefined),
  topic: z.string().trim().toLowerCase().max(ASSESSMENT_LIMITS.topic).optional().catch(undefined),
});
export type BankFilter = z.output<typeof BankFilter>;

// 06 §8.6: one CSV row. The types a CSV can carry are the ones a single line can say.
const TYPE_WORDS: Record<string, 'mcq' | 'msq' | 'true_false' | 'numeric' | 'text'> = {
  mcq: 'mcq',
  'one answer': 'mcq',
  msq: 'msq',
  'several answers': 'msq',
  true_false: 'true_false',
  'true or false': 'true_false',
  numeric: 'numeric',
  number: 'numeric',
  text: 'text',
  'written answer': 'text',
};
export const BANK_CSV_COLUMNS = ['type', 'question', 'options', 'answer', 'marks'] as const;
const NUMBER_ANSWER = /^(-?\d+(?:\.\d+)?)(?:\s*(?:±|\+-|\+\/-)\s*(\d+(?:\.\d+)?))?$/;

// Each kind fills in its own key.
type CsvKey = {
  options: string[] | null;
  correct: number[] | null;
  truth: boolean | null;
  value: number | null;
  tolerance: number;
};
const NO_KEY: CsvKey = { options: null, correct: null, truth: null, value: null, tolerance: 0 };

export const BankCsvRow = z
  .object({
    type: z.string().transform((value, ctx) => {
      const type = TYPE_WORDS[value.toLowerCase()];
      if (!type) {
        ctx.addIssue({
          code: 'custom',
          message: 'Type is one of: one answer, several answers, true or false, number, written answer.',
        });
        return z.NEVER;
      }
      return type;
    }),
    question: z.string().min(1, 'Write the question.').max(4000, 'Keep the question under 4,000 characters.'),
    options: z.string().max(4000),
    answer: z.string().max(200),
    marks: z.coerce.number({ error: 'Marks is a number.' }).gt(0, 'Marks is more than 0.').max(1000),
    negative: z.coerce.number({ error: 'Negative is a number.' }).min(0).max(1000).default(0),
    difficulty: blankIsMissing(z.enum(DIFFICULTIES, 'Difficulty is easy, medium or hard.')),
    topic: blankIsMissing(z.string().toLowerCase().max(ASSESSMENT_LIMITS.topic, 'Keep the topic short.')),
    bloom: blankIsMissing(z.string().toLowerCase().pipe(z.enum(BLOOM_LEVELS, 'Bloom is a level such as apply.'))),
    cos: z.string().max(200).default(''),
  })
  .transform((row, ctx) => {
    const fail = (message: string) => {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    };
    const options = row.options
      .split('|')
      .map((option) => option.trim())
      .filter(Boolean);
    const base = {
      type: row.type,
      question: row.question,
      maxMarks: row.marks,
      negativeMarks: row.type === 'text' ? 0 : row.negative,
      difficulty: row.difficulty ?? null,
      topic: row.topic ?? null,
      bloomLevel: row.bloom ?? null,
      coCodes: row.cos
        .split('|')
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean),
      ...NO_KEY,
    };
    if (row.negative > row.marks) return fail('Negative marks are more than the question is worth.');
    if (row.type === 'mcq' || row.type === 'msq') {
      if (options.length < 2 || options.length > ASSESSMENT_LIMITS.options) {
        return fail(`Give 2 to ${ASSESSMENT_LIMITS.options} options separated by |.`);
      }
      const correct = row.answer
        .split('|')
        .map((n) => Number(n.trim()) - 1)
        .filter((n) => Number.isInteger(n));
      if (correct.length === 0 || correct.some((n) => n < 0 || n >= options.length)) {
        return fail('Answer is the number of the correct option (several separated by |).');
      }
      if (row.type === 'mcq' && correct.length !== 1) return fail('One answer has exactly one correct option.');
      return { ...base, options, correct: [...new Set(correct)] };
    }
    if (row.type === 'true_false') {
      const truth = row.answer.toLowerCase();
      if (truth !== 'true' && truth !== 'false') return fail('Answer is true or false.');
      return { ...base, truth: truth === 'true' };
    }
    if (row.type === 'numeric') {
      const match = NUMBER_ANSWER.exec(row.answer.trim());
      if (!match) return fail('Answer is a number, with an optional margin: 3.14 ± 0.01.');
      return { ...base, value: Number(match[1]), tolerance: Number(match[2] ?? 0) };
    }
    return base;
  });
export type BankCsvRow = z.output<typeof BankCsvRow>;
