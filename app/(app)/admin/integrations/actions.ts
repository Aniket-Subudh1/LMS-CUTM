'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { QUEUE_NAMES, queueOf } from '@/lib/data/integrations';
import { AppError } from '@/lib/errors';

// M07 T9: an admin tries a job that ran out of tries again, once its cause is fixed.
export const retryJob = action(
  { input: z.object({ queue: z.enum(QUEUE_NAMES), jobId: z.string().min(1).max(200) }), roles: ['admin'] },
  async ({ queue, jobId }, viewer) => {
    const job = await queueOf(queue).getJob(jobId);
    if (!job || !(await job.isFailed())) throw new AppError('NOT_FOUND', 'That job is no longer waiting for a retry.');
    await job.retry('failed');
    await writeAudit({ actorId: viewer.id, action: 'job.retried', entity: 'job', entityId: `${queue}:${jobId}` });
    refresh();
  },
);
