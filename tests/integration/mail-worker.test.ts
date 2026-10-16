import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { Types } from 'mongoose';

const sendMail = vi.fn<(message: { to: string; subject: string; text: string; html: string }) => Promise<void>>(
  async () => {},
);
vi.mock('@/lib/integrations/mail', () => ({ sendMail }));

type Loaded = {
  mailQueue: typeof import('@/lib/queue').mailQueue;
  redis: typeof import('@/lib/queue').redis;
  User: typeof import('@/lib/models/user').User;
  Course: typeof import('@/lib/models/course').Course;
  Enrollment: typeof import('@/lib/models/enrollment').Enrollment;
  Offering: typeof import('@/lib/models/offering').Offering;
  Program: typeof import('@/lib/models/program').Program;
};

let worker: ReturnType<typeof import('@/worker/jobs/mail').startMailWorker>;
let events: QueueEvents;
let m: Loaded;

beforeAll(async () => {
  const { env } = await import('@/lib/env');
  const { db } = await import('@/lib/db');
  const { startMailWorker } = await import('@/worker/jobs/mail');
  m = {
    ...(await import('@/lib/queue')),
    ...(await import('@/lib/models/user')),
    ...(await import('@/lib/models/course')),
    ...(await import('@/lib/models/enrollment')),
    ...(await import('@/lib/models/offering')),
    ...(await import('@/lib/models/program')),
  };
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

  it('emails the course plan once to each active student of the offering (COM-01, AC-M02-04)', async () => {
    sendMail.mockClear();
    const departmentId = new Types.ObjectId();
    const program = await m.Program.create({
      code: 'BTCSE',
      name: 'B.Tech CSE',
      departmentId,
      durationSemesters: 8,
      outcomeTitles: [
        { code: 'PSO1', title: 'Higher education' },
        { code: 'PO1', title: 'Engineering knowledge' },
      ],
    });
    const course = await m.Course.create({
      code: 'CUTM1602',
      title: 'Programming in C',
      credits: { theory: 1, practice: 2, project: 1 },
      objectives: ['Choose the right structure for a problem'],
      cos: [{ code: 'CO1', statement: 'Explain stacks and queues', bloomLevels: ['understand', 'apply'] }],
      modules: [{ title: 'Arrays', hours: '2+4+2', topics: 'Unit 1: Arrays', practicals: ['Reverse an array'] }],
      textbooks: ['Kernighan and Ritchie'],
      status: 'active',
    });
    const offering = await m.Offering.create({
      courseId: course._id,
      termId: new Types.ObjectId(),
      batchId: new Types.ObjectId(),
      programId: program._id,
      departmentId,
      category: 'ugc',
      credits: course.credits,
      title: 'CUTM1602 · Programming in C · 2026-ODD',
      facultyIds: [new Types.ObjectId()],
      status: 'active',
      plan: {
        doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Weekly' }] }] },
        version: 1,
      },
      calendar: [{ date: new Date('2026-10-19T18:30:00Z'), topic: 'Stacks', coIds: [course.cos[0]._id] }],
    });
    const [asha, ravi, gone] = await m.User.create([
      { name: 'Asha', email: 'asha.plan@cutm.test', roles: ['student'], status: 'active' },
      { name: 'Ravi', email: 'ravi.plan@cutm.test', roles: ['student'], status: 'invited' },
      { name: 'Gone', email: 'gone.plan@cutm.test', roles: ['student'], status: 'active' },
    ]);
    await m.Enrollment.create([
      { offeringId: offering._id, studentId: asha._id, status: 'active' },
      { offeringId: offering._id, studentId: ravi._id, status: 'active' },
      { offeringId: offering._id, studentId: gone._id, status: 'dropped' },
    ]);
    const payload = { kind: 'coursePlanPublished' as const, offeringId: String(offering._id), version: 1 };

    await (await m.mailQueue().add('fanout', payload, { jobId: `plan-${offering._id}-1-a` })).waitUntilFinished(events);
    await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(2));
    // A re-run of the same version adds no email: the per-student job ids already exist.
    await (await m.mailQueue().add('fanout', payload, { jobId: `plan-${offering._id}-1-b` })).waitUntilFinished(events);

    const sent = sendMail.mock.calls.map(([message]) => message);
    expect(sent.map((s) => s.to).sort()).toEqual(['asha.plan@cutm.test', 'ravi.plan@cutm.test']);
    for (const mail of sent) {
      expect(mail.subject).toBe('Course plan: CUTM1602 Programming in C');
      for (const part of ['Course calendar', 'Syllabus', 'Course objectives', 'Course outcomes', 'Program outcomes']) {
        expect(mail.html).toContain(`>${part}</h2>`);
      }
      expect(mail.html).toContain('Stacks');
      expect(mail.html).toContain('Unit 1: Arrays');
      expect(mail.html).toContain('Arrays (2+4+2 hours)');
      expect(mail.html).toContain('Understand, Apply');
      expect(mail.html).toContain('credits 1-2-1');
      // Programme outcome titles, in code order.
      expect(mail.html.indexOf('Engineering knowledge')).toBeLessThan(mail.html.indexOf('Higher education'));
      expect(mail.html).toContain(`http://localhost:3000/courses/${offering._id}`);
    }
    expect(sendMail).toHaveBeenCalledTimes(2);
  });
});
