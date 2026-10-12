'use server';

import { redirect } from 'next/navigation';
import { publicAction } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { signIn, signOut } from '@/lib/auth/session';
import { createToken, readToken } from '@/lib/auth/tokens';
import { db } from '@/lib/db';
import { resetEmail } from '@/lib/domain/email-templates';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { User } from '@/lib/models/user';
import { mailQueue } from '@/lib/queue';
import { clientIp, limit } from '@/lib/rate-limit';
import { LoginInput, ResetInput, ResetRequestInput } from '@/lib/schemas/auth';

const MINUTE = 60_000;
const INCORRECT = 'Email or password is incorrect.';
const EXPIRED = 'This link has expired or was already used.';

export const login = publicAction(LoginInput, async ({ email, password }) => {
  const attempts = [
    await limit('login-ip', await clientIp(), 30, 15 * MINUTE),
    await limit('login', email, 5, 15 * MINUTE),
  ];
  await db();
  const user = await User.findOne({ email, status: 'active' }, { passwordHash: 1, sessionVersion: 1 }).lean();
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
    throw new AppError('UNAUTHENTICATED', INCORRECT);
  }
  await Promise.all(attempts.map((a) => a.refund()));
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  await signIn({ id: String(user._id), sessionVersion: user.sessionVersion });
  redirect('/home');
});

export async function logout(): Promise<void> {
  await signOut();
  redirect('/login');
}

export const requestPasswordReset = publicAction(ResetRequestInput, async ({ email }) => {
  await limit('reset-ip', await clientIp(), 20, 60 * MINUTE);
  await limit('reset', email, 3, 60 * MINUTE);
  await db();
  const user = await User.findOne(
    { email, status: { $in: ['active', 'invited'] } },
    { name: 1, email: 1, sessionVersion: 1 },
  ).lean();
  if (!user) return;
  const link = new URL('/reset-password', env().APP_URL);
  link.searchParams.set(
    'token',
    await createToken({ uid: String(user._id), sv: user.sessionVersion, purpose: 'reset' }),
  );
  await mailQueue().add('send', resetEmail({ to: user.email, name: user.name, link: link.href }), {
    jobId: `mail-reset-${user._id}-${Math.floor(Date.now() / MINUTE)}`,
  });
});

export const resetPassword = publicAction(ResetInput, async ({ token, password }) => {
  const data = await readToken(token, ['reset', 'invite']);
  if (!data) throw new AppError('VALIDATION', EXPIRED);
  await db();
  const pending = { _id: data.uid, sessionVersion: data.sv, status: { $in: ['active', 'invited'] as const } };
  const user = await User.findOne(pending, { email: 1, status: 1 }).lean();
  if (!user) throw new AppError('VALIDATION', EXPIRED);
  if (password.toLowerCase() === user.email)
    throw new AppError('VALIDATION', 'Your password must not be your email address.');
  // Conditional on the token's sessionVersion, so a link works once even when two requests race.
  const updated = await User.findOneAndUpdate(
    pending,
    { $set: { passwordHash: await hashPassword(password), status: 'active' }, $inc: { sessionVersion: 1 } },
    { projection: { sessionVersion: 1 }, returnDocument: 'after' },
  ).lean();
  if (!updated) throw new AppError('VALIDATION', EXPIRED);
  await writeAudit({
    actorId: data.uid,
    action: 'user.password_changed',
    entity: 'user',
    entityId: data.uid,
    before: { status: user.status },
    after: { status: 'active' },
  });
  await signIn({ id: data.uid, sessionVersion: updated.sessionVersion });
  redirect('/home');
});
