'use server';

import { redirect } from 'next/navigation';
import { publicAction } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth/password';
import { signIn, signOut } from '@/lib/auth/session';
import { passwordSignIn } from '@/lib/auth/sign-in';
import { queueResetLink, readToken } from '@/lib/auth/tokens';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { User } from '@/lib/models/user';
import { clientIp, limit } from '@/lib/rate-limit';
import { LoginInput, ResetInput, ResetRequestInput } from '@/lib/schemas/auth';

const MINUTE = 60_000;
const EXPIRED = 'This link has expired or was already used.';

export const login = publicAction(LoginInput, async ({ email, password, next }) => {
  await passwordSignIn(email, password);
  redirect(next ?? '/home');
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
  if (!user) throw new AppError('NOT_FOUND', 'This email does not exist in the database.');
  await queueResetLink({
    id: String(user._id),
    name: user.name,
    email: user.email,
    sessionVersion: user.sessionVersion,
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
