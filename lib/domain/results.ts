import { roundHalfUp } from '@/lib/domain/round';

// 07 §19 (M04b, TP-11): what a test's results say about each taker and each question.

// Competition ranking (equal totals share a rank; 1, 2, 2, 4), and the percentile as the share of takers below plus
// half of those level, rounded to a whole number.
export function rankAll(
  totals: readonly { id: string; total: number }[],
): Map<string, { rank: number; percentile: number }> {
  const sorted = [...totals].sort((a, b) => b.total - a.total);
  const n = sorted.length;
  const out = new Map<string, { rank: number; percentile: number }>();
  sorted.forEach((row) => {
    const above = sorted.filter((other) => other.total > row.total).length;
    const level = sorted.filter((other) => other.total === row.total).length;
    const below = n - above - level;
    out.set(row.id, { rank: above + 1, percentile: Math.round((100 * (below + 0.5 * level)) / n) });
  });
  return out;
}

// The first band (highest first) whose minimum the percentage reaches; null without bands or below them all.
export function bandOf(pct: number, bands: readonly { label: string; minPct: number }[]): string | null {
  return [...bands].sort((a, b) => b.minPct - a.minPct).find((band) => pct >= band.minPct)?.label ?? null;
}

// Ten bins of 10 percentage points; 100 % falls in the last.
export function histogram(pcts: readonly number[]): number[] {
  const bins = Array.from({ length: 10 }, () => 0);
  for (const pct of pcts) bins[Math.min(9, Math.max(0, Math.floor(pct / 10)))]++;
  return bins;
}

export type ItemRow = {
  // The taker's percentage on the whole test, which orders the upper and lower groups.
  pct: number;
  // Per question the taker had: the share of its marks earned (0–1) and, for a one-answer question, the option chosen.
  items: Readonly<Record<string, { earned: number; picked: string | null } | undefined>>;
};

export type ItemStat = {
  n: number;
  // Takers who earned all its marks.
  correctPct: number;
  // Upper 27 % minus lower 27 % of the share correct; null with fewer than 10 takers of it.
  discrimination: number | null;
  // The wrong option picked most (its id), and by how many of the question's takers; null when none was.
  wrongPick: { optionId: string; pct: number } | null;
};

// Classical item analysis: difficulty as the share who got it right, discrimination by the 27 % upper and lower
// groups, and the most picked wrong option. `rightOf` names a question's right option, where it has one.
export function itemStats(rows: readonly ItemRow[], rightOf: (key: string) => string | null): Map<string, ItemStat> {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row.items)))];
  const out = new Map<string, ItemStat>();
  for (const key of keys) {
    const takers = rows
      .flatMap((row) => {
        const item = row.items[key];
        return item ? [{ pct: row.pct, ...item }] : [];
      })
      .sort((a, b) => b.pct - a.pct);
    const n = takers.length;
    const right = (group: typeof takers) => group.filter((t) => t.earned >= 1).length / group.length;
    const cut = Math.round(n * 0.27);
    const discrimination =
      n >= 10 && cut > 0 ? roundHalfUp(right(takers.slice(0, cut)) - right(takers.slice(n - cut)), 2) : null;
    const correct = rightOf(key);
    const wrong = new Map<string, number>();
    for (const t of takers) {
      if (t.picked && t.picked !== correct && t.earned < 1) wrong.set(t.picked, (wrong.get(t.picked) ?? 0) + 1);
    }
    const [top] = [...wrong].sort((a, b) => b[1] - a[1]);
    out.set(key, {
      n,
      correctPct: Math.round(100 * right(takers)),
      discrimination,
      wrongPick: top ? { optionId: top[0], pct: Math.round((100 * top[1]) / n) } : null,
    });
  }
  return out;
}

export const difficultyLabel = (correctPct: number) =>
  correctPct < 20
    ? 'very hard'
    : correctPct < 40
      ? 'hard'
      : correctPct > 90
        ? 'very easy'
        : correctPct > 80
          ? 'easy'
          : null;

export const discriminationLabel = (d: number | null) =>
  d === null ? null : d < 0.2 ? 'weak' : d >= 0.4 ? 'strong' : null;

// The marks earned and possible per group a question belongs to (a section, an outcome); a question with several
// outcomes counts towards each.
export function breakdown(
  items: readonly { groups: readonly string[]; maxMarks: number; marks: number | null }[],
): Map<string, { marks: number; maxMarks: number }> {
  const out = new Map<string, { marks: number; maxMarks: number }>();
  for (const item of items) {
    for (const group of item.groups) {
      const sum = out.get(group) ?? { marks: 0, maxMarks: 0 };
      out.set(group, {
        marks: roundHalfUp(sum.marks + Math.max(0, item.marks ?? 0), 2),
        maxMarks: roundHalfUp(sum.maxMarks + item.maxMarks, 2),
      });
    }
  }
  return out;
}
