// 07 §19 (M04b, TP-11): a flag for a teacher to look at, never a verdict (Q-09). Two written or code answers are alike
// when the Jaccard similarity of their three-token shingles reaches the threshold; comments, case, spacing and
// punctuation do not count, and answers shorter than MIN_TOKENS are never compared.
export const MIN_TOKENS = 20;
export const SIMILAR = 0.85;

export function tokens(text: string): string[] {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(\/\/|#)[^\n]*/g, ' ')
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean);
}

export function shingles(words: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 3 <= words.length; i++) out.add(words.slice(i, i + 3).join(' '));
  return out;
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let both = 0;
  for (const shingle of a) if (b.has(shingle)) both++;
  return both / (a.size + b.size - both);
}

// Every pair of answers at or above `threshold`, most alike first, with the similarity rounded to two places.
export function similarPairs(
  answers: readonly { id: string; text: string }[],
  threshold = SIMILAR,
): { a: string; b: string; score: number }[] {
  const sets = answers.flatMap((answer) => {
    const words = tokens(answer.text);
    return words.length >= MIN_TOKENS ? [{ id: answer.id, set: shingles(words) }] : [];
  });
  const pairs: { a: string; b: string; score: number }[] = [];
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const score = jaccard(sets[i].set, sets[j].set);
      if (score >= threshold) pairs.push({ a: sets[i].id, b: sets[j].id, score: Math.round(score * 100) / 100 });
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}
