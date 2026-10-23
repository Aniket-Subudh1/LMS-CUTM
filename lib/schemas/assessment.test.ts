import { describe, expect, it } from 'vitest';
import { CreateAssessment, GradeSubmission, SaveItem, UpdateAssessmentSettings } from './assessment';

const id = (n: number) => String(n).padStart(24, 'a');
const prompt = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pick one.' }] }],
});
const base = { offeringId: id(1), assessmentId: id(2), prompt, maxMarks: '2', 'cos[]': [id(3)] };
const issues = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

describe('SaveItem', () => {
  it('skips blank option rows and names the key by its place among the filled ones', () => {
    const parsed = SaveItem.parse({ ...base, type: 'mcq', 'option[]': ['', 'float', '', '_total', ''], correct: '3' });
    expect(parsed).toMatchObject({ options: ['float', '_total'], key: { correct: [1] }, coIds: [id(3)], maxMarks: 2 });
  });

  it.each([
    ['one filled option', { type: 'mcq', 'option[]': ['only'], correct: '0' }, 'option[]: Write at least two options.'],
    ['no correct option', { type: 'mcq', 'option[]': ['a', 'b'] }, 'correct: Pick the correct option.'],
    [
      'a blank row marked correct',
      { type: 'mcq', 'option[]': ['a', 'b', ''], correct: '2' },
      'correct: Pick the correct option.',
    ],
    [
      'msq with a blank row ticked',
      { type: 'msq', 'option[]': ['a', 'b', ''], 'correct[]': ['0', '2'] },
      'correct: Tick every correct option.',
    ],
    ['an empty question', { type: 'text', prompt: '' }, 'prompt: Write the question.'],
    [
      'a criterion without marks',
      { type: 'text', 'criterion[]': ['Loop'], 'criterionMarks[]': [''] },
      'criterion[]: Row 1: give it more than 0 marks.',
    ],
  ])('refuses %s', (_, over, message) => {
    expect(issues(SaveItem.safeParse({ ...base, ...over }))).toContain(message);
  });

  it('reads several correct options, a numeric key with a default margin of 0 and a rubric', () => {
    expect(SaveItem.parse({ ...base, type: 'msq', 'option[]': ['a', 'b', 'c'], 'correct[]': ['0', '2'] }).key).toEqual({
      correct: [0, 2],
    });
    expect(SaveItem.parse({ ...base, type: 'numeric', value: '4', tolerance: '' }).key).toEqual({
      value: 4,
      tolerance: 0,
    });
    const rubric = SaveItem.parse({
      ...base,
      type: 'file',
      'criterion[]': ['Diagram', '', 'Labels'],
      'criterionMarks[]': ['1.5', '', '0.5'],
    }).rubric;
    expect(rubric).toEqual([
      { criterion: 'Diagram', maxMarks: 1.5 },
      { criterion: 'Labels', maxMarks: 0.5 },
    ]);
  });

  it('refuses a question type it does not know', () => {
    expect(SaveItem.safeParse({ ...base, type: 'code' }).success).toBe(false);
  });
});

describe('SaveItem, the M04b types (TP-06)', () => {
  it('reads true or false, blanks with their accepted answers, pairs and steps', () => {
    expect(SaveItem.parse({ ...base, type: 'true_false', truth: 'false' }).key).toEqual({ truth: false });
    expect(
      SaveItem.parse({
        ...base,
        type: 'fill_blank',
        template: 'It is ___ and ___.',
        'accepted[]': [' recursive | recursion ', 'base'],
      }).blanks,
    ).toEqual([{ accepted: ['recursive', 'recursion'] }, { accepted: ['base'] }]);
    expect(
      SaveItem.parse({ ...base, type: 'matching', 'left[]': ['Stack', '', 'Queue'], 'right[]': ['Undo', '', 'Jobs'] })
        .pairs,
    ).toEqual([
      { left: 'Stack', right: 'Undo' },
      { left: 'Queue', right: 'Jobs' },
    ]);
    expect(SaveItem.parse({ ...base, type: 'ordering', 'option[]': ['a', '', 'b'] })).toMatchObject({
      options: ['a', 'b'],
      key: { ordered: true },
    });
  });

  it.each([
    ['a sentence without a blank', { type: 'fill_blank', template: 'No blank.', 'accepted[]': [] }, 'template'],
    ['a blank that accepts nothing', { type: 'fill_blank', template: 'A ___', 'accepted[]': [' | '] }, 'accepted[]'],
    ['a pair with one side', { type: 'matching', 'left[]': ['A', 'B'], 'right[]': ['1', ''] }, 'left[]'],
    ['one step', { type: 'ordering', 'option[]': ['only'] }, 'option[]'],
    ['negative marks above the marks', { type: 'true_false', truth: 'true', negativeMarks: '3' }, 'negativeMarks'],
  ])('refuses %s', (_, over, path) => {
    expect(issues(SaveItem.safeParse({ ...base, ...over }))?.[0]).toMatch(
      new RegExp(`^${path.replace(/[[\]]/g, '\\$&')}:`),
    );
  });

  it('keeps negative marks and partial credit only where they mean something', () => {
    expect(SaveItem.parse({ ...base, type: 'text', negativeMarks: '1', partialCredit: 'true' })).toMatchObject({
      negativeMarks: 0,
      partialCredit: false,
    });
    expect(
      SaveItem.parse({ ...base, type: 'msq', 'option[]': ['a', 'b'], 'correct[]': ['0'], partialCredit: 'true' }),
    ).toMatchObject({ partialCredit: true });
  });
});

