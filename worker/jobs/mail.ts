import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { passwordLink } from '@/lib/auth/tokens';
import { invitationEmail } from '@/lib/domain/email-templates';
import { sendMail } from '@/lib/integrations/mail';
import { log } from '@/lib/log';
import { User } from '@/lib/models/user';
import { mailQueue } from '@/lib/queue';
import { MailJob, MailSend } from '@/lib/schemas/jobs';

const MINUTE = 60_000;

// One `mail/send` per user who is still waiting for their invitation; the job ids make a re-run a no-op within the minute.
async function invite(userIds: string[]): Promise<void> {
  const users = await User.find(
    { _id: { $in: userIds }, status: 'invited' },
    { name: 1, email: 1, sessionVersion: 1 },
  ).lean();
  const bucket = Math.floor(Date.now() / MINUTE);
  const jobs = await Promise.all(
    users.map(async (u) => ({
      name: 'send' as const,
      data: invitationEmail({
        to: u.email,
        name: u.name,
        link: await passwordLink({ uid: String(u._id), sv: u.sessionVersion, purpose: 'invite' }),
      }),
      opts: { jobId: `mail-invite-${u._id}-${bucket}` },
    })),
  );
  await mailQueue().addBulk(jobs);
}

async function run(job: Job<MailSend | MailJob, void, 'send' | 'fanout'>): Promise<void> {
  if (job.name === 'send') return sendMail(MailSend.parse(job.data));
  const mail = MailJob.parse(job.data);
  return invite(mail.userIds);
}

export function startMailWorker(redisUrl: string): Worker<MailSend | MailJob, void, 'send' | 'fanout'> {
  const worker = new Worker<MailSend | MailJob, void, 'send' | 'fanout'>('mail', run, {
    connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    concurrency: 10,
  });
  worker.on('failed', (job, error) =>
    log.error('job failed', { queue: 'mail', id: job?.id, attemptsMade: job?.attemptsMade, error }),
  );
  return worker;
}
