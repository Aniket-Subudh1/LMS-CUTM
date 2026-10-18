import 'server-only';
import { testStatus } from '@/lib/domain/code';
import { runBatch } from '@/lib/integrations/code-runner';
import type { RunStatus } from '@/lib/schemas/assessment';

// What a student sees of one run of a visible test: nothing from a hidden test ever comes here (09 §10). Outputs are
// cut at 4 KB.
export type SampleRun = {
  id: string;
  status: RunStatus;
  stdout: string;
  // The compiler's message for a compile error, else the program's error output.
  error: string;
  timeMs: number | null;
  memoryKb: number | null;
};

const SHOWN = 4_000;

// TP-09 (LAB-02): "Run sample tests" — the code as it stands on a code question's visible tests (the caller passes
// only those), compared with their expected outputs (07 §14). Called by runCode once it has checked the attempt.
export async function runSamples(
  samples: readonly { _id: { toString(): string }; input: string; expected: string }[],
  limits: { runnerLanguageId: number; timeLimitSec: number; memoryKb: number },
  source: string,
): Promise<SampleRun[]> {
  const runs = await runBatch(samples.map((sample) => ({ ...limits, source, stdin: sample.input })));
  return samples.map((sample, i) => {
    const run = runs[i];
    return {
      id: sample._id.toString(),
      status: testStatus(run.status, run.stdout, sample.expected),
      stdout: run.stdout.slice(0, SHOWN),
      error: (run.status === 'compile_error' ? run.compileOutput : run.stderr).slice(0, SHOWN),
      timeMs: run.timeMs,
      memoryKb: run.memoryKb,
    };
  });
}
