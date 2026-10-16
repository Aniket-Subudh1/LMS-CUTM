import mongoose from 'mongoose';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { startMailWorker } from './jobs/mail';
import { startMediaWorker } from './jobs/media';
import { startSyncWorker } from './jobs/sync';

await db();
const workers = [startMailWorker(env().REDIS_URL), startMediaWorker(env().REDIS_URL), startSyncWorker(env().REDIS_URL)];
log.info('worker started', { queues: workers.map((w) => w.name) });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void Promise.all(workers.map((w) => w.close()))
      .then(() => mongoose.disconnect())
      .then(() => process.exit(0));
  });
}
