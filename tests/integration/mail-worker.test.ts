import { describe, expect, it, vi } from 'vitest';

const sendMail = vi.fn(async () => {});
vi.mock('@/lib/integrations/mail', () => ({ sendMail }));

describe('mail worker', () => {
  it('sends a valid message and fails an invalid one without sending', async () => {
    const { QueueEvents } = await import('bullmq');
    const { Redis } = await import('ioredis');
    const { env } = await import('@/lib/env');
    const { mailQueue, redis } = await import('@/lib/queue');
    const { startMailWorker } = await import('@/worker/jobs/mail');
    const worker = startMailWorker(env().REDIS_URL);
    const events = new QueueEvents('mail', { connection: new Redis(env().REDIS_URL, { maxRetriesPerRequest: null }) });
    await events.waitUntilReady();
    const message = { to: 'asha@cutm.ac.in', subject: 'Hello', text: 'Hello', html: '<p>Hello</p>' };

    const sent = await mailQueue().add('send', message, { jobId: `mail-test-${process.pid}` });
    await sent.waitUntilFinished(events);
    expect(sendMail).toHaveBeenCalledExactlyOnceWith(message);

    const invalid = await mailQueue().add('send', { ...message, to: 'not-an-email' }, { attempts: 1 });
    await expect(invalid.waitUntilFinished(events)).rejects.toThrow();
    expect(sendMail).toHaveBeenCalledTimes(1);

    await Promise.all([worker.close(), events.close(), mailQueue().close()]);
    await redis().quit();
  });
});
