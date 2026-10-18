import { seededShuffle } from '@/lib/domain/shuffle';
import type { Difficulty } from '@/lib/schemas/assessment';

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['easy', 'medium', 'hard'];
export type Mix = Record<Difficulty, number>;

// M04b (TP-05, 07 §14): how many questions of each level a section draws. The percentages are of `count`; whole
// questions are handed out by the largest remainder, ties to the easier level. With no mix (all 0) any level will do.
export function allocate(count: number, mix: Mix): Mix | null {
  const total = DIFFICULTY_ORDER.reduce((sum, level) => sum + mix[level], 0);
  if (total === 0) return null;
  const exact = DIFFICULTY_ORDER.map((level) => (count * mix[level]) / total);
  const out = exact.map(Math.floor);
  let left = count - out.reduce((sum, n) => sum + n, 0);
  const byRemainder = DIFFICULTY_ORDER.map((_, i) => i).sort(
    (a, b) => exact[b] - out[b] - (exact[a] - out[a]) || a - b,
  );
  for (const i of byRemainder) {
    if (left === 0) break;
    out[i]++;
    left--;
  }
  return { easy: out[0], medium: out[1], hard: out[2] };
}

export type DrawRule = { count: number; mix: Mix };
export type Candidate = { id: string; difficulty: Difficulty | null };

// What a rule needs that the pool does not have, per level (or `any` without a mix). Empty when the pool suffices.
export function shortfall(
  pool: readonly Candidate[],
  rule: DrawRule,
): { level: Difficulty | 'any'; missing: number }[] {
  const need = allocate(rule.count, rule.mix);
  if (!need) return pool.length >= rule.count ? [] : [{ level: 'any', missing: rule.count - pool.length }];
  return DIFFICULTY_ORDER.flatMap((level) => {
    const have = pool.filter((c) => c.difficulty === level).length;
    return have >= need[level] ? [] : [{ level, missing: need[level] - have }];
  });
}

// One attempt's questions for a section: the same seed always draws the same questions (a reload or a regrade sees
// what the person was given). The caller checks `shortfall` first; a short pool gives what it has.
export function drawQuestions<T extends Candidate>(pool: readonly T[], rule: DrawRule, seed: string): T[] {
  const need = allocate(rule.count, rule.mix);
  if (!need) return seededShuffle(pool, seed).slice(0, rule.count);
  return DIFFICULTY_ORDER.flatMap((level) =>
    seededShuffle(
      pool.filter((c) => c.difficulty === level),
      `${seed}:${level}`,
    ).slice(0, need[level]),
  );
}

// "The bank can make N different papers": the number of distinct question sets the rules can draw, capped (a
// section of 15 from 200 is beyond any useful number). Each level's choice is C(have, need); the levels multiply.
export const PAPERS_CAP = 1_000_000;
export function distinctPapers(sections: readonly { pool: readonly Candidate[]; rule: DrawRule }[]): number {
  let product = 1;
  for (const { pool, rule } of sections) {
    const need = allocate(rule.count, rule.mix);
    const groups = need
      ? DIFFICULTY_ORDER.map((level) => [pool.filter((c) => c.difficulty === level).length, need[level]] as const)
      : [[pool.length, rule.count] as const];
    for (const [n, k] of groups) {
      if (k > n) return 0;
      product *= choose(n, k);
      if (product >= PAPERS_CAP) return PAPERS_CAP;
    }
  }
  return product;
}

function choose(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) {
    result = (result * (n - Math.min(k, n - k) + i)) / i;
    if (result >= PAPERS_CAP) return PAPERS_CAP;
  }
  return Math.round(result);
}
