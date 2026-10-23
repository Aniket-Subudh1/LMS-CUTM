import 'server-only';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '@/lib/env';
import type {
  AssessmentSweepJob,
  CoursewareListJob,
  CoursewarePageJob,
  DraftQuestionsJob,
  FinalizeLiveJob,
  GradeCodeJob,
  InternalMarksJob,
  InternalMarksNightlyJob,
  LiveControlJob,
  LiveSweepJob,
  MailJob,
  MakeTestFileJob,
  MailSend,
  MediaJob,
  ProctorRetentionJob,
  TestStatsJob,
} from '@/lib/schemas/jobs';

type MailQueue = Queue<MailSend | MailJob, void, 'send' | 'fanout'>;
type MediaQueue = Queue<MediaJob, void, 'transcodeLesson'>;
type SyncQueue = Queue<CoursewareListJob | CoursewarePageJob, void, 'coursewareList' | 'coursewarePage'>;
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
  | InternalMarksNightlyJob;
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
  | 'internalMarksNightly';
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

// Imports from other systems (02 §8): the courseware import now, the exam system and GitHub later.
export function syncQueue(): SyncQueue {
  globalForQueue.sync ??= new Queue<CoursewareListJob | CoursewarePageJob, void, 'coursewareList' | 'coursewarePage'>(
    'sync',
    {
      connection: redis(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 2000,
        removeOnFail: 5000,
      },
    },
  );
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
  job: { name: 'testStats'; data: TestStatsJob } | { name: 'internalMarks'; data: InternalMarksJob },
  jobId: string,
): Promise<void> {
  const existing = await computeQueue().getJob(jobId);
  const state = existing ? await existing.getState() : null;
  if (state === 'waiting' || state === 'delayed' || state === 'prioritized') return;
  if (existing && state !== 'active') await existing.remove();
  await computeQueue().add(job.name, job.data, {
    jobId: state === 'active' ? `${jobId}-${Date.now()}` : jobId,
    delay: 5_000,
  });
}

// TP-11: a test's ranks, item analysis and leaderboard.
export async function queueTestStats(assessmentId: string): Promise<void> {
  await queueRecompute({ name: 'testStats', data: { assessmentId } }, `stats-${assessmentId}`);
}

// M06 (07 §2–3): a credit offering's internal marks.
export async function queueInternalMarks(offeringId: string): Promise<void> {
  await queueRecompute({ name: 'internalMarks', data: { offeringId } }, `ce-${offeringId}`);
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

// M03c T2: each control is its own job (no id), and the job reads the class as it is when it runs.
export async function queueLiveControl(job: LiveControlJob): Promise<void> {
  await computeQueue().add('liveControl', job, { attempts: 3, backoff: { type: 'fixed', delay: 2_000 } });
}
