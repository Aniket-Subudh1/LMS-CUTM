import mongoose from 'mongoose';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { computeQueue, syncQueue } from '@/lib/queue';
import { startComputeWorker } from './jobs/compute';
import { startMailWorker } from './jobs/mail';
import { startMediaWorker } from './jobs/media';
import { startSyncWorker } from './jobs/sync';

await db();
const workers = [
  startMailWorker(env().REDIS_URL),
  startMediaWorker(env().REDIS_URL),
  startSyncWorker(env().REDIS_URL),
  startComputeWorker(env().REDIS_URL),
];
// 02 §8. Idempotent: every worker start re-registers the same scheduler. BullMQ types a scheduler id as one of the
// queue's job names, so the scheduler is named after the job it adds.
await computeQueue().upsertJobScheduler(
  'liveSweep',
  { pattern: '5 * * * *', tz: 'Asia/Kolkata' },
  { name: 'liveSweep', data: {} },
);
await computeQueue().upsertJobScheduler(
  'assessmentSweep',
  { pattern: '0 * * * *', tz: 'Asia/Kolkata' },
  { name: 'assessmentSweep', data: {} },
);
await computeQueue().upsertJobScheduler(
  'proctorRetention',
  { pattern: '30 3 * * *', tz: 'Asia/Kolkata' },
  { name: 'proctorRetention', data: {} },
);
await computeQueue().upsertJobScheduler(
  'internalMarksNightly',
  { pattern: '0 2 * * *', tz: 'Asia/Kolkata' },
  { name: 'internalMarksNightly', data: {} },
);
await syncQueue().upsertJobScheduler(
  'githubNightly',
  { pattern: '30 1 * * *', tz: 'Asia/Kolkata' },
  { name: 'githubNightly', data: {} },
);
log.info('worker started', { queues: workers.map((w) => w.name) });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void Promise.all(workers.map((w) => w.close()))
      .then(() => mongoose.disconnect())
      .then(() => process.exit(0));
  });
}
