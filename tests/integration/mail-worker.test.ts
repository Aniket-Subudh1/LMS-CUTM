import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';

const sendMail = vi.fn<(message: { to: string; text: string }) => Promise<void>>(async () => {});
vi.mock('@/lib/integrations/mail', () => ({ sendMail }));

type Loaded = {
  mailQueue: typeof import('@/lib/queue').mailQueue;
  redis: typeof import('@/lib/queue').redis;
  User: typeof import('@/lib/models/user').User;
};

let worker: ReturnType<typeof import('@/worker/jobs/mail').startMailWorker>;
let events: QueueEvents;
let m: Loaded;

beforeAll(async () => {
  const { env } = await import('@/lib/env');
  const { db } = await import('@/lib/db');
  const { startMailWorker } = await import('@/worker/jobs/mail');
  m = { ...(await import('@/lib/queue')), ...(await import('@/lib/models/user')) };
  await db();
  worker = startMailWorker(env().REDIS_URL);
  events = new QueueEvents('mail', { connection: new Redis(env().REDIS_URL, { maxRetriesPerRequest: null }) });
  await events.waitUntilReady();
});

afterAll(async () => {
  await Promise.all([worker.close(), events.close(), m.mailQueue().close()]);
  await m.redis().quit();
});

describe('mail worker', () => {
  it('sends a valid message and fails an invalid one without sending', async () => {
    const message = { to: 'asha@cutm.ac.in', subject: 'Hello', text: 'Hello', html: '<p>Hello</p>' };

    const sent = await m.mailQueue().add('send', message, { jobId: `mail-test-${process.pid}` });
    await sent.waitUntilFinished(events);
    expect(sendMail).toHaveBeenCalledExactlyOnceWith(message);

    const invalid = await m.mailQueue().add('send', { ...message, to: 'not-an-email' }, { attempts: 1 });
    await expect(invalid.waitUntilFinished(events)).rejects.toThrow();
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('turns an invitation fan-out into one email per user still waiting for it', async () => {
    sendMail.mockClear();
    const [waiting, other, active] = await m.User.create([
      { name: 'Waiting', email: 'waiting@cutm.test', roles: ['student'], status: 'invited' },
      { name: 'Other', email: 'other@cutm.test', roles: ['faculty'], status: 'invited' },
      { name: 'Active', email: 'active@cutm.test', roles: ['student'], status: 'active' },
    ]);
    const userIds = [waiting, other, active].map((u) => String(u._id));

    const job = await m.mailQueue().add('fanout', { kind: 'invitation', userIds });
    await job.waitUntilFinished(events);

    await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(2));
    const sent = sendMail.mock.calls.map(([message]) => message);
    expect(sent.map((s) => s.to).sort()).toEqual(['other@cutm.test', 'waiting@cutm.test']);
    expect(sent.every((s) => /http:\/\/localhost:3000\/reset-password\?token=\S+/.test(s.text))).toBe(true);
  });

  it('rejects a fan-out with no recipients', async () => {
    const job = await m.mailQueue().add('fanout', { kind: 'invitation', userIds: [] }, { attempts: 1 });
    await expect(job.waitUntilFinished(events)).rejects.toThrow();
  });
});
