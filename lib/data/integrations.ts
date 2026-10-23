import 'server-only';
import { requireViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { STALE_RUN_MS } from '@/lib/data/imports';
import { githubConfigured, installUrl } from '@/lib/integrations/github';
import { Batch } from '@/lib/models/batch';
import { Project } from '@/lib/models/project';
import { SyncRun } from '@/lib/models/sync-run';
import { User } from '@/lib/models/user';
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
  examRuns: {
    id: string;
    kind: (typeof EXAM_KINDS)[number];
    batch: { id: string; name: string } | null;
    termId: string | null;
    at: Date;
    by: string;
    status: 'running' | 'stopped' | 'succeeded' | 'partial' | 'failed';
    stats: { rows: number | null; applied: number; skipped: number; failed: number };
  }[];
};

// M08 T8: the exchange with the exam section, bulk locks and grade-sheet runs.
const EXAM_KINDS = [
  'exam_push_csv',
  'exam_pull_csv',
  'exam_push_api',
  'exam_pull_api',
  'marks_lock',
  'grade_sheets',
] as const;
const isExamKind = (kind: string): kind is (typeof EXAM_KINDS)[number] => EXAM_KINDS.some((k) => k === kind);

// M07 T9 (P5): what the LMS talks to and the background work that ran out of tries, for admins.
export async function getIntegrations(): Promise<IntegrationsView> {
  await requireViewer(['admin']);
  await db();
  const ready = githubConfigured();
  const [linked, failing, runs, failed, examRuns] = await Promise.all([
    Project.countDocuments({ repo: { $ne: null } }),
    Project.find({ 'repo.syncError': { $type: 'string' } }, { offeringId: 1, title: 1, repo: 1 })
      .limit(50)
      .lean(),
    SyncRun.find({ kind: 'github' }, { status: 1 }).sort({ startedAt: -1 }).limit(50).lean(),
    Promise.all(QUEUE_NAMES.map(async (name) => ({ name, jobs: await queueOf(name).getFailed(0, 19) }))),
    SyncRun.find(
      { kind: { $in: EXAM_KINDS } },
      { kind: 1, batchId: 1, termId: 1, startedAt: 1, updatedAt: 1, actorId: 1, status: 1, stats: 1 },
    )
      .sort({ startedAt: -1 })
      .limit(50)
      .lean(),
  ]);
  const [batches, actors] = await Promise.all([
    Batch.find({ _id: { $in: examRuns.flatMap((r) => r.batchId ?? []) } }, { name: 1 }).lean(),
    User.find({ _id: { $in: examRuns.flatMap((r) => r.actorId ?? []) } }, { name: 1 }).lean(),
  ]);
  const batchOf = new Map(batches.map((b) => [String(b._id), b.name]));
  const actorOf = new Map(actors.map((a) => [String(a._id), a.name]));
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
    examRuns: examRuns.flatMap(({ kind, ...run }) =>
      isExamKind(kind)
        ? [
            {
              id: String(run._id),
              kind,
              batch: run.batchId ? { id: String(run.batchId), name: batchOf.get(String(run.batchId)) ?? '—' } : null,
              termId: run.termId ? String(run.termId) : null,
              at: run.startedAt,
              by: actorOf.get(String(run.actorId)) ?? 'an administrator',
              status:
                run.status === 'running' && Date.now() - run.updatedAt.getTime() > STALE_RUN_MS
                  ? 'stopped'
                  : run.status,
              stats: {
                rows: run.stats.rows ?? null,
                applied: run.stats.applied,
                skipped: run.stats.skipped,
                failed: run.stats.failed,
              },
            },
          ]
        : [],
    ),
  };
}
