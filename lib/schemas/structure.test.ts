import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CreateSchemeVersion, SaveCoMap, SaveProgramOutcomes, SaveTerm } from './structure';

const id = 'a'.repeat(24);

describe('CreateSchemeVersion', () => {
  const form = {
    componentKey: 'theory+practice',
    name: 'Theory + practice',
    internalMax: '50',
    externalMax: '50',
    decimals: '0',
    roundingMode: 'half_up',
    key_0: 'quiz',
    label_0: 'Quizzes',
    weight_0: '15',
    'modes_0[]': ['quiz'],
    aggregation_0: 'average',
    bestN_0: '',
    key_1: 'assignment',
    label_1: 'Assignments',
    weight_1: '10',
    'modes_1[]': ['assignment'],
    aggregation_1: 'best_n',
    bestN_1: '2',
    // rows 2-9 left blank by the form
    aggregation_2: 'average',
  };

  it('collects the filled rows of the fixed grid and ignores empty ones', () => {
    const parsed = CreateSchemeVersion.safeParse(form);
    expect(parsed.success && parsed.data.components).toEqual([
      { key: 'quiz', label: 'Quizzes', weight: 15, modes: ['quiz'], aggregation: 'average', bestN: undefined },
      { key: 'assignment', label: 'Assignments', weight: 10, modes: ['assignment'], aggregation: 'best_n', bestN: 2 },
    ]);
  });

  it('refuses an empty grid and a non-canonical component key', () => {
    expect(
      CreateSchemeVersion.safeParse({
        ...form,
        key_0: '',
        label_0: '',
        weight_0: '',
        key_1: '',
        label_1: '',
        weight_1: '',
      }).success,
    ).toBe(false);
    expect(CreateSchemeVersion.safeParse({ ...form, componentKey: 'practice+theory' }).success).toBe(false);
  });
});

describe('SaveProgramOutcomes', () => {
  it('keeps rows that have a code, upper-cases codes and rejects duplicates', () => {
    const ok = SaveProgramOutcomes.safeParse({
      programId: id,
      po_code_0: 'po1',
      po_title_0: 'Engineering knowledge',
      po_description_0: '',
      pso_code_0: 'PSO1',
      pso_title_0: 'Higher education',
    });
    expect(ok.success && ok.data.pos).toEqual([
      { code: 'PO1', title: 'Engineering knowledge', description: undefined },
    ]);

    const duplicate = SaveProgramOutcomes.safeParse({
      programId: id,
      po_code_0: 'PO1',
      po_title_0: 'A',
      po_code_1: 'PO1',
      po_title_1: 'B',
    });
    expect(duplicate.success).toBe(false);
    expect(duplicate.success ? [] : z.flattenError(duplicate.error).fieldErrors.pos).toEqual([
      'Each PO code can appear once.',
    ]);
  });
});

describe('SaveCoMap', () => {
  it('accepts empty cells and levels 1-3 only', () => {
    expect(SaveCoMap.safeParse({ courseId: id, 'cell[]': ['', `${id}:PO1:3`, `${id}:PSO2:1`] }).success).toBe(true);
    expect(SaveCoMap.safeParse({ courseId: id, 'cell[]': [`${id}:PO1:4`] }).success).toBe(false);
    expect(SaveCoMap.safeParse({ courseId: id, 'cell[]': [`${id}:PO1:0`] }).success).toBe(false);
  });
});

describe('SaveTerm', () => {
  const term = {
    code: '2026-odd',
    name: 'Odd 2026',
    academicYear: '2026-27',
    startsOn: '2026-07-15',
    endsOn: '2026-12-20',
    status: 'upcoming',
  };

  it('upper-cases the code and needs the start before the end', () => {
    const ok = SaveTerm.safeParse(term);
    expect(ok.success && ok.data.code).toBe('2026-ODD');
    expect(SaveTerm.safeParse({ ...term, endsOn: '2026-07-15' }).success).toBe(false);
    expect(SaveTerm.safeParse({ ...term, startsOn: '2026-02-30' }).success).toBe(false);
  });
});
