import { describe, expect, it } from 'vitest';
import { jaccard, shingles, similarPairs, tokens } from './similarity';

const program = `#include <stdio.h>
int main(void) {
  int a, b, total;
  scanf("%d %d", &a, &b);
  total = a + b;
  printf("%d\\n", total);
  return 0;
}`;

describe('similarity (07 §19)', () => {
  it('ignores comments, case and spacing', () => {
    expect(tokens('int  A = 1; // the count\n/* note */ RETURN a;')).toEqual(['int', 'a', '1', 'return', 'a']);
  });

  it('measures the overlap of three-token shingles', () => {
    expect(jaccard(shingles(['a', 'b', 'c', 'd']), shingles(['a', 'b', 'c', 'e']))).toBeCloseTo(1 / 3);
    expect(jaccard(new Set(), new Set())).toBe(0);
  });

  it('pairs a copy with its spacing and comments changed, and not a different program', () => {
    const copy = `// my solution\n${program.replace(/  /g, '\t').toUpperCase()}`;
    const other = `#include <stdio.h>
int main(void) {
  long x; long y;
  if (scanf("%ld%ld", &x, &y) != 2) return 1;
  for (long i = 0; i < y; i++) x++;
  printf("sum is %ld\\n", x);
  return 0;
}`;
    expect(
      similarPairs([
        { id: 'a', text: program },
        { id: 'b', text: copy },
        { id: 'c', text: other },
      ]),
    ).toEqual([{ a: 'a', b: 'b', score: 1 }]);
  });

  it('never compares answers shorter than 20 tokens', () => {
    expect(
      similarPairs([
        { id: 'a', text: 'print(1)' },
        { id: 'b', text: 'print(1)' },
      ]),
    ).toEqual([]);
  });
});
