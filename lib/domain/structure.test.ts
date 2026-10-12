import { describe, expect, it } from 'vitest';
import { COMPONENT_KEYS, COMPONENTS } from '@/lib/schemas/structure';
import { componentKey, defaultOutcomes, nextCoCode, validateScheme, type SchemeDraft } from './structure';

// 07 §2 worked example: theory+practice, internal maximum 50.
const example: SchemeDraft = {
  internalMax: 50,
  components: [
    { key: 'quiz', weight: 15, modes: ['quiz'], aggregation: 'average' },
    { key: 'assignment', weight: 10, modes: ['assignment'], aggregation: 'best_n', bestN: 2 },
    { key: 'learning_record', weight: 5, modes: ['learning_record'], aggregation: 'average' },
    { key: 'lab_record', weight: 5, modes: ['lab_record'], aggregation: 'sum' },
    { key: 'lab_test', weight: 15, modes: ['lab_test', 'coding_test'], aggregation: 'average' },
  ],
};

describe('componentKey', () => {
  it.each([
    [['practice', 'theory'], 'theory+practice'],
    [['project'], 'project'],
    [['project', 'theory', 'practice'], 'theory+practice+project'],
  ])('componentKey(%j) = %s', (input, expected) => {
    expect(componentKey(input)).toBe(expected);
  });

  it('refuses an empty list', () => {
    expect(() => componentKey([])).toThrow(RangeError);
  });

  it('only ever produces a key the scheme screens list', () => {
    // Every non-empty subset of the three components, as a bit mask 1..7.
    const keys = Array.from({ length: 7 }, (_, m) => COMPONENTS.filter((_c, i) => (m + 1) & (1 << i)));
    expect(keys.map(componentKey).sort()).toEqual([...COMPONENT_KEYS].sort());
  });
});

describe('validateScheme', () => {
  it('accepts the 07 §2 example', () => {
    expect(validateScheme(example)).toEqual([]);
  });

  it('names both numbers when the weights are wrong', () => {
    const quiz10 = {
      ...example,
      components: example.components.map((c) => (c.key === 'quiz' ? { ...c, weight: 10 } : c)),
    };
    expect(validateScheme(quiz10)).toEqual(['Weights add up to 45; they must add up to 50.']);
  });

  it('does not trip over floating-point sums', () => {
    const scheme: SchemeDraft = {
      internalMax: 0.3,
      components: [
        { key: 'a', weight: 0.1, modes: ['quiz'], aggregation: 'average' },
        { key: 'b', weight: 0.2, modes: ['assignment'], aggregation: 'average' },
      ],
    };
    expect(validateScheme(scheme)).toEqual([]);
  });

  it('reports a duplicate key, a shared mode, best_n without N and empty modes', () => {
    const messages = validateScheme({
      internalMax: 40,
      components: [
        { key: 'quiz', weight: 10, modes: ['quiz'], aggregation: 'average' },
        { key: 'quiz', weight: 10, modes: ['quiz'], aggregation: 'average' },
        { key: 'tests', weight: 10, modes: ['quiz', 'written_test'], aggregation: 'best_n' },
        { key: 'empty', weight: 10, modes: [], aggregation: 'sum' },
      ],
    });
    expect(messages).toEqual([
      'The key "quiz" is used by more than one component.',
      'Component "tests" counts the best N scores, so it needs N (1 or more).',
      '"quiz" is counted in both "quiz" and "tests"; a type belongs to one component.',
      'Component "empty" needs at least one assessment type.',
    ]);
  });
});

describe('defaultOutcomes', () => {
  it('gives PO1-PO12 and the three default PSOs', () => {
    const { pos, psos } = defaultOutcomes();
    expect(pos.map((p) => p.code)).toEqual(Array.from({ length: 12 }, (_, i) => `PO${i + 1}`));
    expect(pos[0]).toEqual({ code: 'PO1', title: 'PO1' });
    expect(psos).toEqual([
      { code: 'PSO1', title: 'Higher education' },
      { code: 'PSO2', title: 'Entrepreneurship' },
      { code: 'PSO3', title: 'Placement' },
    ]);
  });
});

describe('nextCoCode', () => {
  it.each([
    [[], 'CO1'],
    [['CO1', 'CO2'], 'CO3'],
    [['CO1', 'CO3'], 'CO4'],
    [['CO10', 'CO2'], 'CO11'],
  ])('nextCoCode(%j) = %s', (existing, expected) => {
    expect(nextCoCode(existing)).toBe(expected);
  });
});
