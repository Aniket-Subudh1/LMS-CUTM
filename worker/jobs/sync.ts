import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose, { Types } from 'mongoose';
import { writeAudit } from '@/lib/audit';
import { isDuplicateKey } from '@/lib/db';
import { formatCredits, mergeCos, normalizePersonName, normalizeTitle } from '@/lib/domain/catalog';
import { normalizeCourseware, type ImportedCourse } from '@/lib/domain/courseware';
import { coursewareUrl, fetchCoursePage, listCourseIds } from '@/lib/integrations/courseware';
import { log } from '@/lib/log';
import { Course } from '@/lib/models/course';
import { SyncRun } from '@/lib/models/sync-run';
import { User } from '@/lib/models/user';
import { syncQueue } from '@/lib/queue';
import { CATALOG_LIMITS } from '@/lib/schemas/structure';
import { CoursewareListJob, CoursewarePageJob, GithubNightlyJob, GithubProjectJob } from '@/lib/schemas/jobs';
import { githubNightly, githubProject } from './github';

type SyncData = CoursewareListJob | CoursewarePageJob | GithubProjectJob | GithubNightlyJob;
type SyncJob = Job<SyncData, void, 'coursewareList' | 'coursewarePage' | 'githubProject' | 'githubNightly'>;
type Outcome = 'applied' | 'skipped';

const MAX_FAILURES = 500;

// A run is finished once the listing is complete and every listed page is counted (05 §7.4).
async function finishIfDone(runId: string): Promise<void> {
  const run = await SyncRun.findById(runId, { status: 1, stats: 1, listedAt: 1 }).lean();
  if (!run || run.status !== 'running' || !run.listedAt || run.stats.rows === null || run.stats.rows === undefined) {
    return;
  }
  const { rows, applied, skipped, failed } = run.stats;
  if (applied + skipped + failed < rows) return;
  const status = failed === 0 ? 'succeeded' : failed >= rows ? 'failed' : 'partial';
  await SyncRun.updateOne({ _id: runId, status: 'running' }, { $set: { status, finishedAt: new Date() } });
}

async function count(runId: string, outcome: Outcome): Promise<void> {
  await SyncRun.updateOne({ _id: runId }, { $inc: { [`stats.${outcome}`]: 1 } });
  await finishIfDone(runId);
}

// A failure is counted once per page, however often its job is retried.
async function recordFailure(runId: string, key: string, message: string): Promise<void> {
  await SyncRun.updateOne(
    { _id: runId, 'failures.key': { $ne: key } },
    {
      $push: { failures: { $each: [{ key, message: message.slice(0, 500) }], $slice: MAX_FAILURES } },
      $inc: { 'stats.failed': 1 },
    },
  );
  await finishIfDone(runId);
}

// One page of the courseware listing: queue its course pages, then the next listing page.
async function listPage({ syncRunId, mode, page }: CoursewareListJob): Promise<void> {
  const run = await SyncRun.findById(syncRunId, { status: 1 }).lean();
  if (run?.status !== 'running') return;
  const { ids, lastPage } = await listCourseIds(page);
  const bound = new Set(
    mode === 'new'
      ? (await Course.distinct('source.coursewareId', { 'source.coursewareId': { $in: ids } })).filter(
          (id): id is number => typeof id === 'number',
        )
      : [],
  );
  const queued = ids.filter((id) => !bound.has(id));
  // Counted before the jobs exist, so a fast page can never finish the run early.
  await SyncRun.updateOne({ _id: syncRunId }, { $inc: { 'stats.rows': queued.length } });
  await syncQueue().addBulk(
    queued.map((coursewareId) => ({
      name: 'coursewarePage' as const,
      data: { syncRunId, coursewareId, force: false },
      opts: { jobId: `cw-${syncRunId}-${coursewareId}` },
    })),
  );
  if (ids.length > 0 && page < lastPage) {
    await syncQueue().add(
      'coursewareList',
      { syncRunId, mode, page: page + 1 },
      { jobId: `cw-list-${syncRunId}-${page + 1}` },
    );
    return;
  }
  await SyncRun.updateOne({ _id: syncRunId }, { $set: { listedAt: new Date() } });
  await finishIfDone(syncRunId);
}

const contentOf = (c: ImportedCourse) => ({
  objectives: c.objectives,
  cos: c.cos,
  coMap: c.coMap,
  modules: c.modules,
  projects: c.projects,
  textbooks: c.textbooks,
  references: c.references,
  sessionPlan: c.sessionPlan,
});
const hashOf = (c: ImportedCourse) =>
  createHash('sha256')
    .update(JSON.stringify(contentOf(c)))
    .digest('hex');

