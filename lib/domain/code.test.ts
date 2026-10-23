import { describe, expect, it } from 'vitest';
import type { RunStatus } from '@/lib/schemas/assessment';
import { codeItemMarks, normalizeOutput, outputsMatch, testStatus } from './code';

describe('outputsMatch (07 §14)', () => {
  it.each([
    ['5\n', '5', true],
    ['1 2 \n3\r\n', '1 2\n3', true],
    ['5', '6', false],
    ['a b', 'a  b', false],
    ['YES\n\n\n', 'YES', true],
    ['\nYES', 'YES', false],
  ])('%j against %j → %s', (stdout, expected, match) => {
    expect(outputsMatch(stdout, expected)).toBe(match);
  });
  it('keeps blank lines inside the output', () => {
    expect(normalizeOutput('a\n\nb  \n')).toBe('a\n\nb');
  });
});

describe('testStatus (07 §14)', () => {
  it.each<[RunStatus, string, string, RunStatus]>([
    ['accepted', '5\n', '5', 'accepted'],
    ['accepted', '4\n', '5', 'wrong_answer'],
    ['time_limit', '', '5', 'time_limit'],
    ['compile_error', '', '5', 'compile_error'],
    ['runtime_error', '5', '5', 'runtime_error'],
  ])('%s with %j for %j → %s', (run, stdout, expected, status) => {
    expect(testStatus(run, stdout, expected)).toBe(status);
  });
});

describe('codeItemMarks (07 §14)', () => {
  const tests = (passed: boolean[], weights = [1, 1, 2]) =>
    weights.map((weight, i) => ({ weight, passed: passed[i] ?? false }));
  it.each([
    ['weights 1, 1, 2; the first and third pass', 10, tests([true, false, true]), 7.5],
    ['none pass', 10, tests([false, false, false]), 0],
    ['all pass', 10, tests([true, true, true]), 10],
    ['a third of 5 marks', 5, tests([true, false, false], [1, 1, 1]), 1.67],
    ['no tests', 5, [], 0],
  ])('%s → %d', (_, maxMarks, cases, marks) => {
    expect(codeItemMarks(maxMarks, cases)).toBe(marks);
  });
});
