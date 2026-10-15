import 'server-only';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '@/lib/env';
import type { MailJob, MailSend, MediaJob } from '@/lib/schemas/jobs';

type MailQueue = Queue<MailSend | MailJob, void, 'send' | 'fanout'>;
type MediaQueue = Queue<MediaJob, void, 'transcodeLesson'>;
const globalForQueue = globalThis as typeof globalThis & { redis?: Redis; mail?: MailQueue; media?: MediaQueue };

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
