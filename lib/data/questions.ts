import { Types } from 'mongoose';
import { rubricTotal } from '@/lib/domain/grading';
import { roundHalfUp } from '@/lib/domain/round';
import { AppError } from '@/lib/errors';
import type { ItemInput } from '@/lib/schemas/assessment';
import type { BankCsvRow } from '@/lib/schemas/bank';
import type { RichTextDoc } from '@/lib/schemas/common';

// One question as stored (05 §5.1), from its dialog or a CSV row: options, criteria, blanks, pairs and tests get new ids
// (A-108), the key names options by id, and marks are rounded once. Shared by an assessment's questions and the
// bank (M04b). A rubric must add up to the question's marks.
export function storedItem(input: ItemInput) {
  const maxMarks = roundHalfUp(input.maxMarks, 2);
  const rubric = input.rubric?.map((row) => ({
    _id: new Types.ObjectId(),
    ...row,
    maxMarks: roundHalfUp(row.maxMarks, 2),
  }));
  if (rubric && rubricTotal(rubric.map((row) => row.maxMarks)) !== maxMarks) {
    const sum = rubricTotal(rubric.map((row) => row.maxMarks));
    throw new AppError('VALIDATION', 'The criteria must add up to the question’s marks.', {
      'criterion[]': [`The criteria add up to ${sum}; the question has ${maxMarks} marks.`],
    });
  }
  const options = input.options?.map((text) => ({ _id: new Types.ObjectId(), text }));
  const key = input.key;
  let answer:
    | { optionId?: Types.ObjectId; optionIds?: Types.ObjectId[]; value?: number; tolerance?: number; truth?: boolean }
    | undefined;
  if (key && 'correct' in key && options) {
    answer =
      input.type === 'mcq'
        ? { optionId: options[key.correct[0]]._id }
        : { optionIds: key.correct.map((place) => options[place]._id) };
  } else if (key && 'value' in key) {
    answer = { value: key.value, tolerance: key.tolerance };
  } else if (key && 'truth' in key) {
    answer = { truth: key.truth };
  } else if (key && 'ordered' in key && options) {
    answer = { optionIds: options.map((option) => option._id) };
  }
  return {
    type: input.type,
    prompt: input.prompt,
    maxMarks,
    coIds: input.coIds.map((id) => new Types.ObjectId(id)),
    bloomLevel: input.bloomLevel,
    difficulty: input.difficulty,
    topic: input.topic,
    negativeMarks: roundHalfUp(input.negativeMarks, 2),
    partialCredit: input.partialCredit,
    explanation: input.explanation,
    options,
    answer,
    rubric,
    template: input.template ?? undefined,
    blanks: input.blanks?.map((blank) => ({ _id: new Types.ObjectId(), accepted: blank.accepted })),
    pairs: input.pairs?.map((pair) => ({ _id: new Types.ObjectId(), rightId: new Types.ObjectId(), ...pair })),
    code: input.code
      ? { ...input.code, testCases: input.code.testCases.map((test) => ({ _id: new Types.ObjectId(), ...test })) }
      : undefined,
  };
}
export type StoredItem = ReturnType<typeof storedItem>;

// The question itself, without where it is kept: for copying between a test and a bank (TP-05). Its options keep their
// ids, so its key still names them.
export function questionOf<
  T extends Pick<StoredItem, 'type' | 'prompt' | 'maxMarks' | 'coIds'> & {
    bloomLevel?: string | null;
    difficulty?: string | null;
    topic?: string | null;
    negativeMarks?: number | null;
    partialCredit?: boolean | null;
    explanation?: unknown;
    options?: unknown;
    answer?: unknown;
    rubric?: unknown;
    template?: string | null;
    blanks?: unknown;
    pairs?: unknown;
    code?: unknown;
  },
>(doc: T) {
  return {
    type: doc.type,
    prompt: doc.prompt,
    maxMarks: doc.maxMarks,
    coIds: doc.coIds,
    bloomLevel: doc.bloomLevel,
    difficulty: doc.difficulty,
    topic: doc.topic,
    negativeMarks: doc.negativeMarks,
    partialCredit: doc.partialCredit,
    explanation: doc.explanation,
    options: doc.options,
    answer: doc.answer,
    rubric: doc.rubric,
    template: doc.template,
    blanks: doc.blanks,
    pairs: doc.pairs,
    code: doc.code,
  };
}

export const paragraph = (text: string): RichTextDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

// A bank CSV row (06 §8.6) as its dialog would have posted it; `coIds` are its CO codes already matched.
export function csvItem(row: BankCsvRow, coIds: string[]): ItemInput {
  return {
    type: row.type,
    prompt: paragraph(row.question),
    maxMarks: row.maxMarks,
    coIds,
    bloomLevel: row.bloomLevel,
    difficulty: row.difficulty,
    topic: row.topic,
    negativeMarks: row.negativeMarks,
    partialCredit: false,
    explanation: null,
    options: row.options,
    key: row.correct
      ? { correct: row.correct }
      : row.truth !== null
        ? { truth: row.truth }
        : row.value !== null
          ? { value: row.value, tolerance: row.tolerance }
          : null,
    rubric: null,
    template: null,
    blanks: null,
    pairs: null,
    code: null,
  };
}
