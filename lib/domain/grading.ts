import { roundHalfUp } from '@/lib/domain/round';
import type { ItemType } from '@/lib/schemas/assessment';

// mcq: optionId · msq: the set optionIds · ordering: optionIds in the right order · numeric: value ± tolerance ·
// true_false: truth.
export type AnswerKey = {
  optionId?: string | null;
  optionIds?: readonly string[] | null;
  value?: number | null;
  tolerance?: number | null;
  truth?: boolean | null;
};
// fill_blank: one text per blank, in order · matching: each left side (its pair's id) and the right side chosen (a
// pair's `rightId`, which differs from its id so the page never shows which sides belong together).
export type GivenAnswer = {
  optionId?: string | null;
  optionIds?: readonly string[] | null;
  value?: number | null;
  truth?: boolean | null;
  texts?: readonly string[] | null;
  matches?: readonly { left: string; right: string }[] | null;
};
export type GradableItem = {
  type: ItemType;
  maxMarks: number;
  // M04b (TP-06): taken off when an objective question is answered wrongly; never for an unanswered one.
  negativeMarks?: number | null;
  // M04b (TP-06): msq, fill_blank, matching and ordering earn their share instead of all or nothing.
  partialCredit?: boolean | null;
  answer: AnswerKey | null;
  blanks?: readonly { accepted: readonly string[] }[] | null;
  pairs?: readonly { id: string; rightId: string }[] | null;
};

// A blank matches when it reads the same ignoring case, the spaces around it and repeated spaces inside it.
export const normalizeBlank = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

// How much of the answer is right (0–1), and whether anything was answered at all.
function judge(item: GradableItem, given: GivenAnswer | null): { right: number; answered: boolean } | null {
  const key = item.answer;
  switch (item.type) {
    case 'text':
    case 'file':
    // Code is run and marked after hand-in by the gradeCode job (codeItemMarks, lib/domain/code.ts).
    case 'code':
      return null;
    case 'mcq': {
      if (!key) return null;
      const answered = Boolean(given?.optionId);
      return { answered, right: answered && given?.optionId === key.optionId ? 1 : 0 };
    }
    case 'true_false': {
      if (!key || key.truth === null || key.truth === undefined) return null;
      const answered = given?.truth === true || given?.truth === false;
      return { answered, right: answered && given?.truth === key.truth ? 1 : 0 };
    }
    case 'numeric': {
      if (!key || key.value === null || key.value === undefined) return null;
      if (given?.value === null || given?.value === undefined) return { answered: false, right: 0 };
      // toPrecision(12) absorbs binary noise: 1.01 − 1 is 0.010000000000000009, which is within a margin of 0.01.
      const off = Number(Math.abs(given.value - key.value).toPrecision(12));
      return { answered: true, right: off <= (key.tolerance ?? 0) ? 1 : 0 };
    }
    case 'msq': {
      if (!key) return null;
      const chosen = new Set(given?.optionIds ?? []);
      const correct = new Set(key.optionIds ?? []);
      if (correct.size === 0) return null;
      const hits = [...chosen].filter((id) => correct.has(id)).length;
      const misses = chosen.size - hits;
      if (hits === correct.size && misses === 0) return { answered: true, right: 1 };
      return { answered: chosen.size > 0, right: Math.max(0, (hits - misses) / correct.size) };
    }
    case 'ordering': {
      const order = key?.optionIds ?? [];
      if (order.length === 0) return null;
      const placed = given?.optionIds ?? [];
      if (placed.length === 0) return { answered: false, right: 0 };
      return { answered: true, right: order.filter((id, i) => placed[i] === id).length / order.length };
    }
    case 'fill_blank': {
      const blanks = item.blanks ?? [];
      if (blanks.length === 0) return null;
      const texts = given?.texts ?? [];
      const answered = texts.some((text) => text.trim() !== '');
      const hits = blanks.filter((blank, i) =>
        blank.accepted.some((accepted) => normalizeBlank(accepted) === normalizeBlank(texts[i] ?? '')),
      ).length;
      return { answered, right: hits / blanks.length };
    }
    case 'matching': {
      const pairs = item.pairs ?? [];
      if (pairs.length === 0) return null;
      const chosen = new Map((given?.matches ?? []).map((m) => [m.left, m.right]));
      const hits = pairs.filter((pair) => chosen.get(pair.id) === pair.rightId).length;
      return { answered: chosen.size > 0, right: hits / pairs.length };
    }
  }
}

// 07 §14: an objective question is worth all its marks when right; with partial credit (TP-06) it earns its share of
// what is right; answered wrongly it loses its negative marks; unanswered it scores 0. Written and uploaded answers are
// marked by a person, so they return null (as does a question without a key).
export function autoGrade(item: GradableItem, given: GivenAnswer | null): number | null {
  const verdict = judge(item, given);
  if (!verdict) return null;
  if (verdict.right === 1) return item.maxMarks;
  if (item.partialCredit && verdict.right > 0) return roundHalfUp(item.maxMarks * verdict.right, 2);
  const penalty = item.negativeMarks ?? 0;
  return verdict.answered && penalty > 0 ? -penalty : 0;
}

// With a rubric, a question's marks are the total of its criteria (07 §14).
export function rubricTotal(criteriaMarks: readonly number[]): number {
  return roundHalfUp(
    criteriaMarks.reduce((sum, marks) => sum + marks, 0),
    2,
  );
}

// The attempt's total, or null while any question is unscored (07 §14). Negative marks never take it below 0
// (A-117).
export function attemptTotal(
  itemIds: readonly string[],
  scores: Readonly<Record<string, { marks: number } | undefined>>,
): number | null {
  let sum = 0;
  for (const id of itemIds) {
    const score = scores[id];
    if (!score) return null;
    sum += score.marks;
  }
  return Math.max(0, roundHalfUp(sum, 2));
}

// SKL-02 (07 §14): the mean of each published quiz's counted percentage; a quiz not attempted counts as 0.
export function quizAveragePct(quizzes: readonly { counted: number; maxMarks: number }[]): number | null {
  const marked = quizzes.filter((quiz) => quiz.maxMarks > 0);
  if (marked.length === 0) return null;
  const sum = marked.reduce((total, quiz) => total + (100 * quiz.counted) / quiz.maxMarks, 0);
  return roundHalfUp(sum / marked.length, 2);
}
