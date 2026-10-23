import { z } from 'zod';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { githubConfigured, verifyWebhook } from '@/lib/integrations/github';
import { Project } from '@/lib/models/project';
import { queueGithubSync } from '@/lib/queue';

// M07 T5 (06 §3): GitHub's webhooks. A push to a linked repository queues its project's sync (debounced); every other
// event is acknowledged, so GitHub does not resend it. A body whose signature does not match is refused.
const Push = z.object({ repository: z.object({ name: z.string(), owner: z.object({ login: z.string() }) }) });

export async function POST(request: Request): Promise<Response> {
  if (!githubConfigured()) return new Response(null, { status: 404 });
  const rawBody = await request.text();
  try {
    await verifyWebhook(rawBody, request.headers.get('x-hub-signature-256') ?? '');
  } catch (error) {
    if (error instanceof AppError && error.code === 'FORBIDDEN') return new Response(null, { status: 401 });
    throw error;
  }
  if (request.headers.get('x-github-event') !== 'push') return new Response(null, { status: 200 });
  const push = Push.safeParse(JSON.parse(rawBody));
  if (!push.success) return new Response(null, { status: 200 });
  await db();
  const project = await Project.findOne(
    { 'repo.owner': push.data.repository.owner.login, 'repo.name': push.data.repository.name, status: 'active' },
    { _id: 1 },
  ).lean();
  if (project) await queueGithubSync(String(project._id));
  return new Response(null, { status: 200 });
}
