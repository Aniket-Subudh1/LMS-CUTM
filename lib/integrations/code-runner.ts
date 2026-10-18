import 'server-only';
import { z } from 'zod';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { log } from '@/lib/log';

// 06 §4.4. Judge0 CE (reference 1.13.1; the free public server runs 1.14.0, the same API). Only this file talks to it.
// It runs code and reports what happened; comparing the output with the expected one is ours (07 §14), so no
// expected output is sent.
export type RunStatus =
  | 'accepted'
  | 'wrong_answer'
  | 'time_limit'
  | 'compile_error'
  | 'runtime_error'
  | 'internal_error';
export type RunJob = { runnerLanguageId: number; source: string; stdin: string; timeLimitSec: number; memoryKb: number };
export type RunResult = {
  status: RunStatus;
  stdout: string;
  stderr: string;
  compileOutput: string;
  timeMs: number | null;
  memoryKb: number | null;
};

// Judge0's default MAX_SUBMISSION_BATCH_SIZE; each output is cut at 64 KB.
const BATCH = 20;
const POLL_MS = 500;
const WAIT_MS = 20_000;
const OUTPUT_BYTES = 64 * 1024;

const Created = z.array(z.object({ token: z.string().min(1) }));
const Polled = z.object({
  submissions: z.array(
    z.object({
      token: z.string(),
      status: z.object({ id: z.number() }),
      stdout: z.string().nullable(),
      stderr: z.string().nullable(),
      compile_output: z.string().nullable(),
      time: z.string().nullable(),
      memory: z.number().nullable(),
    }),
  ),
});
const Languages = z.array(z.object({ id: z.number(), name: z.string() }));

const busy = () => new AppError('INTEGRATION', 'The code runner is busy. Try again in a minute.');
const encode = (text: string) => Buffer.from(text, 'utf8').toString('base64');
const decode = (text: string | null) =>
  text ? Buffer.from(text, 'base64').subarray(0, OUTPUT_BYTES).toString('utf8') : '';

// Status ids from the v1.13.1 source: 1 In Queue, 2 Processing, 3 Accepted, 4 Wrong Answer, 5 Time Limit Exceeded,
// 6 Compilation Error, 7–12 runtime errors, 13–14 internal errors.
function statusOf(id: number): RunStatus {
  if (id === 3) return 'accepted';
  if (id === 4) return 'wrong_answer';
  if (id === 5) return 'time_limit';
  if (id === 6) return 'compile_error';
  if (id >= 7 && id <= 12) return 'runtime_error';
  return 'internal_error';
}

async function call<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  const token = env().CODE_RUNNER_TOKEN;
  let response: Response;
  try {
    response = await fetch(`${env().CODE_RUNNER_URL.replace(/\/+$/, '')}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth-Token': token } : {}) },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    log.error('code runner request failed', { path: path.split('?')[0], error });
    throw busy();
  }
  const parsed = schema.safeParse(response.ok ? await response.json() : null);
  if (!parsed.success) {
    log.error('code runner answered', { path: path.split('?')[0], status: response.status });
    throw busy();
  }
  return parsed.data;
}

// Runs each job once, in batches, and waits for all of them (up to 20 s a batch).
export async function runBatch(jobs: readonly RunJob[]): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (let at = 0; at < jobs.length; at += BATCH) {
    const created = await call('/submissions/batch?base64_encoded=true', Created, {
      submissions: jobs.slice(at, at + BATCH).map((job) => ({
        source_code: encode(job.source),
        language_id: job.runnerLanguageId,
        stdin: encode(job.stdin),
        cpu_time_limit: job.timeLimitSec,
        memory_limit: job.memoryKb,
      })),
    });
    const tokens = created.map((entry) => entry.token);
    const query = `tokens=${tokens.join(',')}&base64_encoded=true&fields=token,status,stdout,stderr,compile_output,time,memory`;
    const until = Date.now() + WAIT_MS;
    for (;;) {
      await new Promise((done) => setTimeout(done, POLL_MS));
      const { submissions } = await call(`/submissions/batch?${query}`, Polled);
      if (submissions.every((s) => s.status.id !== 1 && s.status.id !== 2)) {
        const byToken = new Map(submissions.map((s) => [s.token, s]));
        for (const token of tokens) {
          const s = byToken.get(token);
          if (!s) throw busy();
          results.push({
            status: statusOf(s.status.id),
            stdout: decode(s.stdout),
            stderr: decode(s.stderr),
            compileOutput: decode(s.compile_output),
            timeMs: s.time === null ? null : Math.round(Number(s.time) * 1000),
            memoryKb: s.memory,
          });
        }
        break;
      }
      if (Date.now() > until) throw busy();
    }
  }
  return results;
}

// The runner's languages, so an administrator can check the ids in the codeRunner setting (06 §7).
export function listLanguages(): Promise<{ id: number; name: string }[]> {
  return call('/languages', Languages);
}
