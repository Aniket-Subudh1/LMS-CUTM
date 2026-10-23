import { afterEach, describe, expect, it, vi } from 'vitest';
import { listLanguages, runBatch, type RunJob } from '@/lib/integrations/code-runner';

// 06 §4.4: the Judge0 adapter against a stand-in for its HTTP API. Each poll answers "processing" once, then the
// status ids given, one per token in order.
const encode = (text: string) => Buffer.from(text).toString('base64');
const job = (stdin: string): RunJob => ({
  runnerLanguageId: 50,
  source: 'int main() {}',
  stdin,
  timeLimitSec: 2,
  memoryKb: 128_000,
});

function judge0(statusIds: number[]) {
  const posted: { submissions: Record<string, unknown>[] }[] = [];
  const polled = new Set<string>();
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body: { submissions: Record<string, unknown>[] } = JSON.parse(String(init.body));
      const offset = posted.reduce((sum, batch) => sum + batch.submissions.length, 0);
      posted.push(body);
      return Response.json(
        body.submissions.map((_, i) => ({ token: `t${offset + i}` })),
        { status: 201 },
      );
    }
    const tokens = (new URL(url).searchParams.get('tokens') ?? '').split(',');
    const ready = polled.has(tokens[0]);
    polled.add(tokens[0]);
    return Response.json({
      submissions: tokens.map((token) => ({
        token,
        status: { id: ready ? (statusIds[Number(token.slice(1))] ?? 3) : 2 },
        stdout: encode(`${token}\n`),
        stderr: null,
        compile_output: ready && statusIds[Number(token.slice(1))] === 6 ? encode('main.c:1: error') : null,
        time: '0.012',
        memory: 3_100,
      })),
    });
  });
  vi.stubGlobal('fetch', fetch);
  return { posted, fetch };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runBatch (06 §4.4)', () => {
  it('sends base64 batches of at most 20 without expected outputs, and waits for every run', async () => {
    const { posted } = judge0([]);
    const results = await runBatch(Array.from({ length: 25 }, (_, i) => job(`${i}`)));
    expect(posted.map((batch) => batch.submissions.length)).toEqual([20, 5]);
    expect(posted[0].submissions[3]).toEqual({
      source_code: encode('int main() {}'),
      language_id: 50,
      stdin: encode('3'),
      cpu_time_limit: 2,
      memory_limit: 128_000,
    });
    expect(results).toHaveLength(25);
    expect(results[24]).toEqual({
      status: 'accepted',
      stdout: 't24\n',
      stderr: '',
      compileOutput: '',
      timeMs: 12,
      memoryKb: 3_100,
    });
  });

  it('maps the runner’s status ids', async () => {
    judge0([3, 4, 5, 6, 7, 12, 13]);
    const results = await runBatch(Array.from({ length: 7 }, (_, i) => job(`${i}`)));
    expect(results.map((r) => r.status)).toEqual([
      'accepted',
      'wrong_answer',
      'time_limit',
      'compile_error',
      'runtime_error',
      'runtime_error',
      'internal_error',
    ]);
    expect(results[3].compileOutput).toBe('main.c:1: error');
  });

  it('says the runner is busy when it does not answer or answers nonsense', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    await expect(runBatch([job('1')])).rejects.toMatchObject({ code: 'INTEGRATION' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'Too many requests' }, { status: 429 })),
    );
    await expect(runBatch([job('1')])).rejects.toMatchObject({ code: 'INTEGRATION' });
  });

  it('lists the runner’s languages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([{ id: 50, name: 'C (GCC 9.2.0)' }])),
    );
    expect(await listLanguages()).toEqual([{ id: 50, name: 'C (GCC 9.2.0)' }]);
  });
});