describe('SaveItem, code (TP-09)', () => {
  const code = {
    ...base,
    type: 'code',
    'language[]': ['c', 'cpp'],
    'starterLanguage[]': ['c', 'cpp', 'java'],
    'starter[]': ['int main() {\r\n}\r\n', '', 'class Main {}'],
    'caseInput[]': ['2 3\r\n', '', '10 20'],
    'caseExpected[]': ['5', '', '30'],
    'caseWeight[]': ['', '1', '2'],
    'caseHidden[]': ['2'],
  };

  it('keeps the tests that are filled in, with \\n line ends, weights and the hidden one', () => {
    expect(SaveItem.parse(code)).toMatchObject({
      negativeMarks: 0,
      code: {
        languages: ['c', 'cpp'],
        starter: [{ language: 'c', source: 'int main() {\n}\n' }],
        timeLimitSec: 2,
        memoryKb: 128_000,
        runLimit: 10,
        testCases: [
          { input: '2 3\n', expected: '5', hidden: false, weight: 1 },
          { input: '10 20', expected: '30', hidden: true, weight: 2 },
        ],
      },
    });
  });

  it.each([
    ['no language', { 'language[]': [] }, 'language[]: Tick at least one language.'],
    ['no test', { 'caseInput[]': [''], 'caseExpected[]': [''] }, 'caseExpected[]: Write at least one test.'],
    [
      'every test hidden',
      { 'caseHidden[]': ['0', '2'] },
      'caseExpected[]: Leave at least one test visible, so students can try their code on it.',
    ],
    [
      'an input without its output',
      { 'caseExpected[]': ['', '', '30'] },
      'caseExpected[]: Test 1: write the expected output.',
    ],
    ['a weight of 11', { 'caseWeight[]': ['11', '', ''] }, 'caseWeight[]: Test 1: weigh it from 1 to 10.'],
    ['a limit of 31 runs', { runLimit: '31' }, 'runLimit: Allow at most 30 runs.'],
  ])('refuses %s', (_, change, message) => {
    expect(issues(SaveItem.safeParse({ ...code, ...change }))).toEqual([message]);
  });
});

describe('assessment windows', () => {
  const create = {
    offeringId: id(1),
    mode: 'quiz',
    title: 'Quiz 2',
    opensAt: '2026-10-30T10:00',
    closesAt: '2026-10-30T11:00',
  };
  it('closes after it opens', () => {
    expect(CreateAssessment.safeParse(create).success).toBe(true);
    expect(issues(CreateAssessment.safeParse({ ...create, closesAt: '2026-10-30T10:00' }))).toEqual([
      'closesAt: Close it after it opens.',
    ]);
  });
  it('ends late hand-ins at or after closing, and reads unticked boxes as off', () => {
    const settings = { ...create, assessmentId: id(2), attemptsAllowed: '2', attemptPolicy: 'last' };
    expect(UpdateAssessmentSettings.parse({ ...settings, lateUntil: '', durationMin: '' })).toMatchObject({
      lateUntil: undefined,
      durationMin: undefined,
      shuffleItems: false,
      attemptsAllowed: 2,
    });
    expect(issues(UpdateAssessmentSettings.safeParse({ ...settings, lateUntil: '2026-10-30T10:30' }))).toEqual([
      'lateUntil: Late hand-ins end at or after the closing time.',
    ]);
  });
});

describe('counts toward (M06, Q-41)', () => {
  const create = {
    offeringId: id(1),
    mode: 'quiz',
    title: 'Mid-term 1',
    opensAt: '2026-10-30T10:00',
    closesAt: '2026-10-30T11:00',
  };
  it('takes a theory part or none, and is left out when the form has no such field', () => {
    expect(CreateAssessment.parse({ ...create, countsToward: 'midTerm1' })).toMatchObject({ countsToward: 'midTerm1' });
    expect(CreateAssessment.parse({ ...create, countsToward: 'none' })).toMatchObject({ countsToward: 'none' });
    expect(CreateAssessment.parse(create).countsToward).toBeUndefined();
    expect(CreateAssessment.safeParse({ ...create, countsToward: 'attendance' }).success).toBe(false);
  });
});

describe('GradeSubmission', () => {
  it('needs one marks and one comment field per question', () => {
    const ok = { offeringId: id(1), submissionId: id(2), 'item[]': [id(3)], 'marks[]': ['2'], 'comment[]': [''] };
    expect(GradeSubmission.safeParse(ok).success).toBe(true);
    expect(GradeSubmission.safeParse({ ...ok, 'marks[]': [] }).success).toBe(false);
  });
});
