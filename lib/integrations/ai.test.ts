import { beforeEach, describe, expect, it, vi } from 'vitest';

// M09 (06 §4.7): the two suggestions with OpenAI's client replaced, so what is asked and what is kept can be read.
vi.mock('@/lib/env', () => ({
  env: () => ({ OPENAI_API_KEY: 'sk-unit', OPENAI_MODEL: 'gpt-unit', LOG_LEVEL: 'error' }),
}));
const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock('openai', () => ({
  default: class {
    responses = { parse };
  },
}));

const { suggestCoMap, suggestItemTags } = await import('./ai');

const COS = [
  { code: 'CO1', statement: 'Explain pointers.' },
  { code: 'CO2', statement: 'Use files.' },
];

// A function returned from beforeEach would run as a teardown, so this returns nothing.
beforeEach(() => {
  parse.mockReset();
});

describe('suggestItemTags', () => {
  it('asks with the question and the outcomes only, and keeps the course’s codes', async () => {
    parse.mockResolvedValue({
      output_parsed: { coCodes: ['co2', 'CO9', 'CO1', 'CO2'], bloomLevel: 'apply', rationale: '  Reads a file.  ' },
    });
    const answer = await suggestItemTags({ promptText: 'Read a file line by line.', cos: COS });
    expect(answer).toEqual({ coCodes: ['CO2', 'CO1'], bloomLevel: 'apply', rationale: 'Reads a file.' });
    const request = parse.mock.calls[0][0];
    expect(request).toMatchObject({ model: 'gpt-unit', max_output_tokens: 2000 });
    expect(request.instructions).toMatch(/^You help university teachers tag an assessment question/);
    expect(request.input).toBe(
      'Question:\nRead a file line by line.\n\nCourse outcomes:\nCO1: Explain pointers.\nCO2: Use files.',
    );
  });

  it('is null when no code is the course’s, or when the AI gives nothing', async () => {
    parse.mockResolvedValue({ output_parsed: { coCodes: ['CO7'], bloomLevel: 'apply', rationale: 'x' } });
    expect(await suggestItemTags({ promptText: 'q', cos: COS })).toBeNull();
    parse.mockResolvedValue({ output_parsed: null });
    expect(await suggestItemTags({ promptText: 'q', cos: COS })).toBeNull();
  });

  it('turns a failed request into an integration error', async () => {
    parse.mockImplementation(async () => {
      throw new Error('socket hang up');
    });
    await expect(suggestItemTags({ promptText: 'q', cos: COS })).rejects.toMatchObject({ code: 'INTEGRATION' });
  });
});

describe('suggestCoMap', () => {
  it('is told only the titled outcomes and drops unknown codes, wrong levels and repeated pairs', async () => {
    parse.mockResolvedValue({
      output_parsed: {
        cells: [
          { co: 'CO1', outcome: 'PO1', level: 3, rationale: 'Core.' },
          { co: 'CO1', outcome: 'po1', level: 2, rationale: 'Again.' },
          { co: 'CO3', outcome: 'PO1', level: 2, rationale: 'Unknown CO.' },
          { co: 'CO2', outcome: 'PO5', level: 1, rationale: 'Untitled outcome.' },
          { co: 'CO2', outcome: 'PSO1', level: 4, rationale: 'Too high.' },
          { co: 'CO2', outcome: 'PSO1', level: 1, rationale: 'Slight.' },
        ],
      },
    });
    const cells = await suggestCoMap({
      cos: COS,
      outcomes: [
        { code: 'PO1', title: 'Engineering knowledge' },
        { code: 'PSO1', title: 'Higher education' },
      ],
    });
    expect(cells).toEqual([
      { co: 'CO1', outcome: 'PO1', level: 3, rationale: 'Core.' },
      { co: 'CO2', outcome: 'PSO1', level: 1, rationale: 'Slight.' },
    ]);
    expect(parse.mock.calls[0][0].input).toBe(
      'Course outcomes:\nCO1: Explain pointers.\nCO2: Use files.\n\nProgramme outcomes:\nPO1: Engineering knowledge\nPSO1: Higher education',
    );
  });

  it('is null when nothing is left', async () => {
    parse.mockResolvedValue({ output_parsed: { cells: [{ co: 'CO9', outcome: 'PO1', level: 2, rationale: 'x' }] } });
    expect(await suggestCoMap({ cos: COS, outcomes: [{ code: 'PO1', title: 'Knowledge' }] })).toBeNull();
  });
});
