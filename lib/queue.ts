import 'server-only';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '@/lib/env';
import type {
  CoursewareListJob,
  CoursewarePageJob,
  FinalizeLiveJob,
  LiveSweepJob,
  MailJob,
  MailSend,
  MediaJob,
} from '@/lib/schemas/jobs';

type MailQueue = Queue<MailSend | MailJob, void, 'send' | 'fanout'>;
type MediaQueue = Queue<MediaJob, void, 'transcodeLesson'>;
type SyncQueue = Queue<CoursewareListJob | CoursewarePageJob, void, 'coursewareList' | 'coursewarePage'>;
type ComputeQueue = Queue<FinalizeLiveJob | LiveSweepJob, void, 'finalizeLiveSession' | 'liveSweep'>;
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

// Recomputations over a class's records (02 §8): live-class attendance now; internal marks and attainment later.
export function computeQueue(): ComputeQueue {
  globalForQueue.compute ??= new Queue<FinalizeLiveJob | LiveSweepJob, void, 'finalizeLiveSession' | 'liveSweep'>(
    'compute',
    {
      connection: redis(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    },
  );
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
