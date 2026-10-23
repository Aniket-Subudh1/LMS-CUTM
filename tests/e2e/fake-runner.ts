import { createServer } from 'node:http';

// M05 T9 / M04b phase D: a stand-in for Judge0's batch API (06 §4.4) on Judge0's port, for the e2e run — CI cannot run
// Judge0 itself, and the tests must not depend on a server on the internet. Every run is accepted and prints its
// input, so a test whose expected output equals its input passes.
type Run = { token: string; stdin: string | null };
const runs = new Map<string, Run>();

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const send = (status: number, body: unknown) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (request.method === 'GET' && url.pathname === '/languages') {
    send(200, [
      { id: 50, name: 'C (GCC 9.2.0)' },
      { id: 54, name: 'C++ (GCC 9.2.0)' },
      { id: 62, name: 'Java (OpenJDK 13.0.1)' },
    ]);
    return;
  }
  if (request.method === 'POST' && url.pathname === '/submissions/batch') {
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString()));
    request.on('end', () => {
      const { submissions }: { submissions: { stdin?: string | null }[] } = JSON.parse(body);
      send(
        201,
        submissions.map((submission) => {
          const run = { token: crypto.randomUUID(), stdin: submission.stdin ?? null };
          runs.set(run.token, run);
          return { token: run.token };
        }),
      );
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/submissions/batch') {
    const tokens = (url.searchParams.get('tokens') ?? '').split(',');
    send(200, {
      submissions: tokens.map((token) => ({
        token,
        status: { id: runs.has(token) ? 3 : 13 },
        stdout: runs.get(token)?.stdin ?? null,
        stderr: null,
        compile_output: null,
        time: '0.001',
        memory: 1_000,
      })),
    });
    return;
  }
  send(404, { error: 'Not found' });
});

server.listen(2358, () => console.log('fake runner listening on 2358'));
