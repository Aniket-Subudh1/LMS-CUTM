import { parseArgs } from 'node:util';
import mongoose from 'mongoose';
import { z } from 'zod';
import { createToken } from '@/lib/auth/tokens';
import { db } from '@/lib/db';
import { invitationEmail } from '@/lib/domain/email-templates';
import { env } from '@/lib/env';
import { User } from '@/lib/models/user';
import { mailQueue, redis } from '@/lib/queue';
import { Email } from '@/lib/schemas/auth';

const Args = z.object({ email: Email, name: z.string().trim().min(1).max(120) });
const args = Args.safeParse(parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } }).values);
if (!args.success) {
  console.error('Usage: npm run admin:create -- --email <email> --name "<full name>"');
  process.exit(1);
}
const { email, name } = args.data;

await db();
const existing = await User.findOne({ email }, { status: 1 }).lean();
if (existing && existing.status !== 'invited') {
  console.error(`${email} already exists with status "${existing.status}". Manage it from the admin pages.`);
  await mongoose.disconnect();
  process.exit(1);
}
const user = await User.findOneAndUpdate(
  { email },
  { $set: { name, status: 'invited' }, $addToSet: { roles: 'admin' } },
  { upsert: true, returnDocument: 'after', projection: { sessionVersion: 1 } },
).lean();
if (!user) throw new Error('upsert returned no user');

const link = new URL('/reset-password', env().APP_URL);
link.searchParams.set(
  'token',
  await createToken({ uid: String(user._id), sv: user.sessionVersion, purpose: 'invite' }),
);
await mailQueue().add('send', invitationEmail({ to: email, name, link: link.href }), {
  jobId: `mail-invite-${user._id}-${Math.floor(Date.now() / 60_000)}`,
});
console.log(`Invitation for ${email} queued (the worker sends it). The link is valid for 7 days:\n${link.href}`);

await mailQueue().close();
await redis().quit();
await mongoose.disconnect();
