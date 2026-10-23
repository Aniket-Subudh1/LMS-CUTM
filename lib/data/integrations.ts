import 'server-only';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { githubConfigured, installUrl } from '@/lib/integrations/github';
import { Project } from '@/lib/models/project';
import { SyncRun } from '@/lib/models/sync-run';
import { computeQueue, mailQueue, mediaQueue, syncQueue } from '@/lib/queue';

export const QUEUE_NAMES = ['mail', 'media', 'sync', 'compute'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];
export const queueOf = (name: QueueName) =>
  ({ mail: mailQueue, media: mediaQueue, sync: syncQueue, compute: computeQueue })[name]();

export type IntegrationsView = {
  github: { ready: boolean; installUrl: string | null; linked: number };
  failingProjects: { id: string; offeringId: string; title: string; repo: string; error: string }[];
  runs: { succeeded: number; failed: number; total: number };
  failedJobs: { queue: QueueName; id: string; name: string; reason: string; attempts: number; at: Date | null }[];
};

// M07 T9 (P5): what the LMS talks to and the background work that ran out of tries, for admins.
export async function getIntegrations(): Promise<IntegrationsView> {
  await requireViewer(['admin']);
  await db();
  const ready = githubConfigured();
  const [linked, failing, runs, failed] = await Promise.all([
    Project.countDocuments({ repo: { $ne: null } }),
    Project.find({ 'repo.syncError': { $type: 'string' } }, { offeringId: 1, title: 1, repo: 1 })
      .limit(50)
      .lean(),
    SyncRun.find({ kind: 'github' }, { status: 1 }).sort({ startedAt: -1 }).limit(50).lean(),
    Promise.all(QUEUE_NAMES.map(async (name) => ({ name, jobs: await queueOf(name).getFailed(0, 19) }))),
  ]);
  return {
    github: { ready, installUrl: ready ? installUrl() : null, linked },
    failingProjects: failing.flatMap((p) =>
      p.repo?.syncError
        ? [
            {
              id: String(p._id),
              offeringId: String(p.offeringId),
              title: p.title,
              repo: `${p.repo.owner}/${p.repo.name}`,
              error: p.repo.syncError,
            },
          ]
        : [],
    ),
    runs: {
      succeeded: runs.filter((r) => r.status === 'succeeded').length,
      failed: runs.filter((r) => r.status === 'failed').length,
      total: runs.length,
    },
    failedJobs: failed.flatMap(({ name, jobs }) =>
      jobs.flatMap((job) =>
        job?.id
          ? [
              {
                queue: name,
                id: job.id,
                name: job.name,
                reason: (job.failedReason ?? '').slice(0, 200),
                attempts: job.attemptsMade,
                at: job.finishedOn ? new Date(job.finishedOn) : null,
              },
            ]
          : [],
      ),
    ),
  };
}
