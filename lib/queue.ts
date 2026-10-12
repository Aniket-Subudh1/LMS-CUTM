import 'server-only';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '@/lib/env';
import type { MailSend } from '@/lib/schemas/jobs';

const globalForQueue = globalThis as typeof globalThis & { redis?: Redis; mail?: Queue<MailSend, void, 'send'> };

export function redis(): Redis {
  globalForQueue.redis ??= new Redis(env().REDIS_URL, { maxRetriesPerRequest: null });
  return globalForQueue.redis;
}

export function mailQueue(): Queue<MailSend, void, 'send'> {
  globalForQueue.mail ??= new Queue<MailSend, void, 'send'>('mail', {
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
