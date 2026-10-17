import { describe, expect, it } from 'vitest';
import { seededShuffle } from './shuffle';

const ten = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

describe('seededShuffle', () => {
  it('gives the same order for the same seed', () => {
    expect(seededShuffle(ten, '6712a0c1e4b0a1b2c3d4e5f6')).toEqual(seededShuffle(ten, '6712a0c1e4b0a1b2c3d4e5f6'));
  });
  it('gives different orders for different seeds', () => {
    expect(seededShuffle(ten, 'attempt-1')).not.toEqual(seededShuffle(ten, 'attempt-2'));
  });
  it('keeps every item once and leaves the input alone', () => {
    const shuffled = seededShuffle(ten, 'seed');
    expect([...shuffled].sort()).toEqual(ten);
    expect(ten).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
  });
});
