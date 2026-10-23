import { describe, expect, it } from 'vitest';
import { isPermutation } from './order';

describe('isPermutation', () => {
  it.each([
    [['a', 'b', 'c'], ['c', 'a', 'b'], true],
    [['a', 'b', 'c'], ['a', 'b', 'c'], true],
    [[], [], true],
    [['a', 'b', 'c'], ['a', 'b'], false],
    [['a', 'b'], ['a', 'b', 'c'], false],
    [['a', 'b', 'c'], ['a', 'b', 'd'], false],
    [['a', 'b', 'c'], ['a', 'a', 'c'], false],
  ])('%j reordered as %j is %s', (current, proposed, expected) => {
    expect(isPermutation(current, proposed)).toBe(expected);
  });
});
