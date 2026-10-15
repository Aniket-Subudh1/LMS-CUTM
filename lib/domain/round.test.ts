import { describe, expect, it } from 'vitest';
import { ceilTo, roundHalfUp } from './round';

describe('roundHalfUp', () => {
  it.each([
    [1.005, 2, 1.01],
    [2.675, 2, 2.68],
    [37.5, 0, 38],
    [37.4999, 0, 37],
    [37.01, 0, 37],
    [0.1 + 0.2, 2, 0.3],
    [14.999999999999998, 2, 15],
    [-1.005, 2, -1.01],
  ])('roundHalfUp(%d, %d) = %d', (value, decimals, expected) => {
    expect(roundHalfUp(value, decimals)).toBe(expected);
  });
});

describe('ceilTo', () => {
  it.each([
    [1.005, 2, 1.01],
    [2.675, 2, 2.68],
    [37.5, 0, 38],
    [37.4999, 0, 38],
    [37.01, 0, 38],
    [0.1 + 0.2, 2, 0.3],
    [14.999999999999998, 2, 15],
    [89.8, 0, 90],
    [90, 0, 90],
  ])('ceilTo(%d, %d) = %d', (value, decimals, expected) => {
    expect(ceilTo(value, decimals)).toBe(expected);
  });
});
