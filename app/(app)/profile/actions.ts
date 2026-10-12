'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { signIn, signOut } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { User } from '@/lib/models/user';
import { ChangePasswordInput } from '@/lib/schemas/auth';
import { ROLES } from '@/lib/schemas/common';

export const changePassword = action(
  { input: ChangePasswordInput, roles: ROLES },
  async ({ current, password }, viewer) => {
    if (password.toLowerCase() === viewer.email) {
      throw new AppError('VALIDATION', 'Your password must not be your email address.');
    }
    await db();
    const user = await User.findById(viewer.id, { passwordHash: 1 }).lean();
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, current))) {
      throw new AppError('VALIDATION', 'Your current password is incorrect.');
    }
    const updated = await User.findByIdAndUpdate(
      viewer.id,
      { $set: { passwordHash: await hashPassword(password) }, $inc: { sessionVersion: 1 } },
      { projection: { sessionVersion: 1 }, returnDocument: 'after' },
    ).lean();
    if (!updated) throw new AppError('NOT_FOUND', 'Your account no longer exists.');
    await writeAudit({ actorId: viewer.id, action: 'user.password_changed', entity: 'user', entityId: viewer.id });
    // The bump signs out every other browser; re-sign this one with the new version.
    await signIn({ id: viewer.id, sessionVersion: updated.sessionVersion });
  },
);

export const signOutEverywhere = action({ input: z.object({}), roles: ROLES }, async (_input, viewer) => {
  await db();
  await User.updateOne({ _id: viewer.id }, { $inc: { sessionVersion: 1 } });
  await writeAudit({ actorId: viewer.id, action: 'user.sessions_revoked', entity: 'user', entityId: viewer.id });
  await signOut();
  redirect('/login');
});
