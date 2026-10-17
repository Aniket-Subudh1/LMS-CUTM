import { roundHalfUp } from '@/lib/domain/round';
import type { ItemType } from '@/lib/schemas/assessment';

export type AnswerKey = {
  optionId?: string | null;
  optionIds?: readonly string[] | null;
  value?: number | null;
  tolerance?: number | null;
};
export type GivenAnswer = { optionId?: string | null; optionIds?: readonly string[] | null; value?: number | null };

// 07 §14: objective questions are all or nothing; an unanswered one scores 0. Written and uploaded answers are marked
// by a person, so they return null.
export function autoGrade(
  item: { type: ItemType; maxMarks: number; answer: AnswerKey | null },
  given: GivenAnswer | null,
): number | null {
  const key = item.answer;
  if (item.type === 'text' || item.type === 'file' || !key) return null;
  if (item.type === 'mcq') return given?.optionId && given.optionId === key.optionId ? item.maxMarks : 0;
  if (item.type === 'msq') {
    const chosen = new Set(given?.optionIds ?? []);
    const correct = new Set(key.optionIds ?? []);
    const same = chosen.size === correct.size && [...correct].every((id) => chosen.has(id));
    return same ? item.maxMarks : 0;
  }
  if (given?.value === null || given?.value === undefined || key.value === null || key.value === undefined) return 0;
  // toPrecision(12) absorbs binary noise: 1.01 − 1 is 0.010000000000000009, which is within a margin of 0.01.
  const off = Number(Math.abs(given.value - key.value).toPrecision(12));
  return off <= (key.tolerance ?? 0) ? item.maxMarks : 0;
}

// With a rubric, a question's marks are the total of its criteria (07 §14).
export function rubricTotal(criteriaMarks: readonly number[]): number {
  return roundHalfUp(
    criteriaMarks.reduce((sum, marks) => sum + marks, 0),
    2,
  );
}

// The attempt's total, or null while any question is unscored (07 §14).
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
  return roundHalfUp(sum, 2);
}

// SKL-02 (07 §14): the mean of each published quiz's counted percentage; a quiz not attempted counts as 0.
export function quizAveragePct(quizzes: readonly { counted: number; maxMarks: number }[]): number | null {
  const marked = quizzes.filter((quiz) => quiz.maxMarks > 0);
  if (marked.length === 0) return null;
  const sum = marked.reduce((total, quiz) => total + (100 * quiz.counted) / quiz.maxMarks, 0);
  return roundHalfUp(sum / marked.length, 2);
}
