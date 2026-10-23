import { commitStats, githubConfigured, listCommits } from '@/lib/integrations/github';
import { log } from '@/lib/log';
import { Commit } from '@/lib/models/commit';
import { Project } from '@/lib/models/project';
import { SyncRun } from '@/lib/models/sync-run';
import { User } from '@/lib/models/user';
import { queueGithubSync } from '@/lib/queue';
import type { GithubProjectJob } from '@/lib/schemas/jobs';
import { PROJECT_LIMITS } from '@/lib/schemas/projects';

// T5 (PRJ-02, PRJ-03; 06 §6): a project's new commits since its last sync, at most 500 a run (the rest next run), each
// with its line counts, attributed to the member whose linked GitHub account made it — by id, then by login. Upserted by
// sha, so running twice changes nothing. A failure is kept on the project for its page and the Integrations page.
export async function githubProject({ projectId }: GithubProjectJob): Promise<void> {
  const project = await Project.findById(projectId, { repo: 1, memberIds: 1, startsOn: 1, status: 1 }).lean();
  if (!project?.repo || project.status !== 'active' || !githubConfigured()) return;
  const { owner, name, installationId } = project.repo;
  const startedAt = new Date();
  const run = await SyncRun.create({ kind: 'github', projectId, status: 'running', startedAt });
  try {
    const listed = await listCommits({
      installationId,
      owner,
      name,
      since: project.repo.lastSyncedAt ?? project.startsOn,
    });
    const known = new Set(
      (await Commit.find({ projectId, sha: { $in: listed.map((c) => c.sha) } }, { sha: 1 }).lean()).map((c) => c.sha),
    );
    const fresh = listed.filter((c) => !known.has(c.sha));
    const batch = fresh.slice(0, PROJECT_LIMITS.commitsPerSync);
    const members = await User.find({ _id: { $in: project.memberIds } }, { github: 1 }).lean();
    const byId = new Map(members.flatMap((m) => (m.github ? [[m.github.id, m._id]] : [])));
    const byLogin = new Map(members.flatMap((m) => (m.github ? [[m.github.login.toLowerCase(), m._id]] : [])));
    for (const c of batch) {
      const stats = await commitStats({ installationId, owner, name, sha: c.sha });
      const studentId =
        (c.authorId !== null ? byId.get(c.authorId) : undefined) ??
        (c.authorLogin ? byLogin.get(c.authorLogin.toLowerCase()) : undefined) ??
        null;
      await Commit.updateOne(
        { projectId, sha: c.sha },
        {
          $set: {
            authorLogin: c.authorLogin,
            authorId: c.authorId,
            studentId,
            committedAt: c.committedAt,
            message: c.message,
            additions: stats.additions,
            deletions: stats.deletions,
            isMerge: c.parents > 1,
          },
        },
        { upsert: true },
      );
    }
    const done = fresh.length <= PROJECT_LIMITS.commitsPerSync;
    await Project.updateOne(
      { _id: projectId },
      { $set: { ...(done ? { 'repo.lastSyncedAt': startedAt } : {}), 'repo.syncError': null } },
    );
    await SyncRun.updateOne(
      { _id: run._id },
      {
        $set: {
          status: 'succeeded',
          finishedAt: new Date(),
          'stats.rows': listed.length,
          'stats.applied': batch.length,
          'stats.skipped': listed.length - fresh.length,
        },
      },
    );
    log.info('github synced', { projectId, listed: listed.length, applied: batch.length });
    // More than one run's worth: the next run picks up where this one stopped.
    if (!done) await queueGithubSync(projectId);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'The sync failed.';
    await Project.updateOne({ _id: projectId }, { $set: { 'repo.syncError': message } });
    await SyncRun.updateOne(
      { _id: run._id },
      { $set: { status: 'failed', finishedAt: new Date() }, $push: { failures: { key: 'sync', message } } },
    );
    throw error;
  }
}

// The nightly scheduler `githubNightly` (02 §8): a safety net under the webhook's syncs.
export async function githubNightly(): Promise<void> {
  if (!githubConfigured()) return;
  const projects = Project.find({ mode: 'github', status: 'active', repo: { $ne: null } }, { _id: 1 })
    .lean()
    .cursor();
  let queued = 0;
  for await (const project of projects) {
    await queueGithubSync(String(project._id));
    queued += 1;
  }
  log.info('github syncs queued', { projects: queued });
}
