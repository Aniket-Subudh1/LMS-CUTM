import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { sendMail } from '@/lib/integrations/mail';
import { log } from '@/lib/log';
import { MailSend } from '@/lib/schemas/jobs';

export function startMailWorker(redisUrl: string): Worker {
  const worker = new Worker('mail', async (job) => sendMail(MailSend.parse(job.data)), {
    connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    concurrency: 10,
  });
  worker.on('failed', (job, error) =>
    log.error('job failed', { queue: 'mail', id: job?.id, attemptsMade: job?.attemptsMade, error }),
  );
  return worker;
}
