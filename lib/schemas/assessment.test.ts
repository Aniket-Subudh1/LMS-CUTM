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

describe('GradeSubmission', () => {
  it('needs one marks and one comment field per question', () => {
    const ok = { offeringId: id(1), submissionId: id(2), 'item[]': [id(3)], 'marks[]': ['2'], 'comment[]': [''] };
    expect(GradeSubmission.safeParse(ok).success).toBe(true);
    expect(GradeSubmission.safeParse({ ...ok, 'marks[]': [] }).success).toBe(false);
  });
});