// The course this page belongs to: the one already bound to it, else the one with its code, else the only course
// whose title is the same.
async function match(coursewareId: number, imported: ImportedCourse) {
  const fields = {
    code: 1,
    title: 1,
    credits: 1,
    type: 1,
    cos: 1,
    source: 1,
    contentEditedAt: 1,
    coordinatorId: 1,
    issues: 1,
  };
  const bound = await Course.findOne({ 'source.coursewareId': coursewareId }, fields).lean();
  if (bound) return bound;
  if (imported.code) {
    const byCode = await Course.findOne({ code: imported.code }, fields).lean();
    if (byCode) return byCode;
  }
  const key = normalizeTitle(imported.title);
  if (!key) return null;
  const similar = await Course.find({ $text: { $search: key } }, { ...fields, score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(50)
    .lean();
  const same = similar.filter((c) => normalizeTitle(c.title) === key);
  return same.length === 1 ? same[0] : null;
}

// The coordinator is prefilled only when exactly one faculty member has the page's faculty name (Q-48).
async function coordinatorFor(name: string | null): Promise<Types.ObjectId | null> {
  const key = name ? normalizePersonName(name) : '';
  if (!key) return null;
  const found = await User.find({ roles: 'faculty', status: { $ne: 'disabled' }, $text: { $search: key } }, { name: 1 })
    .limit(20)
    .lean();
  const same = found.filter((u) => normalizePersonName(u.name) === key);
  return same.length === 1 ? same[0]._id : null;
}

const withIssue = (issues: readonly string[], issue: string) =>
  [...issues.filter((i) => i !== issue), issue].slice(-CATALOG_LIMITS.issues);

async function importPage({ syncRunId, coursewareId, force }: CoursewarePageJob): Promise<void> {
  const run = await SyncRun.findById(syncRunId, { status: 1, actorId: 1 }).lean();
  if (run?.status !== 'running') return;
  const key = `course/${coursewareId}`;
  const page = await fetchCoursePage(coursewareId);
  if (!page) return recordFailure(syncRunId, key, `There is no courseware page ${coursewareId}.`);
  const imported = normalizeCourseware(page);
  const hash = hashOf(imported);
  const url = coursewareUrl(`/course/${coursewareId}`);
  let course = await match(coursewareId, imported);

  if (!course) {
    if (!imported.code) {
      return recordFailure(
        syncRunId,
        key,
        `"${imported.title}" has no course code, and no single catalogue course has that title.`,
      );
    }
    if (!imported.credits) {
      return recordFailure(syncRunId, key, `${imported.code} is not in the catalogue and its page gives no credits.`);
    }
    // A course the course list does not have yet: a draft for an admin to check. Another page with the same code
    // may have created it a moment ago, which is as good.
    try {
      await Course.create({
        code: imported.code,
        title: imported.title.slice(0, 160),
        type: imported.type,
        credits: imported.credits,
        status: 'draft',
        issues: [`Not in the course list: created from courseware page ${coursewareId}.`],
        reviewNeeded: true,
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    course = await match(coursewareId, imported);
    if (!course) return recordFailure(syncRunId, key, `${imported.code} could not be created.`);
  }

  const counted = course.source?.lastRunId?.equals(syncRunId) ?? false;
  const done = (outcome: Outcome) => (counted ? finishIfDone(syncRunId) : count(syncRunId, outcome));

  // Two pages for one course: the first binding wins; an admin rebinds with a forced re-import (A-57).
  if (course.source && course.source.coursewareId !== coursewareId && !force) {
    await Course.updateOne(
      { _id: course._id },
      {
        $set: {
          issues: withIssue(
            course.issues,
            `Courseware also has page ${coursewareId} for this course; it was not imported.`,
          ),
          reviewNeeded: true,
        },
      },
    );
    return done('skipped');
  }

  const source = {
    coursewareId,
    url,
    importedAt: new Date(),
    contentHash: hash,
    facultyName: imported.facultyName,
    lastRunId: new Types.ObjectId(syncRunId),
  };
  const edited = Boolean(course.contentEditedAt) && !force;
  if (edited || (!force && course.source?.contentHash === hash)) {
    const changed = edited && course.source?.contentHash !== hash;
    await Course.updateOne(
      { _id: course._id, $or: [{ source: null }, { 'source.coursewareId': coursewareId }] },
      {
        $set: {
          'source.lastRunId': source.lastRunId,
          ...(course.source ? {} : { source }),
          ...(changed
            ? {
                issues: withIssue(
                  course.issues,
                  'The courseware page changed after this course was edited here; the changes were not applied.',
                ),
                reviewNeeded: true,
              }
            : {}),
        },
      },
    );
    return done('skipped');
  }

  // CO ids are kept by code, so calendar rows (and later question tags) still point at the same outcome.
  const cos = mergeCos(course.cos, imported.cos, () => new Types.ObjectId());
  const idOf = new Map(cos.map((co) => [co.code, co._id]));
  const coMap = imported.coMap.flatMap((cell) => {
    const coId = idOf.get(cell.co);
    return coId ? [{ coId, outcome: cell.outcome, level: cell.level }] : [];
  });
  const issues = [...imported.issues];
  if (imported.credits && !isDeepStrictEqual({ ...imported.credits }, { ...course.credits })) {
    issues.push(
      `The courseware page gives credits ${formatCredits(imported.credits)}; the catalogue keeps ${formatCredits(course.credits)}.`,
    );
  }
  const coordinatorId = course.coordinatorId ? null : await coordinatorFor(imported.facultyName);
  const courseId = course._id;
  const bound = await mongoose.connection.transaction(async (session) => {
    const written = await Course.updateOne(
      { _id: courseId, $or: [{ source: null }, { 'source.coursewareId': coursewareId }, ...(force ? [{}] : [])] },
      {
        $set: {
          ...contentOf(imported),
          cos,
          coMap,
          source,
          contentEditedAt: null,
          issues: issues.slice(0, CATALOG_LIMITS.issues),
          reviewNeeded: issues.length > 0,
          ...(course?.type ? {} : { type: imported.type }),
          ...(coordinatorId ? { coordinatorId } : {}),
        },
      },
      { session },
    );
    if (written.matchedCount === 0) return false;
    await writeAudit(
      {
        actorId: String(run.actorId),
        action: 'course.imported',
        entity: 'course',
        entityId: String(courseId),
        after: {
          coursewareId,
          force,
          outcomes: cos.length,
          modules: imported.modules.length,
          sessions: imported.sessionPlan.length,
          issues,
          coordinatorPrefilled: Boolean(coordinatorId),
        },
      },
      session,
    );
    return true;
  });
  // Another page bound this course between the read and the write.
  return done(bound ? 'applied' : 'skipped');
}

async function giveUp(job: SyncJob, message: string): Promise<void> {
  const page = CoursewarePageJob.safeParse(job.data);
  if (page.success) return recordFailure(page.data.syncRunId, `course/${page.data.coursewareId}`, message);
  const list = CoursewareListJob.safeParse(job.data);
  if (!list.success) return;
  await SyncRun.updateOne(
    { _id: list.data.syncRunId, status: 'running' },
    {
      $set: { status: 'failed', finishedAt: new Date() },
      $push: { failures: { key: `listing/${list.data.page}`, message: message.slice(0, 500) } },
    },
  );
}

async function run(job: SyncJob): Promise<void> {
  if (job.name === 'coursewareList') return listPage(CoursewareListJob.parse(job.data));
  if (job.name === 'githubProject') return githubProject(GithubProjectJob.parse(job.data));
  if (job.name === 'githubNightly') {
    GithubNightlyJob.parse(job.data);
    return githubNightly();
  }
  return importPage(CoursewarePageJob.parse(job.data));
}

// Two pages at a time, and at most one new page a second: on 16 Oct 2026 the courseware server answered in under a
// second and then stopped answering for minutes after ~270 pages in 90 s. When it is slow (30–60 s a page) a full
// import runs for hours in the background.
export function startSyncWorker(redisUrl: string): Worker<SyncData, void, SyncJob['name']> {
  const worker = new Worker<SyncData, void, SyncJob['name']>('sync', run, {
    connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    concurrency: 2,
    limiter: { max: 1, duration: 1000 },
  });
  worker.on('failed', (job, error) => {
    log.error('job failed', { queue: 'sync', id: job?.id, attemptsMade: job?.attemptsMade, error });
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    // After the last retry the run records the page as failed (or, for the listing, stops), so the run still ends.
    giveUp(job, error.message).catch((cause: unknown) =>
      log.error('sync failure not recorded', { id: job.id, error: cause }),
    );
  });
  return worker;
}
