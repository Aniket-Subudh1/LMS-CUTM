import 'server-only';
import { sealData, unsealData } from 'iron-session';
import { z } from 'zod';
import { db } from '@/lib/db';
import { resetEmail } from '@/lib/domain/email-templates';
import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { User } from '@/lib/models/user';
import { mailQueue } from '@/lib/queue';

// M07: `github` is the 10-minute state of linking a GitHub account (T4).
const TTL_SEC = { reset: 30 * 60, invite: 7 * 24 * 60 * 60, github: 10 * 60 } as const;
export type TokenPurpose = keyof typeof TTL_SEC;

const TokenData = z.object({ uid: z.string(), sv: z.number().int(), purpose: z.enum(['reset', 'invite', 'github']) });
export type TokenData = z.infer<typeof TokenData>;

export function createToken(data: TokenData): Promise<string> {
  return sealData(data, { password: env().SESSION_PASSWORD, ttl: TTL_SEC[data.purpose] });
}

// The page that sets a password accepts both token kinds, so an invitation and a reset share one link shape.
export async function passwordLink(data: TokenData): Promise<string> {
  const link = new URL('/reset-password', env().APP_URL);
  link.searchParams.set('token', await createToken(data));
  return link.href;
}

// Queues the reset email for one known user; callers decide who may ask and any rate limit.
export async function queueResetLink(user: { id: string; name: string; email: string; sessionVersion: number }) {
  const link = await passwordLink({ uid: user.id, sv: user.sessionVersion, purpose: 'reset' });
  await mailQueue().add('send', resetEmail({ to: user.email, name: user.name, link }), {
    jobId: `mail-reset-${user.id}-${Math.floor(Date.now() / 60_000)}`,
  });
}

// An invalid, tampered or expired token is an expected outcome, reported as null.
export async function readToken(token: string, purposes: readonly TokenPurpose[]): Promise<TokenData | null> {
  try {
    const parsed = TokenData.safeParse(await unsealData(token, { password: env().SESSION_PASSWORD }));
    return parsed.success && purposes.includes(parsed.data.purpose) ? parsed.data : null;
  } catch (error) {
    log.debug('token rejected', { error });
    return null;
  }
}

// Setting a password bumps sessionVersion, so a used (or superseded) link no longer matches its user.
export async function isTokenCurrent(data: TokenData): Promise<boolean> {
  await db();
  const user = await User.exists({ _id: data.uid, sessionVersion: data.sv, status: { $in: ['active', 'invited'] } });
  return user !== null;
}
