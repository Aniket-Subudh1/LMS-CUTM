import { roundHalfUp } from '@/lib/domain/round';
import type { RunStatus } from '@/lib/schemas/assessment';

// 07 §14: the runner only runs code; we compare. Line endings become \n, each line loses its trailing spaces and the
// output its trailing newlines; spaces inside a line count.
export const normalizeOutput = (text: string) =>
  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');

export const outputsMatch = (stdout: string, expected: string) => normalizeOutput(stdout) === normalizeOutput(expected);

// A test passes when the runner accepted the run and the output matches; a run it accepted with another output is a
// wrong answer; otherwise what the runner said.
export function testStatus(run: RunStatus, stdout: string, expected: string): RunStatus {
  if (run !== 'accepted') return run;
  return outputsMatch(stdout, expected) ? 'accepted' : 'wrong_answer';
}

// 07 §14: the question's marks in proportion to the weight of the tests passed.
export function codeItemMarks(maxMarks: number, tests: readonly { weight: number; passed: boolean }[]): number {
  const total = tests.reduce((sum, test) => sum + test.weight, 0);
  if (total === 0) return 0;
  const passed = tests.reduce((sum, test) => sum + (test.passed ? test.weight : 0), 0);
  return roundHalfUp((maxMarks * passed) / total, 2);
}
