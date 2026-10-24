import 'server-only';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '@/lib/env';
import type {
  AssessmentSweepJob,
  AttainmentJob,
  CoursewareListJob,
  CoursewarePageJob,
  DraftQuestionsJob,
  FinalizeLiveJob,
  GithubNightlyJob,
  GithubProjectJob,
  GradeCodeJob,
  GradeSheetsJob,
  InternalMarksJob,
  InternalMarksNightlyJob,
  LiveControlJob,
  LiveSweepJob,
  LockOfferingJob,
  MailJob,
  MakeTestFileJob,
  MailSend,
  MediaJob,
  ProctorRetentionJob,
  TestStatsJob,
} from '@/lib/schemas/jobs';

type MailQueue = Queue<MailSend | MailJob, void, 'send' | 'fanout'>;
type MediaQueue = Queue<MediaJob, void, 'transcodeLesson'>;
type SyncData = CoursewareListJob | CoursewarePageJob | GithubProjectJob | GithubNightlyJob;
type SyncName = 'coursewareList' | 'coursewarePage' | 'githubProject' | 'githubNightly';
type SyncQueue = Queue<SyncData, void, SyncName>;
type ComputeData =
  | FinalizeLiveJob
  | LiveSweepJob
  | LiveControlJob
  | AssessmentSweepJob
  | ProctorRetentionJob
  | GradeCodeJob
  | TestStatsJob
  | MakeTestFileJob
  | DraftQuestionsJob
  | InternalMarksJob
  | InternalMarksNightlyJob
  | LockOfferingJob
  | GradeSheetsJob
  | AttainmentJob;
type ComputeName =
  | 'finalizeLiveSession'
  | 'liveSweep'
  | 'liveControl'
  | 'assessmentSweep'
  | 'proctorRetention'
  | 'gradeCode'
  | 'testStats'
  | 'makeTestFile'
  | 'draftQuestions'
  | 'internalMarks'
  | 'internalMarksNightly'
  | 'lockOffering'
  | 'gradeSheets'
  | 'attainment';
type ComputeQueue = Queue<ComputeData, void, ComputeName>;
const globalForQueue = globalThis as typeof globalThis & {
  redis?: Redis;
  mail?: MailQueue;
  media?: MediaQueue;
  sync?: SyncQueue;
  compute?: ComputeQueue;
};

export function redis(): Redis {
  globalForQueue.redis ??= new Redis(env().REDIS_URL, { maxRetriesPerRequest: null });
  return globalForQueue.redis;
}

