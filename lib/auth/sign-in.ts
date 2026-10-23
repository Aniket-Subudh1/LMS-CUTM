import 'server-only';
import { verifyPassword } from '@/lib/auth/password';
import { signIn } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { User } from '@/lib/models/user';
import { clientIp, limit } from '@/lib/rate-limit';

const MINUTE = 60_000;

// Signing in with a password, from the sign-in page or a test link's page (M04b). Failures are limited per address
// and per email; a success gives its slot back. A candidate has no password, so this never signs one in.
export async function passwordSignIn(email: string, password: string): Promise<void> {
  const attempts = [
    await limit('login-ip', await clientIp(), 30, 15 * MINUTE),
    await limit('login', email, 5, 15 * MINUTE),
  ];
  await db();
  const user = await User.findOne({ email, status: 'active' }, { passwordHash: 1, sessionVersion: 1 }).lean();
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
    throw new AppError('UNAUTHENTICATED', 'Email or password is incorrect.');
  }
  await Promise.all(attempts.map((a) => a.refund()));
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  await signIn({ id: String(user._id), sessionVersion: user.sessionVersion });
}
