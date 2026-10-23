import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { passwordLink } from '@/lib/auth/tokens';
import { formatCredits } from '@/lib/domain/catalog';
import { coursePlanEmail, invitationEmail } from '@/lib/domain/email-templates';
import { env } from '@/lib/env';
import { sendMail } from '@/lib/integrations/mail';
import { log } from '@/lib/log';
import { Course } from '@/lib/models/course';
import { Enrollment } from '@/lib/models/enrollment';
import { Offering } from '@/lib/models/offering';
import { Program } from '@/lib/models/program';
import { User } from '@/lib/models/user';
import { mailQueue } from '@/lib/queue';
import { MailJob, MailSend } from '@/lib/schemas/jobs';
import { OUTCOME_CODES } from '@/lib/schemas/structure';

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

// COM-01: one `mail/send` per active student, each with a job id that makes a re-run of this version a no-op.
async function coursePlanPublished(offeringId: string, version: number): Promise<void> {
  const offering = await Offering.findById(offeringId, { courseId: 1, programId: 1, credits: 1, calendar: 1 }).lean();
  if (!offering) return;
  const course = await Course.findById(offering.courseId, {
    code: 1,
    title: 1,
    modules: 1,
    projects: 1,
    textbooks: 1,
    references: 1,
    syllabusFileKey: 1,
    objectives: 1,
    cos: 1,
  }).lean();
  if (!course) return;
  const [program, enrolled] = await Promise.all([
    Program.findById(offering.programId, { outcomeTitles: 1 }).lean(),
    Enrollment.distinct('studentId', { offeringId, status: 'active' }),
  ]);
  const code = new Map(course.cos.map((co) => [String(co._id), co.code]));
  const plan = {
    courseHref: new URL(`/courses/${offeringId}`, env().APP_URL).href,
    courseCode: course.code,
    courseTitle: course.title,
    credits: formatCredits(offering.credits),
    calendar: offering.calendar.map((row) => ({
      date: row.date,
      topic: row.topic,
      cos: row.coIds.flatMap((id) => code.get(String(id)) ?? []),
    })),
    modules: course.modules.map(({ title, hours, topics, practicals }) => ({
      title,
      hours: hours ?? null,
      topics,
      practicals,
    })),
    projects: course.projects,
    textbooks: course.textbooks,
    references: course.references,
    syllabusPdfHref: course.syllabusFileKey
      ? new URL(`/api/files/${course.syllabusFileKey}`, env().APP_URL).href
      : null,
    objectives: course.objectives,
    cos: course.cos.map(({ code, statement, bloomLevels }) => ({ code, statement, bloomLevels })),
    // In code order, PO1 … PO12 then PSO1 … PSO3.
    outcomes: OUTCOME_CODES.flatMap((code) => {
      const title = program?.outcomeTitles.find((o) => o.code === code)?.title;
      return title ? [{ code, title }] : [];
    }),
  };
  for (let start = 0; start < enrolled.length; start += 500) {
    const students = await User.find(
      { _id: { $in: enrolled.slice(start, start + 500) }, status: { $ne: 'disabled' } },
      { name: 1, email: 1 },
    ).lean();
    await mailQueue().addBulk(
      students.map((student) => ({
        name: 'send' as const,
        data: coursePlanEmail({ ...plan, to: student.email, name: student.name }),
        opts: { jobId: `mail-plan-${offeringId}-${version}-${student._id}` },
      })),
    );
  }
}

async function run(job: Job<MailSend | MailJob, void, 'send' | 'fanout'>): Promise<void> {
  if (job.name === 'send') return sendMail(MailSend.parse(job.data));
  const mail = MailJob.parse(job.data);
  if (mail.kind === 'invitation') return invite(mail.userIds);
  return coursePlanPublished(mail.offeringId, mail.version);
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