export function mailQueue(): MailQueue {
  globalForQueue.mail ??= new Queue<MailSend | MailJob, void, 'send' | 'fanout'>('mail', {
    connection: redis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
  return globalForQueue.mail;
}

export function mediaQueue(): MediaQueue {
  globalForQueue.media ??= new Queue<MediaJob, void, 'transcodeLesson'>('media', {
    connection: redis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
  return globalForQueue.media;
}

// Imports from other systems (02 §8): the courseware import, GitHub (M07), the exam system later.
export function syncQueue(): SyncQueue {
  globalForQueue.sync ??= new Queue<SyncData, void, SyncName>('sync', {
    connection: redis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: 2000,
      removeOnFail: 5000,
    },
  });
  return globalForQueue.sync;
}

// Recomputations over a class's records (02 §8): live-class attendance now; internal marks and attainment later. Also
// the live-room controls that reach every student (M03c).
export function computeQueue(): ComputeQueue {
  globalForQueue.compute ??= new Queue<ComputeData, void, ComputeName>('compute', {
    connection: redis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
  return globalForQueue.compute;
}

// 06 §6: finalize a class once it has ended. A failed job keeps its id and BullMQ ignores a new job with that id, so a
// failed one is retried instead.
export async function queueLiveFinalize(sessionId: string): Promise<void> {
  const jobId = `live-final-${sessionId}`;
  const existing = await computeQueue().getJob(jobId);
  if (existing && (await existing.isFailed())) {
    await existing.retry('failed');
    return;
  }
  await computeQueue().add('finalizeLiveSession', { sessionId }, { jobId });
}

// 06 §6 (TP-09): mark an attempt's code questions once it is handed in. The id makes a second hand-in path add
// nothing; asked `again` (a grader's "Run the tests again"), a finished job is removed and added anew and a failed one
// retried.
export async function queueGradeCode(submissionId: string, again = false): Promise<void> {
  const jobId = `code-${submissionId}`;
  const existing = again ? await computeQueue().getJob(jobId) : undefined;
  if (existing && (await existing.isFailed())) {
    await existing.retry('failed');
    return;
  }
  if (existing && (await existing.isCompleted())) await existing.remove();
  await computeQueue().add('gradeCode', { submissionId }, { jobId });
}

// 06 §6: a job that works something out again from what is stored. A job still waiting reads the change when it runs,
// so nothing is added; a finished one is removed and added anew; one already running may have read too early, so
// another follows it. The short delay gathers a burst of changes into one run.
async function queueRecompute(
  add: (jobId: string, delay: number) => Promise<unknown>,
  queue: ComputeQueue | SyncQueue,
  jobId: string,
): Promise<void> {
  const existing = await queue.getJob(jobId);
  const state = existing ? await existing.getState() : null;
  if (state === 'waiting' || state === 'delayed' || state === 'prioritized') return;
  if (existing && state !== 'active') await existing.remove();
  await add(state === 'active' ? `${jobId}-${Date.now()}` : jobId, 5_000);
}

// TP-11: a test's ranks, item analysis and leaderboard.
export async function queueTestStats(assessmentId: string): Promise<void> {
  const data: TestStatsJob = { assessmentId };
  await queueRecompute(
    (jobId, delay) => computeQueue().add('testStats', data, { jobId, delay }),
    computeQueue(),
    `stats-${assessmentId}`,
  );
}

// M06 (07 §2–3): a credit offering's internal marks.
export async function queueInternalMarks(offeringId: string): Promise<void> {
  const data: InternalMarksJob = { offeringId };
  await queueRecompute(
    (jobId, delay) => computeQueue().add('internalMarks', data, { jobId, delay }),
    computeQueue(),
    `ce-${offeringId}`,
  );
}

// M09 (07 §4): a credit offering's attainment, after its marks, its end-semester marks or its course's map change.
export async function queueAttainment(offeringId: string, actorId?: string): Promise<void> {
  const data: AttainmentJob = { offeringId, actorId };
  await queueRecompute(
    (jobId, delay) => computeQueue().add('attainment', data, { jobId, delay }),
    computeQueue(),
    `att-${offeringId}`,
  );
}

// M07 (06 §6): a GitHub project's new commits, after a push, a link or "Sync now".
export async function queueGithubSync(projectId: string): Promise<void> {
  const data: GithubProjectJob = { projectId };
  await queueRecompute(
    (jobId, delay) => syncQueue().add('githubProject', data, { jobId, delay }),
    syncQueue(),
    `gh-${projectId}`,
  );
}

// 06 §6 (TP-12): make one file asked for from a test's results. Each request is its own job; asking again while one
// is being made adds the newer request, which is the one that finishes the file. Someone is waiting, so it retries soon.
export async function queueTestFile(fileId: string, requestedAt: Date): Promise<void> {
  await computeQueue().add(
    'makeTestFile',
    { fileId },
    { jobId: `file-${fileId}-${requestedAt.getTime()}`, attempts: 3, backoff: { type: 'fixed', delay: 10_000 } },
  );
}

// 06 §6 (TP-10): AI drafts into a bank. One try only: a retry after the drafts were saved would save them twice, so a
// failure tells the teacher, who asks again.
export async function queueDraftQuestions(job: DraftQuestionsJob): Promise<void> {
  await computeQueue().add('draftQuestions', job, { jobId: `draft-${job.requestedBy}-${Date.now()}`, attempts: 1 });
}

// M08 (06 §6): one course of a "Lock the complete courses" run.
export async function queueLockOffering(job: LockOfferingJob): Promise<void> {
  await computeQueue().add('lockOffering', job, { jobId: `lock-${job.syncRunId}-${job.offeringId}` });
}

// M08 (06 §6): a batch's grade sheets; one run at a time per batch and term (the action checks), so the run names it.
export async function queueGradeSheets(job: GradeSheetsJob): Promise<void> {
  await computeQueue().add('gradeSheets', job, { jobId: `gs-${job.syncRunId}` });
}

// M03c T2: each control is its own job (no id), and the job reads the class as it is when it runs.
export async function queueLiveControl(job: LiveControlJob, delayMs = 0): Promise<void> {
  await computeQueue().add('liveControl', job, { attempts: 3, backoff: { type: 'fixed', delay: 2_000 }, delay: delayMs });
}
